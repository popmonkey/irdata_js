# Gemini Context: irdata_js

This project is a JavaScript/TypeScript library for interacting with the iRacing /data API.

## Core Architecture

- **`IRacingClient` (`src/client.ts`)**: The main entry point. Orchestrates authentication and provides access to endpoint categories.
- **`AuthManager` (`src/auth/AuthManager.ts`)**: Handles authentication state. Supports:
    1. **OAuth2 PKCE**: Uses `generateAuthUrl` and `handleCallback` to get an access token (for browsers).
- **`TokenStore`**: Abstracted storage for tokens. Defaults to `LocalStorageTokenStore` in browsers and `InMemoryTokenStore` in Node.js.
- **Endpoints (`src/endpoints/`)**: Grouped API methods (e.g., `Members`). Each endpoint class receives a reference to the `IRacingClient` to perform authenticated requests.

## Key Conventions

- **Endpoint Implementation**: New endpoints should be added as classes in `src/endpoints/`. They should use `this.client.request('/path')` to make requests.
- **Imports**: Use `.js` extensions in imports for ES Module compatibility (e.g., `import { ... } from './auth/AuthManager.js'`).
- **Types**: All methods should return `Promise<any>` or a specific type if defined. We are currently using `any` for many API responses, but should move towards defining interfaces for key responses.

## Authentication Details

- **Base URLs**:
    - API: `https://members-ng.iracing.com/data`
    - OAuth2: `https://oauth.iracing.com/oauth2`

## Development Workflow

- **Build**: `npm run build` (uses `tsc`).
- **Testing**: No tests currently implemented. New features should include unit tests if possible.
- **Dependencies**: Minimal dependencies. Uses native `fetch` and `crypto` (standard in modern Node and Browsers).

## Current Status

- Initial skeleton implemented with `Members.info` support.
- PKCE flow implemented in `PKCEHelper`.
- Basic `AuthManager` logic for token-based auth.