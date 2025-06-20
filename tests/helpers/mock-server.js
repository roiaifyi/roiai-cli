#!/usr/bin/env node

const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());

// Read control file for test configuration
function getControlSettings() {
  try {
    const controlPath = path.join(__dirname, 'mock-control.json');
    return JSON.parse(fs.readFileSync(controlPath, 'utf8'));
  } catch (err) {
    return { failureMode: 'none' };
  }
}

// Mock login endpoint matching the spec
app.post('/api/v1/cli/login', (req, res) => {
  const { email, password, token, machine_info } = req.body;
  
  if (token === 'valid-token' || (email === 'test@example.com' && password === 'password123')) {
    res.json({
      success: true,
      data: {
        user: {
          id: '123',
          email: 'test@example.com',
          username: 'testuser'
        },
        api_key: 'roiai_auth-token-123'
      }
    });
  } else {
    res.status(401).json({ 
      success: false,
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password'
      }
    });
  }
});

// Mock push endpoint matching the spec
app.post('/api/v1/data/upsync', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  
  // Check for valid token
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  if (token !== 'test-auth-token' && token !== 'roiai_auth-token-123') {
    return res.status(401).json({ 
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid API key'
      }
    });
  }

  const request = req.body;
  const control = getControlSettings();
  
  // Validate request has messages array
  if (!request.messages || !Array.isArray(request.messages)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'Missing messages array'
      }
    });
  }
  
  const recordCount = request.messages.length;
  
  // Check if we should simulate failures
  if (control.failureMode === 'total') {
    return res.status(500).json({ 
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Internal server error'
      }
    });
  }
  
  if (control.failureMode === 'partial') {
    // Simulate partial failure
    const halfCount = Math.floor(recordCount / 2);
    
    return res.json({
      success: true,
      data: {
        processed: halfCount,
        failed: recordCount - halfCount,
        uploadId: `upload_${Date.now()}`
      }
    });
  }
  
  // Default success response
  res.json({
    success: true,
    data: {
      processed: recordCount,
      failed: 0,
      uploadId: `upload_${Date.now()}`
    }
  });
});

const port = process.env.MOCK_SERVER_PORT || 54321;
let server;

// Handle port in use error
const startServer = () => {
  server = app.listen(port, '127.0.0.1', () => {
    console.log(`Mock server listening on http://127.0.0.1:${port}`);
    
    // Send ready signal to parent process
    if (process.send) {
      process.send({ type: 'ready', port });
    }
  });
  
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use`);
      process.exit(1);
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });
};

startServer();

// Handle shutdown
process.on('SIGTERM', () => {
  if (server) {
    server.close(() => {
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

process.on('SIGINT', () => {
  if (server) {
    server.close(() => {
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

// Clean exit on uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception in mock server:', err);
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});