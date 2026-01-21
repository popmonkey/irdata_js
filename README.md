# irdata_js

JavaScript library to interact with the iRacing /data API.

## Installation

```bash
npm install irdata_js
```

## Quick Start

The library supports OAuth 2.0 authentication.

### 1. Initialize the Client

```javascript
import { IRacingClient } from 'irdata_js';

const client = new IRacingClient({
  auth: {
    clientId: 'YOUR_CLIENT_ID', // Required for OAuth
    redirectUri: 'YOUR_REDIRECT_URI', // Required for OAuth
  },
});
```

### 2. Authentication

#### Web / Browser (OAuth 2.0 PKCE)

To authenticate in the browser, you need to generate an authorization URL, redirect the user, and then handle the callback.

**Step 1: Generate Auth URL and Redirect**

```javascript
const url = await client.auth.generateAuthUrl();
window.location.href = url;
```

**Step 2: Handle Callback**

On your redirect page, capture the `code` from the URL:

```javascript
const params = new URLSearchParams(window.location.search);
const code = params.get('code');

if (code) {
  await client.auth.handleCallback(code);
  // Success! The client is now authenticated with an access token.
}
```

### 3. Fetch Data

Once authenticated, you can call any endpoint using `getData`. This method handles authentication headers, automatically follows S3 links if returned by the API, and provides metadata about the response.

```javascript
try {
  // Call an endpoint directly
  const { data, metadata } = await client.getData('/member/info');
  
  console.log(data); // The actual API response
  console.log(metadata.sizeBytes); // Response size in bytes
  console.log(metadata.chunksDetected); // Boolean indicating if data is chunked
} catch (error) {
  console.error('Failed to fetch member info:', error);
}
```

### 4. Handling Large Datasets (Chunks)

Some iRacing endpoints (like large result sets) return data in multiple "chunks" hosted on S3. When `metadata.chunksDetected` is true, you can use the library to fetch the rest of the data.

#### Fetch all chunks at once

```javascript
const result = await client.getData('/results/get');

if (result.metadata.chunksDetected) {
  // Fetch and merge all chunks into a single array
  const { data: allResults } = await client.getChunks(result.data);
  console.log('Total results:', allResults.length);
}
```

#### Fetch chunks individually (Pagination)

For extremely large datasets, you might want to fetch chunks one by one:

```javascript
if (result.metadata.chunksDetected) {
  const totalChunks = result.data.chunk_info.chunk_file_names.length;
  
  for (let i = 0; i < totalChunks; i++) {
    const { data: chunk } = await client.getChunk(result.data, i);
    console.log(`Processing chunk ${i + 1}/${totalChunks}`);
  }
}
```

## Development

### Build

```bash
npm run build
```

### Manual Verification (OAuth Flow)

This repository includes a local development proxy server to test the OAuth flow and API interaction, avoiding CORS issues during development.

1.  Create a file named `auth_config.json` in the `examples/` directory (ignored by git) with your credentials:

    ```json
    {
      "clientId": "YOUR_CLIENT_ID",
      "redirectUri": "http://127.0.0.1/irdata_js/callback",
      "tokenEndpoint": "http://127.0.0.1/token"
    }
    ```

    _Note: The `redirectUri` should match what you registered with iRacing. The proxy server is configured to intercept the path specified in `redirectUri` (e.g. `/irdata_js/callback`) and redirect it to the example app while preserving the auth code._

2.  Start the proxy server:

    ```bash
    npm run dev
    ```

    _This starts the proxy server on port 80. Depending on your system configuration, you might need elevated privileges (e.g., `sudo`) to listen on port 80._

3.  Open `http://127.0.0.1/examples/index.html` in your browser.
    - The `index.html` is configured to use the local proxy endpoints (`/token`, `/data`, `/passthrough`) to bypass CORS restrictions enforced by the browser.

## License

MIT
