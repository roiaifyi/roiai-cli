import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import express from 'express';
import { Server } from 'http';
import { TEST_DB_PATH, TEST_DATA_DIR } from '../setup';

describe('Login Command Integration', () => {
  let server: Server;
  const port = 54321; // Use a fixed port for testing
  const cliPath = path.join(__dirname, '../../dist/index.js');
  const testUserInfoPath = path.join(TEST_DATA_DIR, 'user_info.json');
  
  beforeEach((done) => {
    // Clean up any existing user info
    if (fs.existsSync(testUserInfoPath)) {
      fs.unlinkSync(testUserInfoPath);
    }
    
    // Create mock auth server
    const app = express();
    app.use(express.json());
    
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok' });
    });
    
    app.post('/v1/auth/login', (req, res) => {
      console.error('Login request received:', req.body);
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
    
    server = app.listen(port, '127.0.0.1', () => {
      console.error(`Mock auth server started on port ${port}`);
      // Give the server a moment to fully initialize
      setTimeout(done, 100);
    });
  });
  
  afterEach((done) => {
    server.close(done);
    
    // Clean up test user info
    if (fs.existsSync(testUserInfoPath)) {
      fs.unlinkSync(testUserInfoPath);
    }
  });
  
  it.skip('should login successfully with email and password', () => {
    console.error(`Test is using port ${port} for mock server`);
    const env = {
      ...process.env,
      NODE_CONFIG: JSON.stringify({
        database: { path: TEST_DB_PATH },
        user: { infoPath: testUserInfoPath },
        claudeCode: {
          rawDataPath: TEST_DATA_DIR,
          pricingUrl: 'https://example.com/pricing',
          pricingCacheTimeout: 0,
          cacheDurationDefault: 5,
          batchSize: 100
        },
        push: { 
          endpoint: `http://127.0.0.1:${port}/v1/usage/push`,
          batchSize: 10,
          maxRetries: 3,
          timeout: 5000
        },
        watch: {
          pollInterval: 5000,
          ignored: ['**/node_modules/**', '**/.git/**']
        },
        logging: { level: 'error' }
      })
    };
    
    const output = execSync(
      `node ${cliPath} cc login -e test@example.com -p password123`,
      { env, encoding: 'utf8' }
    );
    
    expect(output).toContain('Successfully logged in as test@example.com');
    
    // Check user info file was created
    expect(fs.existsSync(testUserInfoPath)).toBe(true);
    const userInfo = JSON.parse(fs.readFileSync(testUserInfoPath, 'utf8'));
    expect(userInfo.auth).toBeDefined();
    expect(userInfo.auth.email).toBe('test@example.com');
    expect(userInfo.auth.apiToken).toBe('auth-token-123');
  });
  
  it.skip('should login successfully with token', () => {
    const env = {
      ...process.env,
      NODE_CONFIG: JSON.stringify({
        database: { path: TEST_DB_PATH },
        user: { infoPath: testUserInfoPath },
        claudeCode: {
          rawDataPath: TEST_DATA_DIR,
          pricingUrl: 'https://example.com/pricing',
          pricingCacheTimeout: 0,
          cacheDurationDefault: 5,
          batchSize: 100
        },
        push: { 
          endpoint: `http://127.0.0.1:${port}/v1/usage/push`,
          batchSize: 10,
          maxRetries: 3,
          timeout: 5000
        },
        watch: {
          pollInterval: 5000,
          ignored: ['**/node_modules/**', '**/.git/**']
        },
        logging: { level: 'error' }
      })
    };
    
    const output = execSync(
      `node ${cliPath} cc login -t valid-token`,
      { env, encoding: 'utf8' }
    );
    
    expect(output).toContain('Successfully logged in');
  });
  
  it.skip('should fail with invalid credentials', () => {
    const env = {
      ...process.env,
      NODE_CONFIG: JSON.stringify({
        database: { path: TEST_DB_PATH },
        user: { infoPath: testUserInfoPath },
        claudeCode: {
          rawDataPath: TEST_DATA_DIR,
          pricingUrl: 'https://example.com/pricing',
          pricingCacheTimeout: 0,
          cacheDurationDefault: 5,
          batchSize: 100
        },
        push: { 
          endpoint: `http://127.0.0.1:${port}/v1/usage/push`,
          batchSize: 10,
          maxRetries: 3,
          timeout: 5000
        },
        watch: {
          pollInterval: 5000,
          ignored: ['**/node_modules/**', '**/.git/**']
        },
        logging: { level: 'error' }
      })
    };
    
    expect(() => {
      execSync(
        `node ${cliPath} cc login -e wrong@example.com -p wrongpass`,
        { env, encoding: 'utf8' }
      );
    }).toThrow('Invalid credentials');
  });
  
  it.skip('should not login if already authenticated', () => {
    // Create existing user info with auth
    const existingUserInfo = {
      userId: 'anon-123',
      clientMachineId: '123',
      auth: {
        realUserId: 'user-existing',
        email: 'existing@example.com',
        apiToken: 'existing-token'
      }
    };
    fs.mkdirSync(path.dirname(testUserInfoPath), { recursive: true });
    fs.writeFileSync(testUserInfoPath, JSON.stringify(existingUserInfo));
    
    const env = {
      ...process.env,
      NODE_CONFIG: JSON.stringify({
        database: { path: TEST_DB_PATH },
        user: { infoPath: testUserInfoPath },
        claudeCode: {
          rawDataPath: TEST_DATA_DIR,
          pricingUrl: 'https://example.com/pricing',
          pricingCacheTimeout: 0,
          cacheDurationDefault: 5,
          batchSize: 100
        },
        push: { 
          endpoint: `http://127.0.0.1:${port}/v1/usage/push`,
          batchSize: 10,
          maxRetries: 3,
          timeout: 5000
        },
        watch: {
          pollInterval: 5000,
          ignored: ['**/node_modules/**', '**/.git/**']
        },
        logging: { level: 'error' }
      })
    };
    
    const output = execSync(
      `node ${cliPath} cc login -t valid-token`,
      { env, encoding: 'utf8' }
    );
    
    expect(output).toContain('Already logged in as existing@example.com');
  });
});