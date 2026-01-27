import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
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

  it('should allow setting session manually and retrieving refresh token', () => {
    auth.setSession('manual-access-token', 'manual-refresh-token');
    expect(auth.accessToken).toBe('manual-access-token');
    expect(auth.refreshToken).toBe('manual-refresh-token');
    expect(auth.isLoggedIn).toBe(true);
  });

  it('should allow setting session without refresh token', () => {
    auth.setSession('only-access-token');
    expect(auth.accessToken).toBe('only-access-token');
    expect(auth.refreshToken).toBeNull();
    expect(auth.isLoggedIn).toBe(true);
  });

  it('should use proxy authBaseUrl if provided', async () => {
    const proxyConfig = { authBaseUrl: 'https://proxy.com/auth' };
    auth = new AuthManager(config, proxyConfig);
    const url = await auth.generateAuthUrl();
    expect(url).toContain('https://proxy.com/auth/authorize');
  });

  describe('handleCallback URL and no-arg handling', () => {
    beforeEach(() => {
      vi.stubGlobal('window', {
        ...globalThis,
        location: {
          href: 'http://localhost/callback?code=url-code',
          search: '?code=url-code',
        },
        sessionStorage: {
          getItem: vi.fn().mockReturnValue('test-verifier'),
          removeItem: vi.fn(),
          setItem: vi.fn(),
        },
        localStorage: {
          getItem: vi.fn(),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      });

      // Mock fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'token-from-url' }),
      } as Response);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should extract code from a full URL', async () => {
      auth = new AuthManager(config);
      await auth.handleCallback('http://localhost/callback?code=extracted-code');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('code=extracted-code'),
        }),
      );
    });

    it('should use window.location.href when no argument is provided', async () => {
      auth = new AuthManager(config);
      await auth.handleCallback();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('code=url-code'),
        }),
      );
    });

    it('should return early if URL has no code', async () => {
      vi.stubGlobal('window', {
        ...globalThis,
        location: {
          href: 'http://localhost/home',
          search: '',
        },
      });

      auth = new AuthManager(config);
      await auth.handleCallback();

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return early if input is empty', async () => {
      // Temporarily remove window to test non-browser environment
      vi.stubGlobal('window', undefined);

      auth = new AuthManager(config);
      await auth.handleCallback();

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('handleAuthentication', () => {
    beforeEach(() => {
      vi.stubGlobal('document', { title: 'Test Page' });
      vi.stubGlobal('window', {
        ...globalThis,
        location: {
          href: 'http://localhost/callback?code=valid-code',
          search: '?code=valid-code',
        },
        history: {
          replaceState: vi.fn(),
        },
        sessionStorage: {
          getItem: vi.fn().mockReturnValue('verifier'),
          removeItem: vi.fn(),
        },
        localStorage: {
          getItem: vi.fn(),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      });

      // Mock fetch for token exchange
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'new-token' }),
      } as Response);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should handle callback and clean URL', async () => {
      auth = new AuthManager(config);
      const result = await auth.handleAuthentication();

      expect(result).toBe(true);
      expect(auth.isLoggedIn).toBe(true);

      // Verify URL cleanup
      expect(window.history.replaceState).toHaveBeenCalledWith(
        {},
        expect.anything(),
        expect.stringMatching(/^http:\/\/localhost\/callback/),
      );
      // Ensure 'code' parameter is removed in the new URL
      const newUrl = (window.history.replaceState as Mock).mock.calls[0][2];
      expect(newUrl).not.toContain('code=');
    });
  });
});
