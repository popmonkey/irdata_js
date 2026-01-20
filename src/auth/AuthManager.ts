import { PKCEHelper } from './PKCEHelper.js';
import { IRacingAPIError } from '../errors.js';

interface TokenResponse {
  access_token: string;
  expires_in: number; // seconds
  token_type: string;
  refresh_token?: string; // Not always returned?
  // Add other fields if necessary
}

interface AuthConfig {
  clientId?: string; // For OAuth
  redirectUri?: string; // For OAuth
  authBaseUrl?: string;
  tokenEndpoint?: string;
}

interface TokenStore {
  getAccessToken(): string | null;
  setAccessToken(token: string): void;
  getRefreshToken(): string | null;
  setRefreshToken(token: string): void;
  clear(): void;
}

class InMemoryTokenStore implements TokenStore {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  getAccessToken() {
    return this.accessToken;
  }
  setAccessToken(token: string) {
    this.accessToken = token;
  }
  getRefreshToken() {
    return this.refreshToken;
  }
  setRefreshToken(token: string) {
    this.refreshToken = token;
  }
  clear() {
    this.accessToken = null;
    this.refreshToken = null;
  }
}

class LocalStorageTokenStore implements TokenStore {
  private prefix = 'irdata_';
  getAccessToken() {
    return localStorage.getItem(this.prefix + 'access_token');
  }
  setAccessToken(token: string) {
    localStorage.setItem(this.prefix + 'access_token', token);
  }
  getRefreshToken() {
    return localStorage.getItem(this.prefix + 'refresh_token');
  }
  setRefreshToken(token: string) {
    localStorage.setItem(this.prefix + 'refresh_token', token);
  }
  clear() {
    localStorage.removeItem(this.prefix + 'access_token');
    localStorage.removeItem(this.prefix + 'refresh_token');
  }
}

export class AuthManager {
  private tokenStore: TokenStore;
  private config: AuthConfig;
  private baseUrl = 'https://oauth.iracing.com/oauth2';

  constructor(config: AuthConfig = {}) {
    this.config = config;
    this.baseUrl = config.authBaseUrl || 'https://oauth.iracing.com/oauth2';
    if (typeof window !== 'undefined' && window.localStorage) {
      this.tokenStore = new LocalStorageTokenStore();
    } else {
      this.tokenStore = new InMemoryTokenStore();
    }
  }

  get accessToken(): string | null {
    return this.tokenStore.getAccessToken();
  }

  getAuthHeaders(): HeadersInit {
    const headers: HeadersInit = {};
    const token = this.tokenStore.getAccessToken();

    if (token) {
      // OAuth2 Bearer Token
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  // --- Browser OAuth2 PKCE ---

  async generateAuthUrl(): Promise<string> {
    if (!this.config.clientId || !this.config.redirectUri) {
      throw new Error('clientId and redirectUri required for OAuth');
    }

    const verifier = PKCEHelper.generateVerifier();
    const challenge = await PKCEHelper.generateChallenge(verifier);

    // Store verifier for the callback
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem('irdata_pkce_verifier', verifier);
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: 'iracing.auth', // Required based iRacing docs
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    return `${this.baseUrl}/authorize?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<void> {
    let verifier = '';
    if (typeof window !== 'undefined' && window.sessionStorage) {
      verifier = window.sessionStorage.getItem('irdata_pkce_verifier') || '';
      window.sessionStorage.removeItem('irdata_pkce_verifier');
    }

    if (!verifier) {
      throw new Error('No PKCE verifier found');
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.config.clientId!,
      redirect_uri: this.config.redirectUri!,
      code: code,
      code_verifier: verifier,
    });

    const tokenUrl = this.config.tokenEndpoint || `${this.baseUrl}/token`;
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      let errorBody: any;
      try {
        errorBody = await response.json();
      } catch (_e) {
        try {
          errorBody = await response.text();
        } catch (_e2) {
          /* ignore */
        }
      }
      throw new IRacingAPIError(
        `Failed to exchange code for token: ${response.status} ${response.statusText}`,
        response.status,
        response.statusText,
        errorBody,
      );
    }

    const tokens: TokenResponse = await response.json();
    this.tokenStore.setAccessToken(tokens.access_token);
    if (tokens.refresh_token) {
      this.tokenStore.setRefreshToken(tokens.refresh_token);
    }
  }

  async refreshAccessToken(): Promise<boolean> {
    const refreshToken = this.tokenStore.getRefreshToken();
    if (!refreshToken) {
      return false;
    }

    if (!this.config.clientId) {
      throw new Error('clientId required for token refresh');
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.config.clientId,
      refresh_token: refreshToken,
    });

    const tokenUrl = this.config.tokenEndpoint || `${this.baseUrl}/token`;

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!response.ok) {
        // If refresh fails (e.g. token expired), clear tokens to force re-login
        this.tokenStore.clear();
        return false;
      }

      const tokens: TokenResponse = await response.json();
      this.tokenStore.setAccessToken(tokens.access_token);
      // Update refresh token if a new one is returned
      if (tokens.refresh_token) {
        this.tokenStore.setRefreshToken(tokens.refresh_token);
      }
      return true;
    } catch (error) {
      console.error('Error refreshing token:', error);
      return false;
    }
  }
}
