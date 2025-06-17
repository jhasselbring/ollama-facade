require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// API token authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    if (token !== process.env.API_TOKEN) {
        return res.status(403).json({ error: 'Invalid token' });
    }

    next();
};

// Proxy configuration
const ollamaProxy = createProxyMiddleware({
    target: process.env.OLLAMA_SERVER_URL,
    changeOrigin: true,
    pathRewrite: {
        '^/api': '', // Remove /api prefix when forwarding to Ollama
    },
    onError: (err, req, res) => {
        console.error('Proxy Error:', err);
        res.status(500).json({ error: 'Proxy error occurred' });
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

app.listen(port, () => {
    console.log(`Ollama proxy server running on port ${port}`);
    console.log(`Proxying requests to: ${process.env.OLLAMA_SERVER_URL}`);
}); 