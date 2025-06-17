require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const port = process.env.FRONTEND_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Get the frontend API token
const frontendToken = process.env.API_TOKEN;
if (!frontendToken) {
    console.error('API_TOKEN is not set in .env file');
    console.error('Please add API_TOKEN to your .env file');
    process.exit(1);
}

// Proxy configuration
const backendProxy = createProxyMiddleware({
    target: process.env.BACKEND_URL || 'http://localhost:3000',
    changeOrigin: true,
    onProxyReq: (proxyReq, req, res) => {
        // Add the bearer token to all requests
        proxyReq.setHeader('Authorization', `Bearer ${frontendToken}`);
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
    console.log(`Using token: ${frontendToken.substring(0, 8)}...`);
}); 