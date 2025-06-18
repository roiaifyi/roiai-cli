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

// Mock login endpoint
app.post('/v1/auth/login', (req, res) => {
  const { email, password, token } = req.body;
  
  if (token === 'valid-token' || (email === 'test@example.com' && password === 'password123')) {
    res.json({
      userId: 'user-123',
      email: 'test@example.com',
      apiToken: 'auth-token-123'
    });
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

// Mock push endpoint
app.post('/v1/usage/push', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  
  // Check for valid token
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  if (token !== 'test-auth-token') {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const request = req.body;
  const control = getControlSettings();
  
  // Check if we should simulate failures
  if (control.failureMode === 'total') {
    return res.status(500).json({ message: 'Server error' });
  }
  
  if (control.failureMode === 'partial') {
    // Simulate partial failure
    const halfCount = Math.floor(request.messages.length / 2);
    const failedMessages = request.messages.slice(halfCount).map(m => ({
      messageId: m.uuid,
      error: 'Validation error'
    }));
    
    return res.json({
      batchId: request.batchId,
      results: {
        persisted: {
          count: halfCount,
          messageIds: request.messages.slice(0, halfCount).map(m => m.uuid)
        },
        deduplicated: {
          count: 0,
          messageIds: []
        },
        failed: {
          count: failedMessages.length,
          details: failedMessages
        }
      },
      summary: {
        totalMessages: request.messages.length,
        messagesSucceeded: halfCount,
        messagesFailed: failedMessages.length,
        entitiesCreated: {
          users: 0,
          machines: 0,
          projects: 0,
          sessions: 0
        },
        aggregatesUpdated: false,
        processingTimeMs: 50
      }
    });
  }
  
  // Default success response
  res.json({
    batchId: request.batchId,
    results: {
      persisted: {
        count: request.messages.length,
        messageIds: request.messages.map(m => m.uuid)
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
      totalMessages: request.messages.length,
      messagesSucceeded: request.messages.length,
      messagesFailed: 0,
      entitiesCreated: {
        users: Object.keys(request.entities.users || {}).length,
        machines: Object.keys(request.entities.machines || {}).length,
        projects: Object.keys(request.entities.projects || {}).length,
        sessions: Object.keys(request.entities.sessions || {}).length
      },
      aggregatesUpdated: true,
      processingTimeMs: 100
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