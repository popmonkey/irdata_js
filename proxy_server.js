/**
 * iRacing Proxy Server
 *
 * A proxy is a required architectural component for browser-based usage of the iRacing API.
 * iRacing does not provide CORS headers for third-party domains.
 *
 * This version includes production-ready security features:
 * 1. Rate Limiting (DDoS protection)
 * 2. SSRF Protection (URL Allowisting)
 * 3. Security Headers (Helmet)
 * 4. Environment variable support
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Load config from JSON
const configPath = path.join(__dirname, 'demo', 'config.json');
let fileConfig = {
  port: 80,
  basePath: '/irdata_js',
  redirectPath: '/irdata_js/callback',
  corsOrigin: '*',
  rateLimits: {
    windowMs: 60000,
    globalLimit: 50,
    ipLimit: 5,
  },
};

if (fs.existsSync(configPath)) {
  try {
    const loadedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    fileConfig = { ...fileConfig, ...loadedConfig };
    // Deep merge rateLimits if they exist
    if (loadedConfig.rateLimits) {
      fileConfig.rateLimits = { ...fileConfig.rateLimits, ...loadedConfig.rateLimits };
    }
  } catch (e) {
    console.error('Warning: Failed to parse demo/config.json', e.message);
  }
}

// Configuration (Environment variables take precedence)
const PORT = process.env.PORT || fileConfig.port;
const basePath = process.env.BASE_PATH || fileConfig.basePath;
const redirectPath = process.env.REDIRECT_PATH || fileConfig.redirectPath;
const corsOrigin = process.env.CORS_ORIGIN || fileConfig.corsOrigin;

// SSRF Allowist for /passthrough
const PASSTHROUGH_ALLOWIST = [
  'members-ng.iracing.com',
  'oauth.iracing.com',
  'ir-dl.s3.amazonaws.com',
  // Generically allow AWS S3 and other AWS resources used by iRacing
  'amazonaws.com',
];

// Security Middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // Disabled for demo simplicity, enable in strict production
    crossOriginEmbedderPolicy: false,
  }),
);

// Global Rate Limiting: 50 requests per 1 minute across ALL users
// This protects the shared iRacing Client ID from being throttled/banned.
const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 50,
  keyGenerator: () => 'global', // Constant key applies limit to everyone
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Global rate limit exceeded. Please try again later.' },
});

// Per-IP Rate Limiting: 5 requests per 1 minute per IP
// This prevents a single user from hogging the global quota.
const ipLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again later.' },
});

app.use(cors({ origin: corsOrigin }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Tell Express to trust the proxy (e.g., Nginx) to get the real user IP
// This is critical for the ipLimiter to work correctly in production.
app.set('trust proxy', 1);

// Helper to handle paths with and without basePath (resilient to Nginx path stripping)
const getPaths = (p) => {
  const paths = [p];
  if (basePath && basePath !== '/' && p.startsWith(basePath)) {
    const relative = p.slice(basePath.length) || '/';
    if (!paths.includes(relative)) paths.push(relative);
  }
  return paths;
};

// Apply limiters to API endpoints
app.use(`${basePath}/token`, globalLimiter, ipLimiter);
app.use(`${basePath}/data`, globalLimiter, ipLimiter);

// Conditional Limiter for /passthrough
// Only rate limit if the target is an iRacing API domain. AWS/S3 is exempt.
const passthroughLimiter = (req, res, next) => {
  const urlParam = req.query.url;
  if (urlParam) {
    try {
      const hostname = new URL(urlParam).hostname;
      const isIracing = hostname === 'iracing.com' || hostname.endsWith('.iracing.com');
      if (!isIracing) {
        return next(); // Skip limiting for AWS/other non-iRacing domains
      }
    } catch (_e) {
      // Invalid URL, let the route handler catch it
    }
  }
  // Apply both limiters for iRacing domains
  globalLimiter(req, res, (err) => {
    if (err) return next(err);
    ipLimiter(req, res, next);
  });
};

app.use(`${basePath}/passthrough`, passthroughLimiter);

// Handle OAuth callback redirect
app.get(getPaths(redirectPath), (req, res) => {
  const queryString = new URLSearchParams(req.query).toString();
  console.log(
    `[${new Date().toISOString()}] Redirecting callback ${req.originalUrl} to ${basePath}/?${queryString}`,
  );
  res.redirect(`${basePath}/?${queryString}`);
});

// Proxy /token requests to iRacing
app.post(getPaths(`${basePath}/token`), async (req, res) => {
  console.log(`[${new Date().toISOString()}] --- Token Request ---`);

  try {
    const upstreamBody = new URLSearchParams(req.body).toString();

    const response = await fetch('https://oauth.iracing.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: upstreamBody,
    });

    console.log(`[${new Date().toISOString()}] Upstream Status: ${response.status}`);
    const data = await response.json();

    res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy Error:', error);
    res.status(500).json({ error: 'Failed to proxy token request' });
  }
});

// Proxy generic requests (like S3 links) with SSRF protection
app.get(getPaths(`${basePath}/passthrough`), async (req, res) => {
  const urlParam = req.query.url;
  if (!urlParam) {
    return res.status(400).json({ error: 'Missing url query parameter' });
  }

  try {
    const parsedUrl = new URL(urlParam);
    const isAllowisted = PASSTHROUGH_ALLOWIST.some(
      (domain) => parsedUrl.hostname === domain || parsedUrl.hostname.endsWith(`.${domain}`),
    );

    if (!isAllowisted) {
      console.warn(
        `[${new Date().toISOString()}] Blocked unauthorized passthrough attempt to: ${urlParam}`,
      );
      return res
        .status(403)
        .json({ error: `Forbidden: Target domain [${parsedUrl.hostname}] not allowisted.` });
    }

    console.log(
      `[${new Date().toISOString()}] --- Passthrough Request [${parsedUrl.hostname}]: ${urlParam} ---`,
    );

    const response = await fetch(urlParam);
    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      res.status(response.status).json(data);
    } else {
      const text = await response.text();
      res.set('Content-Type', contentType || 'text/plain');
      res.status(response.status).send(text);
    }
  } catch (error) {
    console.error('Passthrough Error:', error);
    res.status(500).json({ error: 'Failed to fetch external resource' });
  }
});

// Proxy /data requests to iRacing
app.use(getPaths(`${basePath}/data`), async (req, res) => {
  const endpoint = req.url;
  const url = `https://members-ng.iracing.com/data${endpoint}`;

  console.log(`[${new Date().toISOString()}] --- Data Request: ${req.method} ${url} ---`);

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

    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      res.status(response.status).json(data);
    } else {
      const text = await response.text();
      res.set('Content-Type', contentType || 'text/plain');
      res.status(response.status).send(text);
    }
  } catch (error) {
    console.error('Proxy Data Error:', error);
    res.status(500).json({ error: 'Failed to proxy data request' });
  }
});

// Serve static files (resilient to Nginx path stripping)
app.use(basePath, express.static(__dirname));
app.use('/', express.static(__dirname));

// Serve the demo index.html at the root and basePath
const serveDemo = (req, res) => {
  res.sendFile(path.join(__dirname, 'demo', 'index.html'));
};

app.get('/', serveDemo);
app.get(basePath, serveDemo);
app.get(`${basePath}/`, serveDemo);

app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Proxy server running on http://127.0.0.1:${PORT}`);
});
