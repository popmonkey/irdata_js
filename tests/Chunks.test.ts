import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IRacingClient } from '../src/client.js';

describe('IRacingClient Chunks', () => {
  let client: IRacingClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = new IRacingClient({
      auth: {
        clientId: 'test',
        redirectUri: 'test',
      },
    });
  });

  const mockChunkResponse = {
    chunk_info: {
      base_download_url: 'https://s3.example.com/chunks/',
      chunk_file_names: ['chunk1.json', 'chunk2.json'],
      chunk_size: 500,
      num_chunks: 2,
      rows: 1000,
    },
  };

  it('should fetch a specific chunk', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => [{ id: 1, name: 'Driver 1' }],
    } as Response);
    global.fetch = fetchMock;

    const chunkData = await client.getChunk(mockChunkResponse, 0);

    expect(chunkData.data).toEqual([{ id: 1, name: 'Driver 1' }]);
    expect(fetchMock).toHaveBeenCalledWith('https://s3.example.com/chunks/chunk1.json');
  });

  it('should fetch the second chunk', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => [{ id: 501, name: 'Driver 501' }],
    } as Response);
    global.fetch = fetchMock;

    const chunkData = await client.getChunk(mockChunkResponse, 1);

    expect(chunkData.data).toEqual([{ id: 501, name: 'Driver 501' }]);
    expect(fetchMock).toHaveBeenCalledWith('https://s3.example.com/chunks/chunk2.json');
  });

  it('should throw error for invalid chunk index', async () => {
    await expect(client.getChunk(mockChunkResponse, -1)).rejects.toThrow('Invalid chunk index');
    await expect(client.getChunk(mockChunkResponse, 2)).rejects.toThrow('Invalid chunk index');
  });

  it('should throw error if response does not contain chunk_info', async () => {
    await expect(client.getChunk({}, 0)).rejects.toThrow('Response does not contain chunk_info');
  });

  it('should use fileProxyUrl for chunks if configured', async () => {
    const proxyClient = new IRacingClient({
      fileProxyUrl: 'http://localhost:8080/passthrough',
      auth: { clientId: 'test', redirectUri: 'test' },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => [],
    } as Response);
    global.fetch = fetchMock;

    await proxyClient.getChunk(mockChunkResponse, 0);

    const expectedUrl =
      'http://localhost:8080/passthrough?url=' +
      encodeURIComponent('https://s3.example.com/chunks/chunk1.json');
    expect(fetchMock).toHaveBeenCalledWith(expectedUrl);
  });

  it('should fetch and merge multiple chunks', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => [{ id: 1 }],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => [{ id: 2 }],
      } as Response);
    global.fetch = fetchMock;

    const results = await client.getChunks(mockChunkResponse);

    expect(results.data).toEqual([{ id: 1 }, { id: 2 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith('https://s3.example.com/chunks/chunk1.json');
    expect(fetchMock).toHaveBeenCalledWith('https://s3.example.com/chunks/chunk2.json');
  });

  it('should fetch a subset of chunks', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => [{ id: 1 }],
    } as Response);
    global.fetch = fetchMock;

    const results = await client.getChunks(mockChunkResponse, { start: 0, limit: 1 });

    expect(results.data).toEqual([{ id: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://s3.example.com/chunks/chunk1.json');
  });

  it('should include fetchTimeMs in chunk results', async () => {
    // Simulate delay
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    global.fetch = vi.fn().mockImplementation(async () => {
      await delay(10);
      return {
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => [{ id: 1 }],
      } as Response;
    });

    const chunkData = await client.getChunk(mockChunkResponse, 0);
    expect(chunkData.metadata.fetchTimeMs).toBeGreaterThan(0);

    const chunksData = await client.getChunks(mockChunkResponse, { limit: 2 });
    // Should be approx 20ms (10ms per chunk * 2 chunks)
    expect(chunksData.metadata.fetchTimeMs).toBeGreaterThan(0);
  });
});
