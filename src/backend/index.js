require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const http = require('http');
const https = require('https');
const url = require('url');

const app = express();
const port = process.env.BACKEND_PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
    console.log('\n=== Incoming Request to Backend ===');
    console.log(`Method: ${req.method}`);
    console.log(`Path: ${req.path}`);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('================================\n');
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

// Create agents for both HTTP and HTTPS
const createAgent = (protocol) => {
    const Agent = protocol === 'https:' ? https.Agent : http.Agent;
    return new Agent({
        keepAlive: true,
        keepAliveMsecs: 60000,
        maxSockets: 100,
        maxFreeSockets: 10,
        timeout: 30000
    });
};

// Create a single proxy instance
const createProxy = () => {
    const targetUrl = process.env.OLLAMA_SERVER_URL;
    const parsedUrl = url.parse(targetUrl);
    const agent = createAgent(parsedUrl.protocol);

    return createProxyMiddleware({
        target: targetUrl,
        changeOrigin: true,
        secure: true,
        followRedirects: false, // Disable redirects to prevent protocol issues
        timeout: 30000,
        agent: agent,
        onProxyReq: (proxyReq, req, res) => {
            // Add retry count to request
            req.retryCount = req.retryCount || 0;

            // Set keep-alive headers
            proxyReq.setHeader('Connection', 'keep-alive');
            proxyReq.setHeader('Keep-Alive', 'timeout=60');

            // Handle request body
            if (req.body && Object.keys(req.body).length > 0) {
                const bodyData = JSON.stringify(req.body);
                proxyReq.setHeader('Content-Type', 'application/json');
                proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
                proxyReq.write(bodyData);
            }

            console.log('\n=== Outgoing Request to Ollama ===');
            console.log(`User: ${req.user}`);
            console.log(`Method: ${req.method}`);
            console.log(`Path: ${req.path}`);
            console.log('Headers:', JSON.stringify(proxyReq.getHeaders(), null, 2));
            console.log('Body:', JSON.stringify(req.body, null, 2));
            console.log('================================\n');
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
                    // Reuse the same proxy instance
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
};

// Create a single proxy instance
const proxy = createProxy();

// Apply authentication middleware to all routes
app.use('/api', authenticateToken);

// Apply proxy to all routes under /api
app.use('/api', proxy);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Create server with keep-alive
const server = http.createServer({
    keepAlive: true,
    keepAliveTimeout: 60000
}, app);

// Increase max listeners
server.setMaxListeners(20);

server.listen(port, () => {
    console.log(`Backend proxy server running on port ${port}`);
    console.log(`Proxying requests to: ${process.env.OLLAMA_SERVER_URL}`);
    console.log(`Number of registered users: ${Object.keys(tokenUserMap).length}`);
    console.log('Registered users:', Object.values(tokenUserMap).join(', '));
}); 