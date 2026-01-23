import { AuthManager, AuthConfig } from './auth/AuthManager.js';
import { IRacingAPIError } from './errors.js';

export interface ProxyConfig {
  /**
   * The base URL for API requests.
   * **Required** when using a proxy.
   */
  apiUrl: string;
  /**
   * A proxy URL for fetching S3 files.
   * **Required** when using a proxy.
   */
  fileProxyUrl: string;
  /**
   * The specific endpoint for token exchange.
   * **Required** when using a proxy.
   */
  tokenEndpoint: string;
  /**
   * Optional base URL for OAuth authorization.
   * Defaults to 'https://oauth.iracing.com/oauth2' if not provided.
   */
  authBaseUrl?: string;
}

export interface ChunkInfo {
  chunk_size: number;
  num_chunks: number;
  rows: number;
  base_download_url: string;
  chunk_file_names: string[];
}

interface DataWithChunkInfo {
  chunk_info?: ChunkInfo;
}

export interface DataResult<T> {
  data: T;
  metadata: {
    s3LinkFollowed: boolean;
    chunkCount: number;
    chunkRows?: number;
    sizeBytes: number;
    fetchTimeMs: number;
    contentType?: string;
  };
}

export interface ChunkResult<T> {
  data: T;
  metadata: {
    sizeBytes: number;
    fetchTimeMs: number;
    contentType?: string;
  };
}

export class IRacingClient {
  public auth: AuthManager;
  private apiUrl: string;
  private fileProxyUrl?: string;

  constructor(authConfig: AuthConfig, proxyConfig?: ProxyConfig) {
    this.apiUrl = proxyConfig?.apiUrl || 'https://members-ng.iracing.com/data';
    this.fileProxyUrl = proxyConfig?.fileProxyUrl;
    this.auth = new AuthManager(authConfig, proxyConfig);
  }

  private calculateSize(response: Response, data: unknown): number {
    const cl = response.headers.get('content-length');
    if (cl) return parseInt(cl, 10);

    if (typeof data === 'string') {
      return new TextEncoder().encode(data).length;
    }

    try {
      return new TextEncoder().encode(JSON.stringify(data)).length;
    } catch {
      return 0;
    }
  }

  /**
   * Processes a fetch response based on its Content-Type.
   */
  private async processResponse<T>(
    response: Response,
  ): Promise<{ data: T; contentType: string | null }> {
    let contentType = response.headers.get('content-type');
    let data: T;

    if (contentType) {
      const lowerContentType = contentType.toLowerCase();
      // NOTE: iRacing's chunks return with 'application/octet-stream' as Content Type
      if (
        lowerContentType.includes('application/json') ||
        lowerContentType.includes('application/octet-stream')
      ) {
        data = await response.json();
        if (lowerContentType.includes('application/octet-stream')) {
          contentType = contentType.replace(/application\/octet-stream/i, 'application/json');
        }
      } else {
        data = (await response.text()) as unknown as T;
      }
    } else {
      // If no content type, try JSON, fall back to text
      const clone = response.clone();
      try {
        data = await response.json();
        contentType = 'application/json';
      } catch {
        data = (await clone.text()) as unknown as T;
        contentType = 'text/plain';
      }
    }

    return { data, contentType };
  }

  /**
   * Internal method to perform request and return data + size.
   */
  private async requestInternal<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<{ data: T; sizeBytes: number; duration: number; contentType: string | null }> {
    const startTime = Date.now();
    // Remove leading slash from endpoint if present
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

    let response = await fetch(url, mergedOptions);

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

            response = await fetch(url, retryOptions);
          }
        } catch (refreshError) {
          console.error('Token refresh failed during request retry:', refreshError);
        }
      }

      if (!response.ok) {
        return this.handleErrorResponse(response);
      }
    }

    const { data, contentType } = await this.processResponse<T>(response);
    const duration = Date.now() - startTime;
    const sizeBytes = this.calculateSize(response, data);
    return { data, sizeBytes, duration, contentType };
  }

  /**
   * Performs a fetch request with authentication headers.
   * Does NOT automatically follow "link" responses.
   */
  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const { data } = await this.requestInternal<T>(endpoint, options);
    return data;
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    let body: unknown;
    try {
      const { data } = await this.processResponse<unknown>(response);
      body = data;
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
  private async fetchExternal<T>(
    url: string,
  ): Promise<{ data: T; sizeBytes: number; duration: number; contentType: string | null }> {
    const startTime = Date.now();
    let fetchUrl = url;
    if (this.fileProxyUrl) {
      // If a file proxy is configured, use it
      const separator = this.fileProxyUrl.includes('?') ? '&' : '?';
      fetchUrl = `${this.fileProxyUrl}${separator}url=${encodeURIComponent(url)}`;
    }

    const response = await fetch(fetchUrl);
    if (!response.ok) {
      return this.handleErrorResponse(response);
    }

    const { data, contentType } = await this.processResponse<T>(response);
    const duration = Date.now() - startTime;
    const sizeBytes = this.calculateSize(response, data);
    return { data, sizeBytes, duration, contentType };
  }

  /**
   * Fetches data from an endpoint, automatically following any S3 links returned.
   * Returns metadata about the operation.
   */
  async getData<T>(endpoint: string): Promise<DataResult<T>> {
    const {
      data: initialData,
      sizeBytes: initialSize,
      duration: initialDuration,
      contentType: initialContentType,
    } = await this.requestInternal<T>(endpoint);

    // Check if the response contains a generic link to S3 and follow it
    if (
      initialData &&
      typeof initialData === 'object' &&
      'link' in initialData &&
      typeof (initialData as { link?: unknown }).link === 'string'
    ) {
      const s3Link = (initialData as { link: string }).link;
      if (s3Link.startsWith('http')) {
        const {
          data: externalData,
          sizeBytes: externalSize,
          duration: externalDuration,
          contentType: externalContentType,
        } = await this.fetchExternal<T>(s3Link);

        const chunkMetadata = this.extractChunkMetadata(externalData);

        return {
          data: externalData,
          metadata: {
            s3LinkFollowed: true,
            chunkCount: chunkMetadata.chunkCount,
            chunkRows: chunkMetadata.chunkRows,
            sizeBytes: externalSize,
            fetchTimeMs: initialDuration + externalDuration,
            contentType: externalContentType || undefined,
          },
        };
      }
    }

    const chunkMetadata = this.extractChunkMetadata(initialData);

    return {
      data: initialData,
      metadata: {
        s3LinkFollowed: false,
        chunkCount: chunkMetadata.chunkCount,
        chunkRows: chunkMetadata.chunkRows,
        sizeBytes: initialSize,
        fetchTimeMs: initialDuration,
        contentType: initialContentType || undefined,
      },
    };
  }

  private extractChunkMetadata(data: unknown): { chunkCount: number; chunkRows?: number } {
    if (data && typeof data === 'object' && 'chunk_info' in data) {
      const chunkInfo = (data as DataWithChunkInfo).chunk_info;
      if (chunkInfo) {
        return {
          chunkCount: typeof chunkInfo.num_chunks === 'number' ? chunkInfo.num_chunks : 0,
          chunkRows: typeof chunkInfo.rows === 'number' ? chunkInfo.rows : undefined,
        };
      }
    }
    return { chunkCount: 0 };
  }

  /**
   * Fetches a specific chunk from a response containing chunk_info.
   *
   * @param data The response object containing chunk_info
   * @param chunkIndex The index of the chunk to fetch (0-based)
   * @returns The content of the chunk and metadata
   */
  async getChunk<T>(data: unknown, chunkIndex: number): Promise<ChunkResult<T[]>> {
    const dataWithChunks = data as DataWithChunkInfo;
    if (!dataWithChunks || !dataWithChunks.chunk_info) {
      throw new Error('Response does not contain chunk_info');
    }

    const chunkInfo = dataWithChunks.chunk_info;
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
    const {
      data: chunkData,
      sizeBytes,
      duration,
      contentType,
    } = await this.fetchExternal<T[]>(chunkUrl);
    return {
      data: chunkData,
      metadata: {
        sizeBytes,
        fetchTimeMs: duration,
        contentType: contentType || undefined,
      },
    };
  }

  /**
   * Fetches multiple chunks and merges the results into a single array.
   *
   * @param data The response object containing chunk_info
   * @param options Options for fetching chunks (start index, limit count)
   * @returns A merged array of data from the requested chunks and total size
   */
  async getChunks<T>(
    data: unknown,
    options: { start?: number; limit?: number } = {},
  ): Promise<ChunkResult<T[]>> {
    const dataWithChunks = data as DataWithChunkInfo;
    if (!dataWithChunks || !dataWithChunks.chunk_info) {
      throw new Error('Response does not contain chunk_info');
    }

    const chunkInfo = dataWithChunks.chunk_info as ChunkInfo;
    const totalChunks = chunkInfo.chunk_file_names.length;
    const start = options.start || 0;
    const limit = options.limit || totalChunks - start;
    const end = Math.min(start + limit, totalChunks);

    if (start < 0 || start >= totalChunks) {
      throw new Error(`Invalid start index: ${start} (Total chunks: ${totalChunks})`);
    }

    const chunkPromises: Promise<ChunkResult<T[]>>[] = [];
    for (let i = start; i < end; i++) {
      chunkPromises.push(this.getChunk<T>(data, i));
    }

    const results = await Promise.all(chunkPromises);
    const mergedData = results.flatMap((r) => r.data);
    const totalSize = results.reduce((sum, r) => sum + r.metadata.sizeBytes, 0);
    const totalDuration = results.reduce((sum, r) => sum + r.metadata.fetchTimeMs, 0);

    return {
      data: mergedData,
      metadata: {
        sizeBytes: totalSize,
        fetchTimeMs: totalDuration,
      },
    };
  }
}
