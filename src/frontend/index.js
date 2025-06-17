require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const port = process.env.FRONTEND_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

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

// Get the default token (first token in the map)
const defaultToken = Object.keys(tokenUserMap)[0];
const defaultUser = tokenUserMap[defaultToken];

if (!defaultToken) {
    console.error('No tokens found in API_TOKENS_JSON');
    process.exit(1);
}

// Proxy configuration
const backendProxy = createProxyMiddleware({
    target: process.env.BACKEND_URL || 'http://localhost:3000',
    changeOrigin: true,
    onProxyReq: (proxyReq, req, res) => {
        // Add the bearer token to all requests
        proxyReq.setHeader('Authorization', `Bearer ${defaultToken}`);
    },
    onError: (err, req, res) => {
        console.error('Proxy Error:', err);
        res.status(500).json({ error: 'Proxy error occurred' });
    }
});

// Apply proxy to all routes
app.use('/', backendProxy);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(port, () => {
    console.log(`Frontend proxy server running on port ${port}`);
    console.log(`Proxying requests to: ${process.env.BACKEND_URL || 'http://localhost:3000'}`);
    console.log(`Using default user: ${defaultUser}`);
    console.log(`Default token: ${defaultToken.substring(0, 8)}...`);
}); 