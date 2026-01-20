// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthManager } from '../src/auth/AuthManager.js';

describe('AuthManager', () => {
    let auth: AuthManager;
    const config = {
        clientId: 'test-client',
        redirectUri: 'http://localhost/callback'
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
        // Since we are in happy-dom, it should use LocalStorageTokenStore
        const tokenStore = (auth as any).tokenStore; 
        tokenStore.setAccessToken('test-token');
        expect(auth.accessToken).toBe('test-token');
        expect(localStorage.getItem('irdata_access_token')).toBe('test-token');
    });

    it('should generate auth url and store verifier', async () => {
        const url = await auth.generateAuthUrl();
        expect(url).toContain('https://oauth.iracing.com/oauth2/authorize');
        expect(url).toContain('client_id=test-client');
        expect(sessionStorage.getItem('irdata_pkce_verifier')).toBeDefined();
    });

    it('should handle callback and exchange code for token', async () => {
        // Setup verifier in session storage (simulate pre-redirect state)
        sessionStorage.setItem('irdata_pkce_verifier', 'test-verifier');

        // Mock fetch response
        const mockResponse = {
            access_token: 'new-access-token',
            expires_in: 3600,
            token_type: 'Bearer',
            refresh_token: 'new-refresh-token'
        };

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => mockResponse
        } as Response);

        await auth.handleCallback('test-code');

        const expectedBody = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            code: 'test-code',
            code_verifier: 'test-verifier'
        }).toString();

        expect(global.fetch).toHaveBeenCalledWith(
            'https://oauth.iracing.com/oauth2/token',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ 'Content-Type': 'application/x-www-form-urlencoded' }),
                body: expectedBody
            })
        );

        expect(auth.accessToken).toBe('new-access-token');
        expect(localStorage.getItem('irdata_refresh_token')).toBe('new-refresh-token');
        expect(sessionStorage.getItem('irdata_pkce_verifier')).toBeNull();
    });
});
