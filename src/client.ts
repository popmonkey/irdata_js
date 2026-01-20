import { AuthManager } from './auth/AuthManager.js';

interface ClientConfig {
    apiUrl?: string;
    fileProxyUrl?: string;
    auth?: {
        clientId?: string;
        redirectUri?: string;
        authBaseUrl?: string;
        tokenEndpoint?: string;
    };
}

export class IRacingClient {
    public auth: AuthManager;
    private apiUrl: string;
    private fileProxyUrl?: string;

    constructor(config: ClientConfig = {}) {
        this.apiUrl = config.apiUrl || 'https://members-ng.iracing.com/data';
        this.fileProxyUrl = config.fileProxyUrl;
        this.auth = new AuthManager(config.auth);
    }

    /**
     * Performs a fetch request with authentication headers.
     * Does NOT automatically follow "link" responses.
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
                // Try to refresh token
                try {
                    const refreshed = await this.auth.refreshAccessToken();
                    if (refreshed) {
                        // Retry request with new token
                        const newHeaders = this.auth.getAuthHeaders();
                        const retryOptions: RequestInit = {
                            ...options,
                            headers: {
                                ...newHeaders,
                                ...options.headers,
                                'Content-Type': 'application/json'
                            }
                        };
                        
                        const retryResponse = await fetch(url, retryOptions);
                        if (retryResponse.ok) {
                            return retryResponse.json();
                        }
                        // If retry fails, fall through to error handling
                    }
                } catch (refreshError) {
                    console.error("Token refresh failed during request retry:", refreshError);
                    // Fall through to original 401 error
                }
                
                throw new Error("Unauthorized");
            }
            throw new Error(`API Request failed: ${response.statusText}`);
        }

        return response.json();
    }

    /**
     * Fetches data from an endpoint, automatically following any S3 links returned.
     */
    async getData<T>(endpoint: string): Promise<T> {
        const data = await this.request<any>(endpoint);

        // Check if the response contains a generic link to S3 and follow it
        if (data && typeof data === 'object' && typeof data.link === 'string' && data.link.startsWith('http')) {
            // Fetch the S3 link without original auth headers
            let fetchUrl = data.link;
            if (this.fileProxyUrl) {
                // If a file proxy is configured, use it
                // e.g. http://localhost:80/passthrough?url=...
                const separator = this.fileProxyUrl.includes('?') ? '&' : '?';
                fetchUrl = `${this.fileProxyUrl}${separator}url=${encodeURIComponent(data.link)}`;
            }

            const linkResponse = await fetch(fetchUrl);
            if (!linkResponse.ok) {
                throw new Error(`Failed to fetch data from link: ${linkResponse.statusText}`);
            }
            return linkResponse.json();
        }

        return data;
    }
}
