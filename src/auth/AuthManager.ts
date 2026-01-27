import { PKCEHelper } from './PKCEHelper.js';
import { IRacingAPIError } from '../errors.js';

interface TokenResponse {
  access_token: string;
  expires_in: number; // seconds
  token_type: string;
  refresh_token?: string; // Not always returned?
  // Add other fields if necessary
}

export interface AuthConfig {
  clientId: string; // For OAuth
  redirectUri: string; // For OAuth
}

export interface TokenStore {
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
  private authBaseUrl: string;
  private tokenEndpoint?: string;
  private pkceVerifier: string | null = null;

  constructor(
    config: AuthConfig,
    proxySettings: { authBaseUrl?: string; tokenEndpoint?: string } = {},
  ) {
    this.config = config;
    this.authBaseUrl = proxySettings.authBaseUrl || 'https://oauth.iracing.com/oauth2';
    this.tokenEndpoint = proxySettings.tokenEndpoint;

    if (typeof window !== 'undefined' && window.localStorage) {
      this.tokenStore = new LocalStorageTokenStore();
    } else {
      this.tokenStore = new InMemoryTokenStore();
    }
  }

  get accessToken(): string | null {
    return this.tokenStore.getAccessToken();
  }

  get refreshToken(): string | null {
    return this.tokenStore.getRefreshToken();
  }

  /**
   * Manually sets the session tokens.
   * Useful for loading a saved session from external storage.
   */
  setSession(accessToken: string, refreshToken?: string) {
    this.tokenStore.setAccessToken(accessToken);
    if (refreshToken) {
      this.tokenStore.setRefreshToken(refreshToken);
    }
  }

  /**
   * Returns true if an access token is present.
   */
  get isLoggedIn(): boolean {
    return !!this.accessToken;
  }

  /**
   * Comprehensive method to establish a session.
   *
   * Automatically handles:
   * 1. Existing valid sessions (returns true immediately).
   * 2. OAuth Callback handling (exchanges code for token).
   * 3. Session restoration (uses Refresh Token).
   *
   * @returns Promise<boolean> - true if authenticated, false otherwise.
   */
  async handleAuthentication(): Promise<boolean> {
    // 1. Check if we already have a token
    if (this.isLoggedIn) {
      return true;
    }

    // 2. Check for OAuth callback (code in URL)
    try {
      await this.handleCallback();
      if (this.isLoggedIn) {
        // success! clean up the URL to avoid re-submitting the code on refresh
        if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
          const url = new URL(window.location.href);
          url.searchParams.delete('code');
          // We also remove 'iss' or 'state' if they exist usually, but 'code' is the critical one.
          window.history.replaceState({}, document.title, url.toString());
        }
        return true;
      }
    } catch (error) {
      console.warn('Authentication: Callback exchange failed', error);
      // Continue to try refresh token...
    }

    // 3. Try to refresh the session using a stored refresh token
    return await this.refreshAccessToken();
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
    } else {
      this.pkceVerifier = verifier;
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: 'iracing.auth', // Required based iRacing docs
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    return `${this.authBaseUrl}/authorize?${params.toString()}`;
  }

  async handleCallback(codeOrUrl?: string): Promise<void> {
    let input = codeOrUrl;

    // In a browser, default to the current URL if no input is provided
    if (!input && typeof window !== 'undefined') {
      input = window.location.href;
    }

    if (!input) {
      return;
    }

    let code = input;

    // if the user passes a full URL, extract the code
    if (input.includes('code=') || input.startsWith('http')) {
      try {
        const url = new URL(input);
        const extractedCode = url.searchParams.get('code');
        if (extractedCode) {
          code = extractedCode;
        } else if (input.startsWith('http')) {
          // It's a URL but no code found.
          return;
        }
      } catch {
        // Not a valid URL, assume it's the code itself or handled below
        // Fallback: try to extract code via regex if URL parsing failed
        const match = input.match(/[?&]code=([\w-]+)/);
        if (match) {
          code = match[1];
        }
      }
    }

    let verifier = '';
    if (typeof window !== 'undefined' && window.sessionStorage) {
      verifier = window.sessionStorage.getItem('irdata_pkce_verifier') || '';
      window.sessionStorage.removeItem('irdata_pkce_verifier');
    }

    if (!verifier && this.pkceVerifier) {
      verifier = this.pkceVerifier;
      this.pkceVerifier = null;
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

    const tokenUrl = this.tokenEndpoint || `${this.authBaseUrl}/token`;
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      let errorBody: unknown;
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

    const tokenUrl = this.tokenEndpoint || `${this.authBaseUrl}/token`;

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

  logout() {
    this.tokenStore.clear();
  }
}
