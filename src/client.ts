import { AuthManager } from './auth/AuthManager.js';
import { IRacingAPIError } from './errors.js';

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

export interface ChunkInfo {
  chunk_size: number;
  num_chunks: number;
  rows: number;
  base_download_url: string;
  chunk_file_names: string[];
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
        'Content-Type': 'application/json',
      },
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
                'Content-Type': 'application/json',
              },
            };

            const retryResponse = await fetch(url, retryOptions);
            if (retryResponse.ok) {
              return retryResponse.json();
            }
            // If retry fails, use the retryResponse for error handling below
            return this.handleErrorResponse(retryResponse);
          }
        } catch (refreshError) {
          console.error('Token refresh failed during request retry:', refreshError);
          // Fall through to original 401 error handling
        }
      }

      return this.handleErrorResponse(response);
    }

    return response.json();
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    let body: unknown;
    const contentType = response.headers.get('content-type');
    try {
      if (contentType && contentType.includes('application/json')) {
        body = await response.json();
      } else {
        body = await response.text();
      }
    } catch (_e) {
      // ignore
    }

    throw new IRacingAPIError(
      `API Request failed: ${response.status} ${response.statusText}`,
      response.status,
      response.statusText,
      body,
    );
  }

  /**
   * Helper to fetch data from an external URL (e.g. S3), handling the file proxy if configured.
   */
  private async fetchExternal<T>(url: string): Promise<T> {
    let fetchUrl = url;
    if (this.fileProxyUrl) {
      // If a file proxy is configured, use it
      // e.g. http://localhost:80/passthrough?url=...
      const separator = this.fileProxyUrl.includes('?') ? '&' : '?';
      fetchUrl = `${this.fileProxyUrl}${separator}url=${encodeURIComponent(url)}`;
    }

    const response = await fetch(fetchUrl);
    if (!response.ok) {
      return this.handleErrorResponse(response);
    }
    return response.json();
  }

  /**
   * Fetches data from an endpoint, automatically following any S3 links returned.
   */
  async getData<T>(endpoint: string): Promise<T> {
    const data = await this.request<T>(endpoint);

    // Check if the response contains a generic link to S3 and follow it
    if (
      data &&
      typeof data === 'object' &&
      'link' in data &&
      typeof (data as { link?: unknown }).link === 'string'
    ) {
      const s3Link = (data as { link: string }).link;
      if (s3Link.startsWith('http')) {
        return this.fetchExternal<T>(s3Link);
      }
    }

    return data;
  }

  /**
   * Fetches a specific chunk from a response containing chunk_info.
   *
   * @param data The response object containing chunk_info
   * @param chunkIndex The index of the chunk to fetch (0-based)
   * @returns The content of the chunk (usually an array of objects)
   */
  async getChunk<T>(data: any, chunkIndex: number): Promise<T[]> {
    if (!data || !data.chunk_info) {
      throw new Error('Response does not contain chunk_info');
    }

    const chunkInfo = data.chunk_info;
    const { base_download_url, chunk_file_names } = chunkInfo;

    if (
      !base_download_url ||
      !Array.isArray(chunk_file_names) ||
      chunkIndex < 0 ||
      chunkIndex >= chunk_file_names.length
    ) {
      throw new Error(
        `Invalid chunk index: ${chunkIndex} (Total chunks: ${chunk_file_names?.length || 0})`,
      );
    }

    const chunkUrl = `${base_download_url}${chunk_file_names[chunkIndex]}`;
    return this.fetchExternal<T[]>(chunkUrl);
  }

  /**
   * Fetches multiple chunks and merges the results into a single array.
   *
   * @param data The response object containing chunk_info
   * @param options Options for fetching chunks (start index, limit count)
   * @returns A merged array of data from the requested chunks
   */
  async getChunks<T>(data: any, options: { start?: number; limit?: number } = {}): Promise<T[]> {
    if (!data || !data.chunk_info) {
      throw new Error('Response does not contain chunk_info');
    }

    const chunkInfo = data.chunk_info as ChunkInfo;
    const totalChunks = chunkInfo.chunk_file_names.length;
    const start = options.start || 0;
    const limit = options.limit || totalChunks - start;
    const end = Math.min(start + limit, totalChunks);

    if (start < 0 || start >= totalChunks) {
      throw new Error(`Invalid start index: ${start} (Total chunks: ${totalChunks})`);
    }

    const chunkPromises: Promise<T[]>[] = [];
    for (let i = start; i < end; i++) {
      chunkPromises.push(this.getChunk<T>(data, i));
    }

    const results = await Promise.all(chunkPromises);
    return results.flat();
  }
}
