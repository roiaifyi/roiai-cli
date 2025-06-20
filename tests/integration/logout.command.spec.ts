import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { TEST_DB_PATH, TEST_DATA_DIR } from '../setup';

describe('Logout Command Integration', () => {
  const cliPath = path.join(__dirname, '../../dist/index.js');
  const testUserInfoPath = path.join(TEST_DATA_DIR, 'user_info.json');
  
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
          endpoint: 'http://localhost:3000/v1/data/upsync',
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
          endpoint: 'http://localhost:3000/v1/data/upsync',
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