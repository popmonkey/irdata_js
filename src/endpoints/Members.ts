import { IRacingClient } from '../client.js';

export class Members {
    private client: IRacingClient;

    constructor(client: IRacingClient) {
        this.client = client;
    }

    /**
     * Gets information about the currently logged-in member.
     */
    async info(): Promise<any> {
        // The endpoint typically is /member/info
        // But the client base is /data, so /data/member/info
        // My client.request prepends /data
        return this.client.request('/member/info');
    }
}
