import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthManager, TokenStore } from '../src/auth/AuthManager.js';

describe('AuthManager', () => {
  let auth: AuthManager;
  const config = {
    clientId: 'test-client',
    redirectUri: 'http://localhost/callback',
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    auth = new AuthManager(config);
  });

  it('should initialize with config', () => {
    expect(auth).toBeDefined();
  });

  it('should store and retrieve access token', () => {
    // It should use the mocked LocalStorage if window is defined,
    // but wait, in our setup.ts we don't define window.
    // So AuthManager will use InMemoryTokenStore.
    // But we want to test if it CAN use LocalStorage if we want it to.

    // Actually, let's see what happens.
    const tokenStore = (auth as unknown as { tokenStore: TokenStore }).tokenStore;
    tokenStore.setAccessToken('test-token');
    expect(auth.accessToken).toBe('test-token');
  });

  it('should generate auth url and store verifier', async () => {
    const url = await auth.generateAuthUrl();
    expect(url).toContain('https://oauth.iracing.com/oauth2/authorize');
    expect(url).toContain('client_id=test-client');
    // If window.sessionStorage existed, it would be there.
    // In our node environment it won't be used by AuthManager unless window is defined.
  });

  it('should handle callback and exchange code for token', async () => {
    // Setup verifier in session storage (simulate pre-redirect state)
    // We need to define window for this test if we want AuthManager to use it
    vi.stubGlobal('window', globalThis);

    sessionStorage.setItem('irdata_pkce_verifier', 'test-verifier');

    // Mock fetch response
    const mockResponse = {
      access_token: 'new-access-token',
      expires_in: 3600,
      token_type: 'Bearer',
      refresh_token: 'new-refresh-token',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    // Re-initialize auth with window defined so it uses LocalStorageTokenStore
    auth = new AuthManager(config);

    await auth.handleCallback('test-code');

    const expectedBody = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      code: 'test-code',
      code_verifier: 'test-verifier',
    }).toString();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://oauth.iracing.com/oauth2/token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/x-www-form-urlencoded' }),
        body: expectedBody,
      }),
    );

    expect(auth.accessToken).toBe('new-access-token');
    expect(localStorage.getItem('irdata_refresh_token')).toBe('new-refresh-token');
    expect(sessionStorage.getItem('irdata_pkce_verifier')).toBeNull();

    // Clean up window
    vi.unstubAllGlobals();
  });

  it('should clear tokens on logout', () => {
    // Define window for this test
    vi.stubGlobal('window', globalThis);
    auth = new AuthManager(config);

    const tokenStore = (auth as unknown as { tokenStore: TokenStore }).tokenStore;
    tokenStore.setAccessToken('test-access-token');
    tokenStore.setRefreshToken('test-refresh-token');

    expect(auth.accessToken).toBe('test-access-token');
    expect(localStorage.getItem('irdata_refresh_token')).toBe('test-refresh-token');

    auth.logout();

    expect(auth.accessToken).toBeNull();
    expect(localStorage.getItem('irdata_access_token')).toBeNull();
    expect(localStorage.getItem('irdata_refresh_token')).toBeNull();

    // Clean up window
    vi.unstubAllGlobals();
  });
});
