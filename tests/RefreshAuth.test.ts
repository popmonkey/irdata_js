import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthManager, TokenStore } from '../src/auth/AuthManager.js';
import { IRacingClient } from '../src/client.js';

describe('Auth Refresh Logic', () => {
  let auth: AuthManager;
  let client: IRacingClient;
  const mockFetch = vi.fn();

  beforeEach(() => {
    global.fetch = mockFetch;
    // Create a fresh AuthManager for each test
    auth = new AuthManager({ clientId: 'test_client' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refreshAccessToken returns false if no refresh token exists', async () => {
    const result = await auth.refreshAccessToken();
    expect(result).toBe(false);
  });

  it('refreshAccessToken successfully refreshes token', async () => {
    // Setup: Inject refresh token via private property access (cast to any)
    const tokenStore = (auth as unknown as { tokenStore: TokenStore }).tokenStore;
    tokenStore.setRefreshToken('old_refresh_token');

    // Mock fetch response for token endpoint
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({
        access_token: 'new_access_token',
        refresh_token: 'new_refresh_token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    });

    const result = await auth.refreshAccessToken();

    expect(result).toBe(true);
    expect(auth.accessToken).toBe('new_access_token');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/token'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('grant_type=refresh_token'),
      }),
    );
  });

  it('client retries request on 401', async () => {
    client = new IRacingClient({ auth: { clientId: 'test_client' } });
    const authManager = client.auth;

    // Setup: Inject refresh token
    const tokenStore = (authManager as unknown as { tokenStore: TokenStore }).tokenStore;
    tokenStore.setAccessToken('expired_token');
    tokenStore.setRefreshToken('valid_refresh_token');

    // Mock sequence:
    // 1. First API call -> 401
    // 2. Refresh call -> 200 (returns new token)
    // 3. Retry API call -> 200 (returns data)

    mockFetch
      .mockResolvedValueOnce({
        // 1. API 401
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers({ 'Content-Type': 'application/json' }),
      })
      .mockResolvedValueOnce({
        // 2. Refresh Token
        ok: true,
        json: async () => ({
          access_token: 'new_access_token',
          refresh_token: 'new_refresh_token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      })
      .mockResolvedValueOnce({
        // 3. Retry API 200
        ok: true,
        json: async () => ({ success: true }),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      });

    const result = await client.request('/some/endpoint');

    expect(result).toEqual({ success: true });

    // Check calls
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Verify retry had new token (AuthManager updates it automatically,
    // so getAuthHeaders() pick it up)
    const retryCall = mockFetch.mock.calls[2];
    const retryOptions = retryCall[1];
    expect(retryOptions.headers['Authorization']).toBe('Bearer new_access_token');
  });

  it('client throws if refresh fails after 401', async () => {
    client = new IRacingClient({ auth: { clientId: 'test_client' } });
    const authManager = client.auth;

    (authManager as unknown as { tokenStore: TokenStore }).tokenStore.setRefreshToken(
      'invalid_refresh_token',
    );

    mockFetch
      .mockResolvedValueOnce({
        // 1. API 401
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers({ 'Content-Type': 'application/json' }),
      })
      .mockResolvedValueOnce({
        // 2. Refresh Token fails
        ok: false,
        status: 400,
        headers: new Headers({ 'Content-Type': 'application/json' }),
      });

    await expect(client.request('/some/endpoint')).rejects.toThrow('Unauthorized');
  });
});
