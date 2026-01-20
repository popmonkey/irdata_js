import { AuthManager } from './auth/AuthManager.js';
import { Members } from './endpoints/Members.js';

interface ClientConfig {
    apiUrl?: string;
    auth?: {
        clientId?: string;
        redirectUri?: string;
        authBaseUrl?: string;
        tokenEndpoint?: string;
    };
}

export class IRacingClient {
    public auth: AuthManager;
    public members: Members;
    private apiUrl: string;

    constructor(config: ClientConfig = {}) {
        this.apiUrl = config.apiUrl || 'https://members-ng.iracing.com/data';
        this.auth = new AuthManager(config.auth);
        this.members = new Members(this);
    }

    /**
     * Performs a fetch request with authentication headers.
     */
    async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        // Remove leading slash from endpoint if present to avoid double slashes if apiUrl has trailing slash
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
        const cleanApiUrl = this.apiUrl.endsWith('/') ? this.apiUrl : `${this.apiUrl}/`;
        const url = `${cleanApiUrl}${cleanEndpoint}`;
        
        const headers = this.auth.getAuthHeaders();
        
        const mergedOptions: RequestInit = {
            ...options,
            headers: {
                ...headers,
                ...options.headers,
                'Content-Type': 'application/json'
            }
        };

        const response = await fetch(url, mergedOptions);
        
        if (!response.ok) {
            if (response.status === 401) {
                // Handle token expiration / refresh logic here if needed
                throw new Error("Unauthorized");
            }
            throw new Error(`API Request failed: ${response.statusText}`);
        }

        return response.json();
    }
}
