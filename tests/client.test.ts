// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IRacingClient } from '../src/client.js';
import { TokenStore } from '../src/auth/AuthManager.js';

describe('IRacingClient', () => {
  let client: IRacingClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    client = new IRacingClient({
      auth: {
        clientId: 'test',
        redirectUri: 'test',
      },
    });
  });

  it('should initialize', () => {
    expect(client).toBeDefined();
    expect(client.auth).toBeDefined();
  });

  it('should make request with auth headers', async () => {
    // Manually inject a token
    (client.auth as unknown as { tokenStore: TokenStore }).tokenStore.setAccessToken('valid-token');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ success: true }),
    } as Response);

    const result = await client.request('/test-endpoint');

    expect(result).toEqual({ success: true });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://members-ng.iracing.com/data/test-endpoint',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer valid-token',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('should handle 401 unauthorized', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({}),
    } as Response);

    await expect(client.request('/test')).rejects.toThrow('Unauthorized');
  });

  it('should dereference S3 links automatically', async () => {
    (client.auth as unknown as { tokenStore: TokenStore }).tokenStore.setAccessToken('valid-token');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({ link: 'https://s3.example.com/data' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({ actual: 'data' }),
      } as Response);

    global.fetch = fetchMock;

    const result = await client.getData('/test-link');

    expect(result.data).toEqual({ actual: 'data' });
    expect(result.metadata.s3LinkFollowed).toBe(true);
    expect(result.metadata.chunkCount).toBe(0);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://members-ng.iracing.com/data/test-link',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer valid-token',
        }),
      }),
    );

    // The second call should use the link URL and NOT include the original Authorization header
    const secondCallArgs = fetchMock.mock.calls[1];
    expect(secondCallArgs[0]).toBe('https://s3.example.com/data');
    // We expect no options or at least no headers with Authorization
    if (secondCallArgs[1] && secondCallArgs[1].headers) {
      expect(
        (secondCallArgs[1].headers as Record<string, string>)['Authorization'],
      ).toBeUndefined();
    }
  });

  it('should return link object without dereferencing in raw request', async () => {
    (client.auth as unknown as { tokenStore: TokenStore }).tokenStore.setAccessToken('valid-token');

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ link: 'https://s3.example.com/data' }),
    } as Response);

    global.fetch = fetchMock;

    const result = await client.request('/test-link');

    expect(result).toEqual({ link: 'https://s3.example.com/data' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should use fileProxyUrl when dereferencing S3 links if configured', async () => {
    const proxyClient = new IRacingClient({
      fileProxyUrl: 'http://localhost:8080/passthrough',
      auth: { clientId: 'test', redirectUri: 'test' },
    });
    (proxyClient.auth as unknown as { tokenStore: TokenStore }).tokenStore.setAccessToken(
      'valid-token',
    );

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({ link: 'https://s3.example.com/data' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({ actual: 'data' }),
      } as Response);

    global.fetch = fetchMock;

    const result = await proxyClient.getData('/test-link');

    expect(result.data).toEqual({ actual: 'data' });
    expect(result.metadata.s3LinkFollowed).toBe(true);

    // The second call should use the proxy URL
    const secondCallArgs = fetchMock.mock.calls[1];
    const expectedUrl =
      'http://localhost:8080/passthrough?url=' + encodeURIComponent('https://s3.example.com/data');
    expect(secondCallArgs[0]).toBe(expectedUrl);
  });

  it('should detect chunks and return chunk count', async () => {
    (client.auth as unknown as { tokenStore: TokenStore }).tokenStore.setAccessToken('valid-token');

    const chunkData = {
      chunk_info: {
        base_download_url: 'http://s3.com/',
        chunk_file_names: ['1', '2', '3'],
        num_chunks: 3,
        rows: 100,
        chunk_size: 100,
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => chunkData,
    } as Response);

    const result = await client.getData('/chunked-data');

    expect(result.data).toEqual(chunkData);
    expect(result.metadata.chunkCount).toBe(3);
    expect(result.metadata.chunkRows).toBe(100);
    expect(result.metadata.s3LinkFollowed).toBe(false);
  });

  it('should include fetchTimeMs in metadata', async () => {
    (client.auth as unknown as { tokenStore: TokenStore }).tokenStore.setAccessToken('valid-token');

    // Simulate a delay
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    global.fetch = vi.fn().mockImplementation(async () => {
      await delay(20);
      return {
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({ success: true }),
      } as Response;
    });

    const result = await client.getData('/test-timing');

    expect(result.metadata.fetchTimeMs).toBeGreaterThanOrEqual(20);
    expect(typeof result.metadata.fetchTimeMs).toBe('number');
  });

  it('should include contentType in metadata', async () => {
    (client.auth as unknown as { tokenStore: TokenStore }).tokenStore.setAccessToken('valid-token');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json; charset=utf-8' }),
      json: async () => ({ success: true }),
    } as Response);

    const result = await client.getData('/test-content-type');

    expect(result.metadata.contentType).toBe('application/json; charset=utf-8');
  });
});
