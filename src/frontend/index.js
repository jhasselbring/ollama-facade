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
    console.log('\n=== Incoming Request to Frontend ===');
    console.log(`Method: ${req.method}`);
    console.log(`Path: ${req.path}`);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('================================\n');
    next();
});

// Proxy configuration
const backendProxy = createProxyMiddleware({
    target: process.env.BACKEND_URL || 'https://llm.toolbox.plus',
    changeOrigin: true,
    secure: true, // Enable HTTPS
    followRedirects: true, // Follow redirects
    pathRewrite: (path) => {
        // If path already starts with /api/, just return it
        if (path.startsWith('/api/')) {
            return path;
        }
        // Otherwise add /api/ prefix
        return `/api${path}`;
    },
    onProxyReq: (proxyReq, req, res) => {
        // Only set headers if they haven't been set yet
        if (!proxyReq.getHeader('authorization')) {
            proxyReq.setHeader('Authorization', `Bearer ${process.env.API_TOKEN}`);
        }

        console.log('\n=== Outgoing Request to Backend ===');
        console.log(`Method: ${req.method}`);
        console.log(`Path: ${req.path}`);
        console.log('Headers:', JSON.stringify({
            ...req.headers,
            authorization: `Bearer ${process.env.API_TOKEN}`
        }, null, 2));
        console.log('================================\n');
    },
    onProxyRes: (proxyRes, req, res) => {
        // Set appropriate headers for streaming
        proxyRes.headers['x-accel-buffering'] = 'no';
        proxyRes.headers['cache-control'] = 'no-cache';
        proxyRes.headers['connection'] = 'keep-alive';

        console.log('\n=== Incoming Response from Backend ===');
        console.log(`Status: ${proxyRes.statusCode}`);
        console.log('Headers:', JSON.stringify(proxyRes.headers, null, 2));

        // For non-streaming responses, log the full response
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
        console.error('===================\n');
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
    console.log(`Frontend proxy running on port ${port}`);
    console.log(`Proxying to: ${process.env.BACKEND_URL || 'https://llm.toolbox.plus'}`);
}); 