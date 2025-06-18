require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const port = process.env.BACKEND_PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
    console.log('\n=== Incoming Request ===');
    console.log(`Method: ${req.method}`);
    console.log(`Path: ${req.path}`);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('=====================\n');
    next();
});

// Parse API tokens mapping from environment variable
let tokenUserMap = {};
try {
    const tokensJson = process.env.API_TOKENS_JSON;
    if (!tokensJson) {
        console.error('API_TOKENS_JSON is not set in .env file');
        console.error('Please add API_TOKENS_JSON to your .env file like this:');
        console.error('API_TOKENS_JSON={"token1":"user1","token2":"user2"}');
        process.exit(1);
    }
    tokenUserMap = JSON.parse(tokensJson);
    if (Object.keys(tokenUserMap).length === 0) {
        console.error('API_TOKENS_JSON is empty. Please add at least one token-user mapping.');
        process.exit(1);
    }
} catch (e) {
    console.error('Error parsing API_TOKENS_JSON. Please check your .env file format.');
    console.error('Example format: API_TOKENS_JSON={"token1":"user1","token2":"user2"}');
    console.error('Error details:', e.message);
    process.exit(1);
}

// API token authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const user = tokenUserMap[token];
    if (!user) {
        return res.status(403).json({ error: 'Invalid token' });
    }

    req.user = user; // Attach user identity to request
    next();
};

// Retry configuration
const MAX_RETRIES = 2;
const RETRY_DELAY = 2000; // 2 seconds

// Proxy configuration
const ollamaProxy = createProxyMiddleware({
    target: process.env.OLLAMA_SERVER_URL,
    changeOrigin: true,
    // Remove pathRewrite since Ollama already has /api endpoint
    onProxyReq: (proxyReq, req, res) => {
        console.log('\n=== Outgoing Request to Ollama ===');
        console.log(`User: ${req.user}`);
        console.log(`Method: ${req.method}`);
        console.log(`Path: ${req.path}`);
        console.log('Headers:', JSON.stringify(proxyReq.getHeaders(), null, 2));
        console.log('================================\n');

        // Add retry count to request
        req.retryCount = req.retryCount || 0;
    },
    onProxyRes: (proxyRes, req, res) => {
        // Set appropriate headers for streaming
        proxyRes.headers['x-accel-buffering'] = 'no';
        proxyRes.headers['cache-control'] = 'no-cache';
        proxyRes.headers['connection'] = 'keep-alive';
        
        console.log('\n=== Incoming Response from Ollama ===');
        console.log(`Status: ${proxyRes.statusCode}`);
        console.log('Headers:', JSON.stringify(proxyRes.headers, null, 2));
        
        if (!proxyRes.headers['transfer-encoding']?.includes('chunked')) {
            let responseBody = '';
            proxyRes.on('data', (chunk) => {
                responseBody += chunk;
            });
            proxyRes.on('end', () => {
                try {
                    const parsedBody = JSON.parse(responseBody);
                    console.log('Body:', JSON.stringify(parsedBody, null, 2));
                } catch (e) {
                    console.log('Body:', responseBody);
                }
                console.log('================================\n');
            });
        } else {
            console.log('Streaming response started');
            console.log('================================\n');
        }
    },
    onError: (err, req, res) => {
        console.error('\n=== Proxy Error ===');
        console.error('Error:', err);
        console.error('Request:', {
            method: req.method,
            path: req.path,
            headers: req.headers
        });

        // Handle retries for connection errors
        if ((err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED') && !req.retryCount) {
            console.error(`Retrying request (1/${MAX_RETRIES})...`);
            req.retryCount = 1;
            
            setTimeout(() => {
                // Replay the request
                const proxy = createProxyMiddleware({
                    target: process.env.OLLAMA_SERVER_URL,
                    changeOrigin: true,
                    secure: true,
                    timeout: 30000 // 30 second timeout
                });
                proxy(req, res, () => {});
            }, RETRY_DELAY);
            
            return;
        }

        console.error('===================\n');
        res.status(500).json({ 
            error: 'Proxy error occurred',
            message: err.message,
            code: err.code,
            retried: req.retryCount > 0
        });
    }
});

// Apply authentication middleware to all routes
app.use('/api', authenticateToken);

// Apply proxy to all routes under /api
app.use('/api', ollamaProxy);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.use('/api', (req, res, next) => {
  console.log(`User: ${req.user} is making a request`);
  next();
});

app.listen(port, () => {
    console.log(`Backend proxy server running on port ${port}`);
    console.log(`Proxying requests to: ${process.env.OLLAMA_SERVER_URL}`);
    console.log(`Number of registered users: ${Object.keys(tokenUserMap).length}`);
    console.log('Registered users:', Object.values(tokenUserMap).join(', '));
}); 