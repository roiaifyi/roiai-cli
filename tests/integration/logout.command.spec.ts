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
    // Create machine info first
    const testMachineInfoPath = path.join(TEST_DATA_DIR, 'machine_info.json');
    const machineInfo = {
      machineId: '123',
      macAddress: 'aa:bb:cc:dd:ee:ff',
      osInfo: {
        platform: 'darwin',
        release: '20.0.0',
        arch: 'x64',
        hostname: 'test-machine'
      },
      createdAt: new Date().toISOString(),
      version: 2
    };
    fs.mkdirSync(path.dirname(testMachineInfoPath), { recursive: true });
    fs.writeFileSync(testMachineInfoPath, JSON.stringify(machineInfo));
    
    // Create user info with auth
    const userInfo = {
      anonymousId: 'anon-123',
      clientMachineId: '123',
      auth: {
        userId: 'user-123',
        email: 'test@example.com',
        username: 'test',
        apiToken: 'token-123'
      }
    };
    fs.mkdirSync(path.dirname(testUserInfoPath), { recursive: true });
    fs.writeFileSync(testUserInfoPath, JSON.stringify(userInfo));
    
    const env = {
      ...process.env,
      NODE_CONFIG: JSON.stringify({
        database: { path: TEST_DB_PATH },
        app: { dataDir: TEST_DATA_DIR },
        user: { infoPath: testUserInfoPath },
        claudeCode: {
          rawDataPath: TEST_DATA_DIR,
          pricingUrl: 'https://example.com/pricing',
          pricingCacheTimeout: 0,
          cacheDurationDefault: 5,
          batchSize: 100
        },
        api: {
          baseUrl: 'http://localhost:3000'
        },
        push: {
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
    
    // Check user info file was deleted
    expect(fs.existsSync(testUserInfoPath)).toBe(false);
  });
  
  it('should show warning when not logged in', () => {
    // Create machine info (needed for generating default user info)
    const testMachineInfoPath = path.join(TEST_DATA_DIR, 'machine_info.json');
    const machineInfo = {
      machineId: '123',
      macAddress: 'aa:bb:cc:dd:ee:ff',
      osInfo: {
        platform: 'darwin',
        release: '20.0.0',
        arch: 'x64',
        hostname: 'test-machine'
      },
      createdAt: new Date().toISOString(),
      version: 2
    };
    fs.mkdirSync(path.dirname(testMachineInfoPath), { recursive: true });
    fs.writeFileSync(testMachineInfoPath, JSON.stringify(machineInfo));
    
    // Create user info without auth
    const userInfo = {
      anonymousId: 'anon-123',
      clientMachineId: '123'
    };
    fs.mkdirSync(path.dirname(testUserInfoPath), { recursive: true });
    fs.writeFileSync(testUserInfoPath, JSON.stringify(userInfo));
    
    const env = {
      ...process.env,
      NODE_CONFIG: JSON.stringify({
        database: { path: TEST_DB_PATH },
        app: { dataDir: TEST_DATA_DIR },
        user: { infoPath: testUserInfoPath },
        claudeCode: {
          rawDataPath: TEST_DATA_DIR,
          pricingUrl: 'https://example.com/pricing',
          pricingCacheTimeout: 0,
          cacheDurationDefault: 5,
          batchSize: 100
        },
        api: {
          baseUrl: 'http://localhost:3000'
        },
        push: {
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