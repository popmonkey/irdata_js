// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IRacingClient } from '../src/client.js';
import { TokenStore } from '../src/auth/AuthManager.js';

describe('IRacingClient - Content Type Detection', () => {
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

  it('should detect JSON content when Content-Type header is missing', async () => {
    (client.auth as unknown as { tokenStore: TokenStore }).tokenStore.setAccessToken('valid-token');

    const responseData = JSON.stringify({ success: true, from: 'json-detection' });
    const response = new Response(responseData, {
      status: 200,
    });
    response.headers.delete('Content-Type'); // Ensure no content type is set by default
    global.fetch = vi.fn().mockResolvedValue(response);

    const result = await client.getData('/test-missing-content-type');

    // Expectation: The client should successfully parse the JSON
    expect(result.data).toEqual({ success: true, from: 'json-detection' });

    // Expectation: The client should set metadata.contentType to 'application/json'
    expect(result.metadata.contentType).toBe('application/json');
  });

  it('should treat content as text when not valid JSON and Content-Type header is missing', async () => {
    (client.auth as unknown as { tokenStore: TokenStore }).tokenStore.setAccessToken('valid-token');

    const rawText = 'This is just plain text';
    const response = new Response(rawText, {
      status: 200,
    });
    response.headers.delete('Content-Type'); // Ensure no content type is set by default
    global.fetch = vi.fn().mockResolvedValue(response);

    const result = await client.getData('/test-text-content');

    expect(result.data).toBe(rawText);
    expect(result.metadata.contentType).toBe('text/plain');
  });

  it('should respect text/csv Content-Type and return text', async () => {
    (client.auth as unknown as { tokenStore: TokenStore }).tokenStore.setAccessToken('valid-token');

    const csvData = 'header1,header2\nvalue1,value2';
    const response = new Response(csvData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
      },
    });
    global.fetch = vi.fn().mockResolvedValue(response);

    const result = await client.getData('/test-csv-content');

    expect(result.data).toBe(csvData);
    expect(result.metadata.contentType).toBe('text/csv');
  });

  it('should respect text/plain even if content looks like JSON', async () => {
    (client.auth as unknown as { tokenStore: TokenStore }).tokenStore.setAccessToken('valid-token');

    const jsonText = '{"a": 1}';
    const response = new Response(jsonText, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
    global.fetch = vi.fn().mockResolvedValue(response);

    const result = await client.getData('/test-json-as-text');

    expect(typeof result.data).toBe('string');
    expect(result.data).toBe(jsonText);
    expect(result.metadata.contentType).toBe('text/plain');
  });

  it('should treat application/octet-stream as JSON (this is an iRacing bug)', async () => {
    (client.auth as unknown as { tokenStore: TokenStore }).tokenStore.setAccessToken('valid-token');

    const responseData = JSON.stringify({ success: true, from: 'octet-stream-json' });
    const response = new Response(responseData, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    });
    global.fetch = vi.fn().mockResolvedValue(response);

    const result = await client.getData('/test-octet-stream');

    expect(result.data).toEqual({ success: true, from: 'octet-stream-json' });
    expect(result.metadata.contentType).toBe('application/json');
  });

  it('should preserve charset when normalizing application/octet-stream', async () => {
    (client.auth as unknown as { tokenStore: TokenStore }).tokenStore.setAccessToken('valid-token');

    const responseData = JSON.stringify({ success: true });
    const response = new Response(responseData, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream; charset=utf-8',
      },
    });
    global.fetch = vi.fn().mockResolvedValue(response);

    const result = await client.getData('/test-octet-stream-charset');

    expect(result.data).toEqual({ success: true });
    expect(result.metadata.contentType).toBe('application/json; charset=utf-8');
  });
});
