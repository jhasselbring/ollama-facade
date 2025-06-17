require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const port = process.env.FRONTEND_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
    console.log('Incoming request:', {
        method: req.method,
        path: req.path,
        body: req.body,
        headers: req.headers
    });
    next();
});

// Proxy configuration
const backendProxy = createProxyMiddleware({
    target: process.env.BACKEND_URL || 'https://llm.toolbox.plus',
    changeOrigin: true,
    onProxyReq: (proxyReq, req, res) => {
        // Add the bearer token to all requests
        proxyReq.setHeader('Authorization', `Bearer ${process.env.API_TOKEN}`);
        
        // Log outgoing request
        console.log('Outgoing request:', {
            method: proxyReq.method,
            path: proxyReq.path,
            headers: proxyReq.getHeaders()
        });
    },
    onProxyRes: (proxyRes, req, res) => {
        // Log incoming response
        let responseBody = '';
        proxyRes.on('data', (chunk) => {
            responseBody += chunk;
        });
        proxyRes.on('end', () => {
            console.log('Incoming response:', {
                status: proxyRes.statusCode,
                headers: proxyRes.headers,
                body: responseBody
            });
        });
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