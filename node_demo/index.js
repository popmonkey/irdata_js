import { IRacingClient } from '../dist/index.js';
import * as readline from 'readline';
import { readFile, writeFile } from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOKEN_FILE = path.join(__dirname, '.token.json');

// Parse CLI args
const args = process.argv.slice(2);
const argClientId = args[0];
const argRedirectUri = args[1];

// Configuration - normally you would load this from env or config file
// For this demo, we assume the user has a registered app with iRacing
// Use the demo credentials if available or placeholders
const CONFIG = {
  clientId: argClientId || process.env.IRACING_CLIENT_ID || 'ChooseAClientId', // User must supply this
  redirectUri: argRedirectUri || process.env.IRACING_REDIRECT_URI || 'http://localhost:3000/callback', // User must supply this matching their app
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function saveTokens(client) {
  const tokens = {
    accessToken: client.auth.accessToken,
    refreshToken: client.auth.refreshToken,
  };
  try {
    await writeFile(TOKEN_FILE, JSON.stringify(tokens, null, 2));
    // console.log('Tokens saved to disk.');
  } catch (err) {
    console.error('Failed to save tokens:', err);
  }
}

async function performAuth(client) {
  // 1. Generate Auth URL
  const authUrl = await client.auth.generateAuthUrl();
  console.log('\nPlease open the following URL in your browser to authorize:');
  console.log(authUrl);
  console.log('\nAfter authorizing, you will be redirected to your Redirect URI.');
  console.log(
    'Copy the FULL URL you were redirected to (or just the code parameter) and paste it here.',
  );

  // 2. Get Code/URL from user
  const callbackUrl = await question('\nPaste Callback URL or Code: ');

  // 3. Exchange code for token
  console.log('Exchanging code for token...');
  await client.auth.handleCallback(callbackUrl.trim());

  console.log('Authentication successful!');
  console.log(`Access Token: ${client.auth.accessToken.substring(0, 10)}...`);

  await saveTokens(client);
}

async function main() {
  console.log('--- iRacing Data API Node.js Demo ---');

  if (CONFIG.clientId === 'ChooseAClientId') {
    console.log('Please set IRACING_CLIENT_ID and IRACING_REDIRECT_URI environment variables,');
    console.log('or edit the CONFIG object in node_demo/index.js');
    CONFIG.clientId = await question('Enter Client ID: ');
    CONFIG.redirectUri = await question('Enter Redirect URI: ');
  }

  const client = new IRacingClient({
    clientId: CONFIG.clientId,
    redirectUri: CONFIG.redirectUri,
  });

  // Try to load saved tokens
  try {
    const savedData = await readFile(TOKEN_FILE, 'utf-8');
    const tokens = JSON.parse(savedData);
    if (tokens.accessToken) {
      client.auth.setSession(tokens.accessToken, tokens.refreshToken);
      console.log('Loaded saved tokens from .token.json');
    }
  } catch (_err) {
    // No saved tokens or invalid file, proceed to auth
    console.log('No saved tokens found.');
  }

  try {
    if (!client.auth.isLoggedIn) {
      await performAuth(client);
    }

    console.log('\nFetching /data/member/info...');

    // We wrap this in a loop or retry logic effectively
    let result;
    try {
      result = await client.getData('member/info');
    } catch (err) {
      if (err.status === 401) {
        console.log('Saved token is invalid or expired (and refresh failed). Re-authenticating...');
        await performAuth(client);
        result = await client.getData('member/info');
      } else {
        throw err;
      }
    }

    // Save tokens again in case they were refreshed during getData
    await saveTokens(client);

    console.log('Data received!');
    console.log('Member Info:', JSON.stringify(result.data, null, 2));
  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    rl.close();
  }
}

main();
