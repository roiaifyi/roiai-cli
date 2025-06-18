import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

describe('Logout Command Integration', () => {
  const cliPath = path.join(__dirname, '../../dist/index.js');
  const testUserInfoPath = path.join(__dirname, '../fixtures/test-user-info.json');
  
  beforeEach(() => {
    // Clean up any existing user info
    if (fs.existsSync(testUserInfoPath)) {
      fs.unlinkSync(testUserInfoPath);
    }
  });
  
  afterEach(() => {
    // Clean up test user info
    if (fs.existsSync(testUserInfoPath)) {
      fs.unlinkSync(testUserInfoPath);
    }
  });
  
  it('should logout successfully when authenticated', () => {
    // Create user info with auth
    const userInfo = {
      userId: 'anon-123',
      clientMachineId: '123',
      auth: {
        realUserId: 'user-123',
        email: 'test@example.com',
        apiToken: 'token-123'
      }
    };
    fs.mkdirSync(path.dirname(testUserInfoPath), { recursive: true });
    fs.writeFileSync(testUserInfoPath, JSON.stringify(userInfo));
    
    const env = {
      ...process.env,
      NODE_CONFIG: JSON.stringify({
        user: { infoPath: testUserInfoPath }
      })
    };
    
    let output;
    try {
      output = execSync(
        `node ${cliPath} cc logout 2>&1`,
        { env, encoding: 'utf8', stdio: 'pipe' }
      );
    } catch (error: any) {
      output = error.stdout || error.stderr || '';
    }
    
    // The ora spinner output may not be captured perfectly by execSync
    // So we just check for the key parts of the message
    expect(output).toMatch(/Logged out from test@example\.com|Continuing in anonymous mode/);
    
    // Check auth was removed from user info
    const updatedUserInfo = JSON.parse(fs.readFileSync(testUserInfoPath, 'utf8'));
    expect(updatedUserInfo.auth).toBeUndefined();
    expect(updatedUserInfo.userId).toBe('anon-123');
  });
  
  it('should show warning when not logged in', () => {
    // Create user info without auth
    const userInfo = {
      userId: 'anon-123',
      clientMachineId: '123'
    };
    fs.mkdirSync(path.dirname(testUserInfoPath), { recursive: true });
    fs.writeFileSync(testUserInfoPath, JSON.stringify(userInfo));
    
    const env = {
      ...process.env,
      NODE_CONFIG: JSON.stringify({
        user: { infoPath: testUserInfoPath }
      })
    };
    
    let output;
    try {
      output = execSync(
        `node ${cliPath} cc logout 2>&1`,
        { env, encoding: 'utf8', stdio: 'pipe' }
      );
    } catch (error: any) {
      output = error.stdout || error.stderr || '';
    }
    
    expect(output).toMatch(/Not currently logged in/);
  });
});