// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IRacingClient } from '../src/client.js';
import { TokenStore } from '../src/auth/AuthManager.js';
import { IRacingAPIError } from '../src/errors.js';

describe('IRacingClient - Error Content Type Fallback', () => {
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
    // Inject token
    (client.auth as unknown as { tokenStore: TokenStore }).tokenStore.setAccessToken('valid-token');
  });

  it('should parse error body as JSON if Content-Type is application/json', async () => {
    const errorBody = { message: 'Invalid input', code: 123 };
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => errorBody,
    } as Response);

    try {
      await client.getData('/test-error');
    } catch (error) {
      expect(error).toBeInstanceOf(IRacingAPIError);
      if (error instanceof IRacingAPIError) {
        expect(error.message).toContain('400 Bad Request');
        expect(error.body).toEqual(errorBody);
      }
    }
  });

  it('should parse error body as Text if Content-Type is text/plain', async () => {
    const errorBody = 'Plain text error';
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: new Headers({ 'Content-Type': 'text/plain' }),
      text: async () => errorBody,
    } as Response);

    try {
      await client.getData('/test-error');
    } catch (error) {
      expect(error).toBeInstanceOf(IRacingAPIError);
      if (error instanceof IRacingAPIError) {
        expect(error.body).toBe(errorBody);
      }
    }
  });

  it('should parse error body as JSON if Content-Type is missing but body is JSON', async () => {
    const errorBody = { message: 'Implicit JSON' };
    const response = new Response(JSON.stringify(errorBody), {
      status: 400,
      statusText: 'Bad Request',
    });
    response.headers.delete('Content-Type');
    global.fetch = vi.fn().mockResolvedValue(response);

    try {
      await client.getData('/test-error');
    } catch (error) {
      expect(error).toBeInstanceOf(IRacingAPIError);
      if (error instanceof IRacingAPIError) {
        expect(error.body).toEqual(errorBody);
      }
    }
  });

  it('should parse error body as Text if Content-Type is missing and body is NOT JSON', async () => {
    const errorBody = 'Implicit Text';
    const response = new Response(errorBody, {
      status: 400,
      statusText: 'Bad Request',
    });
    response.headers.delete('Content-Type');
    global.fetch = vi.fn().mockResolvedValue(response);

    try {
      await client.getData('/test-error');
    } catch (error) {
      expect(error).toBeInstanceOf(IRacingAPIError);
      if (error instanceof IRacingAPIError) {
        expect(error.body).toBe(errorBody);
      }
    }
  });
});
