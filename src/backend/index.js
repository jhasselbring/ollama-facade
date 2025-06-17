require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const port = process.env.BACKEND_PORT || 3000;

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