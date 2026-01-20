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
        redirectUri: 'YOUR_REDIRECT_URI' // Required for OAuth
    }
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

Once authenticated, you can use the endpoint helpers:

```javascript
try {
    const memberInfo = await client.members.info();
    console.log(memberInfo);
} catch (error) {
    console.error("Failed to fetch member info:", error);
}
```

## Development

### Build

```bash
npm run build
```
