import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import express from 'express';
import { Server } from 'http';

describe('Login Command Integration', () => {
  let server: Server;
  let port: number;
  const cliPath = path.join(__dirname, '../../dist/index.js');
  const testUserInfoPath = path.join(__dirname, '../fixtures/test-user-info.json');
  
  beforeEach((done) => {
    // Clean up any existing user info
    if (fs.existsSync(testUserInfoPath)) {
      fs.unlinkSync(testUserInfoPath);
    }
    
    // Create mock auth server
    const app = express();
    app.use(express.json());
    
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
    
    server = app.listen(0, () => {
      port = (server.address() as any).port;
      done();
    });
  });
  
  afterEach((done) => {
    server.close(done);
    
    // Clean up test user info
    if (fs.existsSync(testUserInfoPath)) {
      fs.unlinkSync(testUserInfoPath);
    }
  });
  
  it('should login successfully with email and password', () => {
    const env = {
      ...process.env,
      NODE_CONFIG: JSON.stringify({
        user: { infoPath: testUserInfoPath },
        push: { 
          endpoint: `http://localhost:${port}/v1/usage/push`,
          timeout: 5000
        }
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
  
  it('should login successfully with token', () => {
    const env = {
      ...process.env,
      NODE_CONFIG: JSON.stringify({
        user: { infoPath: testUserInfoPath },
        push: { 
          endpoint: `http://localhost:${port}/v1/usage/push`,
          timeout: 5000
        }
      })
    };
    
    const output = execSync(
      `node ${cliPath} cc login -t valid-token`,
      { env, encoding: 'utf8' }
    );
    
    expect(output).toContain('Successfully logged in');
  });
  
  it('should fail with invalid credentials', () => {
    const env = {
      ...process.env,
      NODE_CONFIG: JSON.stringify({
        user: { infoPath: testUserInfoPath },
        push: { 
          endpoint: `http://localhost:${port}/v1/usage/push`,
          timeout: 5000
        }
      })
    };
    
    expect(() => {
      execSync(
        `node ${cliPath} cc login -e wrong@example.com -p wrongpass`,
        { env, encoding: 'utf8' }
      );
    }).toThrow('Invalid credentials');
  });
  
  it('should not login if already authenticated', () => {
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
        user: { infoPath: testUserInfoPath },
        push: { 
          endpoint: `http://localhost:${port}/v1/usage/push`,
          timeout: 5000
        }
      })
    };
    
    const output = execSync(
      `node ${cliPath} cc login -t valid-token`,
      { env, encoding: 'utf8' }
    );
    
    expect(output).toContain('Already logged in as existing@example.com');
  });
});