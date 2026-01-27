# irdata_js

A JavaScript library to interact with the iRacing /data API.

## Installation

```bash
npm install irdata_js
```

## Compatibility

- **Node.js**: v20.0.0 or newer.
- **Browsers**: Modern browsers supporting ES2022 (Chrome 100+, Firefox 100+, Safari 15.4+).

## Client Registration

Before using the library, you must register your application with iRacing to obtain a Client ID and configure your Redirect URI.

Please refer to the [official iRacing Client Registration documentation](https://oauth.iracing.com/oauth2/book/client_registration.html).

> [!NOTE]
> It may take up to **10 business days** for registration requests to be processed.

## CDN Usage

For direct usage in the browser without a build step, you can load the library via a CDN. The library is exposed as the global `irdata` variable.

```html
<script src="https://unpkg.com/irdata_js/dist/index.global.js"></script>
<script>
  const client = new irdata.IRacingClient({
    clientId: 'YOUR_CLIENT_ID',
    redirectUri: 'YOUR_REDIRECT_URI',
  });
</script>
```

## Quick Start

The library supports OAuth 2.0 authentication.

### 1. Initialize the Client

```javascript
import { IRacingClient } from 'irdata_js';

const client = new IRacingClient({
  clientId: 'YOUR_CLIENT_ID', // Required for OAuth
  redirectUri: 'YOUR_REDIRECT_URI', // Required for OAuth
});
```

### Configuration

The `IRacingClient` constructor accepts two optional configuration objects: `AuthConfig` and `ProxyConfig`.

```javascript
const authConfig = {
  clientId: 'YOUR_CLIENT_ID',
  redirectUri: 'YOUR_REDIRECT_URI',
};

const proxyConfig = {
  apiUrl: 'https://your-proxy.com/data',
  fileProxyUrl: 'https://your-proxy.com/passthrough',
  authBaseUrl: 'https://your-proxy.com/oauth2',
  tokenEndpoint: 'https://your-proxy.com/token',
};

const client = new IRacingClient(authConfig, proxyConfig);
```

#### AuthConfig

| Property      | Type     | Required | Description                                                       |
| :------------ | :------- | :------- | :---------------------------------------------------------------- |
| `clientId`    | `string` | **Yes**  | Your iRacing OAuth client ID.                                     |
| `redirectUri` | `string` | **Yes**  | The URI iRacing will redirect to after successful authentication. |

#### ProxyConfig

Since the iRacing API and S3 buckets do not support CORS, you need to use a proxy for browser-based applications. If you provide a `ProxyConfig` object, the following fields are mandatory (except `authBaseUrl`).

| Property        | Type     | Required | Description                                                                                         |
| :-------------- | :------- | :------- | :-------------------------------------------------------------------------------------------------- |
| `apiUrl`        | `string` | **Yes**  | The base URL for API requests.                                                                      |
| `fileProxyUrl`  | `string` | **Yes**  | A proxy URL for fetching S3 files. The original S3 URL will be appended as a `url` query parameter. |
| `tokenEndpoint` | `string` | **Yes**  | The specific endpoint for token exchange.                                                           |
| `authBaseUrl`   | `string` | No       | The base URL for OAuth authorization. Defaults to `https://oauth.iracing.com/oauth2`.               |

### 2. Authentication

#### Web / Browser (OAuth 2.0 PKCE)

To authenticate in the browser, you need to generate an authorization URL, redirect the user, and then handle the return.

**Step 1: Generate Auth URL and Redirect**

```javascript
const url = await client.auth.generateAuthUrl();
window.location.href = url;
```

**Step 2: Handle Return & Restore Session**

Simply call `handleAuthentication()` on every page that uses the library. This single method handles:
- Exchanging the authorization code (when returning from the iRacing login page).
- Refreshing the access token (if a refresh token is stored).
- Verifying an existing session.

```javascript
// This should run on every page load of your application, 
// including the redirectUri page.
const isAuthenticated = await client.auth.handleAuthentication();
```

#### Manual Session Management

If you have obtained an access token (and refresh token) through other means (e.g., server-side authentication), you can manually set the session on the client.

```javascript
// Set the access token (and optional refresh token)
client.auth.setSession('YOUR_ACCESS_TOKEN', 'YOUR_REFRESH_TOKEN');
```

### 3. Fetch Data

Once authenticated, you can call any endpoint using `getData`. This method handles authentication headers, automatically follows S3 links if returned by the API, and provides metadata about the response.

```javascript
try {
  // Call an endpoint directly
  const { data, metadata } = await client.getData('/member/info');

  console.log(data); // The actual API response
  console.log(metadata.contentType); // Response content type (e.g. 'application/json')
  console.log(metadata.sizeBytes); // Response size in bytes
  console.log(metadata.fetchTimeMs); // Fetch duration in milliseconds
  console.log(metadata.chunkCount); // Number of chunks (0 if not chunked)
  console.log(metadata.chunkRows); // Total rows across all chunks (valid if chunkCount > 0)
} catch (error) {
  console.error('Failed to fetch member info:', error);
}
```

### 4. Handling Large Datasets (Chunks)

Some iRacing endpoints (like large result sets) return data in multiple "chunks" hosted on S3. When `metadata.chunkCount` is greater than 0, you can use the library to fetch the rest of the data.

#### Fetch all chunks at once

```javascript
const result = await client.getData('/results/get');

if (result.metadata.chunkCount > 0) {
  // Fetch and merge all chunks into a single array
  const { data: allResults } = await client.getChunks(result.data);
  console.log('Total results:', allResults.length);
}
```

#### Fetch chunks individually (Pagination)

For extremely large datasets, you might want to fetch chunks one by one:

```javascript
if (result.metadata.chunkCount > 0) {
  const totalChunks = result.metadata.chunkCount;

  for (let i = 0; i < totalChunks; i++) {
    const { data: chunk } = await client.getChunk(result.data, i);
    console.log(`Processing chunk ${i + 1}/${totalChunks}`);
  }
}
```

> **Note:** iRacing's API incorrectly returns `application/octet-stream` as the `Content-Type` for JSON chunks. This library automatically detects and parses these as JSON.

## The Proxy Requirement (CORS)

The iRacing API (`members-ng.iracing.com`) and its associated S3 data links do not provide CORS (`Cross-Origin Resource Sharing`) headers for third-party domains. This means that direct requests from a web browser to the API will be blocked by the browser's security policies.

This behavior is intentional by iRacing to better protect their business and operations and is unlikely to change (see [this message by their head of operations](https://forums.iracing.com/discussion/comment/772334/#Comment_772334)).

To use this library in a web application, you must route your requests through a proxy server that adds the necessary CORS headers or resides on the same domain as your application.

For development and as a reference implementation, this repository includes a `proxy_server.js` that demonstrates how to implement such a workaround. See the [Development](#development) section for more details on how to use it.

## Development

### Build

```bash
npm run build
```

### Manual Verification (OAuth Flow)

This repository includes a local development proxy server and a demo application to test the OAuth flow and API interaction, avoiding CORS issues during development.

1.  Create a file named `config.json` in the `demo/` directory (ignored by git) with your configuration. See the [Configuration](#configuration) section for details on the `ProxyConfig` and `AuthConfig` structures which map to this JSON file.

    **Example `demo/config.json`:**

    ```json
    {
      "port": 80,
      "basePath": "/irdata_js",
      "redirectPath": "/irdata_js/callback",
      "auth": {
        "clientId": "YOUR_CLIENT_ID",
        "redirectUri": "http://127.0.0.1/irdata_js/callback",
        "tokenEndpoint": "http://127.0.0.1/irdata_js/token"
      }
    }
    ```

2.  Start the proxy server:

    ```bash
    npm run dev
    ```

    _This command automatically generates the `demo/index.html` from the template using your configuration and starts the proxy server._
    _Depending on your system configuration, you might need elevated privileges (e.g., `sudo`) to listen on port 80._

3.  Open `http://127.0.0.1/irdata_js/` (or your configured `basePath`) in your browser.
    - The demo app is configured to use the local proxy endpoints (e.g., `/irdata_js/token`, `/irdata_js/data`, `/irdata_js/passthrough`) to bypass CORS restrictions.

## License

MIT
