# Gemini Context: irdata_js

This project is a JavaScript/TypeScript library for interacting with the iRacing /data API.

## Core Architecture

- **`IRacingClient` (`src/client.ts`)**: The main entry point. Orchestrates authentication and provides access to endpoint categories.
  - **`getData`**: Fetches data from API, follows S3 links, and returns `DataResult` with metadata (size, S3 status, chunk detection).
  - **Chunking**: Supports fetching large datasets split into parts via `getChunk` and `getChunks`.
- **`AuthManager` (`src/auth/AuthManager.ts`)**: Handles authentication state. Supports:
  1. **OAuth2 PKCE**: Uses `generateAuthUrl` and `handleCallback` to get an access token (for browsers).
- **`TokenStore`**: Abstracted storage for tokens. Defaults to `LocalStorageTokenStore` in browsers and `InMemoryTokenStore` in Node.js.

## Key Conventions

- **Endpoint Implementation**: New endpoints should be added as classes in `src/endpoints/`. They should use `this.client.request('/path')` to make requests.
- **Chunked Data**: When `metadata.chunksDetected` is true, use `client.getChunks(data)` to retrieve the full dataset.
- **Imports**: Use `.js` extensions in imports for ES Module compatibility (e.g., `import { ... } from './auth/AuthManager.js'`).
- **Types**: All methods should return `Promise<any>` or a specific type if defined. We are currently using `any` for many API responses, but should move towards defining interfaces for key responses.

## Authentication Details

- **Base URLs**:
  - API: `https://members-ng.iracing.com/data`
  - OAuth2: `https://oauth.iracing.com/oauth2`

## Development Workflow

- **Build**: `npm run build` (uses `tsc`).
- **Linting**: `npm run lint` (uses `eslint`).
- **Testing**: `npm test` (uses `vitest`). New features should include unit tests.
- **Dependencies**: Minimal dependencies. Uses native `fetch` and `crypto` (standard in modern Node and Browsers).
- **Proxy Server (`proxy_server.js`)**:
  - Runs on port 80 via `sudo npm run dev`.
  - Serves static files and proxies API requests to avoid CORS issues.
  - **Endpoints**:
    - `/token`: Proxies to iRacing OAuth token endpoint.
    - `/data`: Proxies to iRacing data API.
    - `/passthrough`: Proxies file downloads (S3 links).
    - Dynamic Callback: Reads `examples/auth_config.json` to determine the `redirectUri` path and redirects it to `/examples/`, preserving query parameters (auth code).
  - **Configuration (`examples/auth_config.json`)**:
    - Requires `clientId`, `redirectUri`.
    - Requires `tokenEndpoint`: `"http://127.0.0.1/token"` to use the proxy for token exchange.

## Quality Assurance

- **Linting**: Run `npm run lint` to check for issues. Run `npm run lint:fix` to automatically fix them.
- **Formatting**: Run `npm run format` to format code.
- **CI/CD**: GitHub Actions are configured in `.github/workflows/ci.yml` to run lint, test, and build on push/PR.
- **Pre-commit**: It is recommended to run lint and test before pushing.
