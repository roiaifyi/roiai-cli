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
  const { email, password, username, machine_info } = req.body;
  
  // Support token-based auth by checking if password matches known tokens
  if (password === 'valid-token' || (email === 'test@example.com' && password === 'password123')) {
    res.json({
      user: {
        id: '123',
        email: 'test@example.com',
        username: 'testuser'
      },
      api_key: 'roiai_auth-token-123'
    });
  } else {
    res.status(401).json({ 
      success: false,
      error: {
        code: 'AUTH_001',
        message: 'Invalid credentials'
      }
    });
  }
});

// Mock health check endpoint
app.get('/api/v1/cli/health', (req, res) => {
  const control = getControlSettings();
  
  // Check for auth failure mode
  if (control.failureMode === 'auth_fail') {
    return res.status(401).json({ 
      success: false,
      error: {
        code: 'AUTH_004',
        message: 'Invalid API key'
      }
    });
  }
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false,
      error: {
        code: 'AUTH_004',
        message: 'Unauthorized'
      }
    });
  }
  
  // Check for valid token
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  if (token !== 'test-auth-token' && token !== 'roiai_auth-token-123' && token !== 'existing-token') {
    return res.status(401).json({ 
      success: false,
      error: {
        code: 'AUTH_004',
        message: 'Invalid API key'
      }
    });
  }
  
  // Return successful health check
  res.json({
    authenticated: true,
    user: {
      id: 'test-user-123',
      email: 'test@example.com',
      username: 'testuser'
    },
    machine: {
      id: 'test-machine-123',
      name: 'Test Machine'
    }
  });
});

// Mock logout endpoint
app.post('/api/v1/cli/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false,
      error: {
        code: 'AUTH_004',
        message: 'Unauthorized'
      }
    });
  }
  
  // Check for valid token
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  if (token !== 'test-auth-token' && token !== 'roiai_auth-token-123' && token !== 'existing-token') {
    return res.status(401).json({ 
      success: false,
      error: {
        code: 'AUTH_004',
        message: 'Invalid API key'
      }
    });
  }
  
  // Return successful logout
  res.json({
    success: true,
    data: {
      message: 'Successfully logged out'
    }
  });
});

// Mock push endpoint matching the spec
app.post('/api/v1/cli/upsync', (req, res) => {
  const control = getControlSettings();
  
  // Check for auth failure during push mode
  if (control.failureMode === 'auth_fail_during_push') {
    return res.status(401).json({ 
      success: false,
      error: {
        code: 'AUTH_004',
        message: 'Authentication failed'
      }
    });
  }
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false,
      error: {
        code: 'AUTH_004',
        message: 'Unauthorized'
      }
    });
  }
  
  // Check for valid token
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  if (token !== 'test-auth-token' && token !== 'roiai_auth-token-123' && token !== 'existing-token') {
    return res.status(401).json({ 
      success: false,
      error: {
        code: 'AUTH_004',
        message: 'Invalid API key'
      }
    });
  }

  const request = req.body;
  // Note: control is already defined above for auth_fail_during_push check
  
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
        code: 'SYNC_002',
        message: 'Database connection failed'
      }
    });
  }
  
  if (control.failureMode === 'partial') {
    // Simulate partial failure
    const halfCount = Math.floor(recordCount / 2);
    const failedMessages = request.messages.slice(halfCount);
    
    return res.json({
      syncId: `sync_${Date.now()}`,
      results: {
        persisted: {
          count: halfCount,
          messageIds: request.messages.slice(0, halfCount).map(m => m.messageId)
        },
        deduplicated: {
          count: 0,
          messageIds: []
        },
        failed: {
          count: recordCount - halfCount,
          details: failedMessages.map(m => ({
            messageId: m.messageId,
            error: 'Simulated failure',
            code: 'SYNC_002'
          }))
        }
      },
      summary: {
        totalMessages: recordCount,
        messagesSucceeded: halfCount,
        messagesFailed: recordCount - halfCount,
        processingTimeMs: 50
      }
    });
  }
  
  // Default success response
  res.json({
    syncId: `sync_${Date.now()}`,
    results: {
      persisted: {
        count: recordCount,
        messageIds: request.messages.map(m => m.messageId)
      },
      deduplicated: {
        count: 0,
        messageIds: []
      },
      failed: {
        count: 0,
        details: []
      }
    },
    summary: {
      totalMessages: recordCount,
      messagesSucceeded: recordCount,
      messagesFailed: 0,
      processingTimeMs: 50
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