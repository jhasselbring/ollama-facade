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

        // Log outgoing request
        console.log('Outgoing request:', {
            method: req.method,
            path: req.path,
            headers: {
                ...req.headers,
                authorization: `Bearer ${process.env.API_TOKEN}`
            }
        });
    },
    onProxyRes: (proxyRes, req, res) => {
        // Log incoming response
        let responseBody = '';
        proxyRes.on('data', (chunk) => {
            responseBody += chunk;
        });
        proxyRes.on('end', () => {
            try {
                const parsedBody = JSON.parse(responseBody);
                console.log('Incoming response:', {
                    status: proxyRes.statusCode,
                    headers: proxyRes.headers,
                    body: parsedBody
                });
            } catch (e) {
                console.log('Incoming response:', {
                    status: proxyRes.statusCode,
                    headers: proxyRes.headers,
                    body: responseBody
                });
            }
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