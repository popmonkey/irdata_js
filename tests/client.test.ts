// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IRacingClient } from '../src/client.js';

describe('IRacingClient', () => {
    let client: IRacingClient;

    beforeEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
        client = new IRacingClient({
            auth: {
                clientId: 'test',
                redirectUri: 'test'
            }
        });
    });

    it('should initialize', () => {
        expect(client).toBeDefined();
        expect(client.auth).toBeDefined();
        expect(client.members).toBeDefined();
    });

    it('should make request with auth headers', async () => {
        // Manually inject a token
        (client.auth as any).tokenStore.setAccessToken('valid-token');

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: true })
        } as Response);

        const result = await client.request('/test-endpoint');

        expect(result).toEqual({ success: true });
        expect(global.fetch).toHaveBeenCalledWith(
            'https://members-ng.iracing.com/data/test-endpoint',
            expect.objectContaining({
                headers: expect.objectContaining({
                    'Authorization': 'Bearer valid-token',
                    'Content-Type': 'application/json'
                })
            })
        );
    });

    it('should handle 401 unauthorized', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            statusText: 'Unauthorized'
        } as Response);

        await expect(client.request('/test')).rejects.toThrow('Unauthorized');
    });
});
