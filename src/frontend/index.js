require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const port = process.env.FRONTEND_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Proxy configuration
const backendProxy = createProxyMiddleware({
    target: process.env.BACKEND_URL || 'https://llm.toolbox.plus',
    changeOrigin: true,
    onProxyReq: (proxyReq, req, res) => {
        // Add the bearer token to all requests
        proxyReq.setHeader('Authorization', `Bearer ${process.env.API_TOKEN}`);
    }
});

// Apply proxy to all routes
app.use('/', backendProxy);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(port, () => {
    console.log(`Frontend proxy running on port ${port}`);
    console.log(`Proxying to: ${process.env.BACKEND_URL || 'https://llm.toolbox.plus'}`);
}); 