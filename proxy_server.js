import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 80;

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Proxy /token requests to iRacing
app.post('/token', async (req, res) => {
    console.log('--- Token Request ---');
    console.log('Incoming Body:', req.body);
    
    try {
        const upstreamBody = new URLSearchParams(req.body).toString();
        // console.log('Upstream Body:', upstreamBody); // Uncomment if needed, contains sensitive codes

        const response = await fetch('https://oauth.iracing.com/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: upstreamBody
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

// Proxy /data requests to iRacing
app.use('/data', async (req, res) => {
    const endpoint = req.path;
    const url = `https://members-ng.iracing.com/data${endpoint}`;
    
    console.log(`--- Data Request: ${req.method} ${url} ---`);
    
    try {
        const headers = {
            'Content-Type': 'application/json'
        };

        // Forward Authorization header
        if (req.headers.authorization) {
            headers['Authorization'] = req.headers.authorization;
        }

        const response = await fetch(url, {
            method: req.method,
            headers: headers,
            body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined
        });

        console.log('Upstream Status:', response.status);
        const data = await response.json();
        
        res.status(response.status).json(data);
    } catch (error) {
        console.error('Proxy Data Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve static files from root
app.use(express.static(__dirname));

app.listen(PORT, () => {
    console.log(`Proxy server running on http://127.0.0.1:${PORT}`);
});
