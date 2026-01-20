// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Members } from '../src/endpoints/Members.js';
import { IRacingClient } from '../src/client.js';

describe('Members Endpoint', () => {
    let client: IRacingClient;
    let members: Members;

    beforeEach(() => {
        client = new IRacingClient();
        client.request = vi.fn(); // Mock the request method
        members = new Members(client);
    });

    it('should call info endpoint', async () => {
        await members.info();
        expect(client.request).toHaveBeenCalledWith('/member/info');
    });
});
