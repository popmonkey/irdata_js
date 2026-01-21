import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Load config
const configPath = path.join(__dirname, 'demo', 'config.json');
if (!fs.existsSync(configPath)) {
  console.error('Error: demo/config.json not found.');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const PORT = config.port || 80;
const basePath = config.basePath || '/irdata_js';
const redirectPath = config.redirectPath || '/irdata_js/callback';

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Handle OAuth callback redirect
app.get(redirectPath, (req, res) => {
  const queryString = new URLSearchParams(req.query).toString();
  console.log(`Redirecting callback ${redirectPath} to ${basePath}/?${queryString}`);
  res.redirect(`${basePath}/?${queryString}`);
});

// Proxy /token requests to iRacing
app.post(`${basePath}/token`, async (req, res) => {
  console.log('--- Token Request ---');
  console.log('Incoming Body:', req.body);

  try {
    const upstreamBody = new URLSearchParams(req.body).toString();
    // console.log('Upstream Body:', upstreamBody); // Uncomment if needed, contains sensitive codes

    const response = await fetch('https://oauth.iracing.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: upstreamBody,
    });

    console.log('Upstream Status:', response.status);
    const data = await response.json();
    console.log('Upstream Response:', data);

    res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Proxy generic requests (like S3 links)
app.get(`${basePath}/passthrough`, async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ error: 'Missing url query parameter' });
  }

  console.log(`--- Passthrough Request: ${url} ---`);

  try {
    const response = await fetch(url);
    console.log('Passthrough Status:', response.status);

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Passthrough Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Proxy /data requests to iRacing
app.use(`${basePath}/data`, async (req, res) => {
  const endpoint = req.url;
  const url = `https://members-ng.iracing.com/data${endpoint}`;

  console.log(`--- Data Request: ${req.method} ${url} ---`);

  try {
    const headers = {
      'Content-Type': 'application/json',
    };

    // Forward Authorization header
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }

    const response = await fetch(url, {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });

    console.log('Upstream Status:', response.status);
    const data = await response.json();

    res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy Data Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve static files from basePath
app.use(basePath, express.static(__dirname));

// Serve the demo index.html at the root and basePath
const serveDemo = (req, res) => {
  res.sendFile(path.join(__dirname, 'demo', 'index.html'));
};

app.get('/', serveDemo);
app.get(basePath, serveDemo);
app.get(`${basePath}/`, serveDemo);

app.listen(PORT, () => {
  console.log(`Proxy server running on http://127.0.0.1:${PORT}`);
});
