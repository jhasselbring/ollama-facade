# Ollama Facade

A secure Express proxy setup for Ollama with API token authentication. Includes both backend and frontend proxy servers.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with the following variables:
```
# Ollama server configuration
OLLAMA_SERVER_URL=http://localhost:11434

# API tokens (comma-separated list)
API_TOKENS=token1,token2,token3

# Backend proxy configuration
BACKEND_PORT=3000

# Frontend proxy configuration
FRONTEND_PORT=3001
BACKEND_URL=http://localhost:3000
```

3. Start the servers:

```bash
# Start backend proxy only
npm run proxy:be

# Start frontend proxy only
npm run proxy:fe

# Start both proxies in development mode with auto-reload
npm run dev
```

## Usage

Make requests to the frontend proxy (port 3001) without worrying about authentication. The frontend proxy will automatically add the first token from the list before forwarding requests to the backend proxy.

For direct access to the backend proxy (port 3000), you can use any of the configured tokens:

```javascript
// Make requests to the frontend proxy (no token needed)
fetch('http://localhost:3001/api/api/generate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'llama2',
    prompt: 'What is the capital of France?'
  })
});

// Or make requests directly to the backend proxy with any valid token
fetch('http://localhost:3000/api/api/generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer any-valid-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'llama2',
    prompt: 'What is the capital of France?'
  })
});
```

## Architecture

```
Client -> Frontend Proxy (3001) -> Backend Proxy (3000) -> Ollama Server (11434)
```

- Frontend Proxy (port 3001):
  - Automatically adds the first token from the list
  - Forwards requests to backend proxy
  - No authentication required from clients

- Backend Proxy (port 3000):
  - Verifies bearer token against the list of valid tokens
  - Forwards requests to Ollama server
  - Adds security layer to Ollama instance

## Token Management

- Multiple tokens can be configured by separating them with commas in the `API_TOKENS` environment variable
- The frontend proxy uses the first token in the list
- Any token in the list can be used for direct access to the backend proxy
- Tokens should be kept secure and not shared publicly

## Security

- All requests must include a valid API token
- The proxy server adds an additional layer of security to your Ollama instance
- CORS is enabled by default but can be configured in the code "# ollama-facade" 
