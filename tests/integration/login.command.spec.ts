import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { execSync, spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { TEST_DB_PATH, TEST_DATA_DIR } from '../setup';

describe('Login Command Integration', () => {
  let mockServerProcess: ChildProcess;
  const port = 54322; // Use different port to avoid conflicts
  const cliPath = path.join(__dirname, '../../dist/index.js');
  const testUserInfoPath = path.join(TEST_DATA_DIR, 'user_info.json');
  
  beforeAll((done) => {
    // Start the mock server as a separate process
    const mockServerPath = path.join(__dirname, '../helpers/mock-server.js');
    mockServerProcess = spawn('node', [mockServerPath], {
      env: {
        ...process.env,
        MOCK_SERVER_PORT: port.toString()
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    
    // Wait for server to be ready
    mockServerProcess.on('message', (msg: any) => {
      if (msg.type === 'ready') {
        done();
      }
    });
    
    // Handle server errors
    mockServerProcess.stderr?.on('data', (data) => {
      console.error('Mock server error:', data.toString());
    });
    
    mockServerProcess.on('error', (err) => {
      console.error('Failed to start mock server:', err);
      done(err);
    });
  });
  
  afterAll((done) => {
    // Kill the mock server
    if (mockServerProcess && !mockServerProcess.killed) {
      mockServerProcess.on('exit', () => done());
      mockServerProcess.kill('SIGTERM');
      // Force kill after timeout
      setTimeout(() => {
        if (!mockServerProcess.killed) {
          mockServerProcess.kill('SIGKILL');
        }
        done();
      }, 1000);
    } else {
      done();
    }
  });
  
  beforeEach(() => {
    // Clean up any existing user info
    if (fs.existsSync(testUserInfoPath)) {
      fs.unlinkSync(testUserInfoPath);
    }
    
    // Ensure test data directory exists
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  });
  
  afterEach(() => {
    // Clean up test user info
    if (fs.existsSync(testUserInfoPath)) {
      fs.unlinkSync(testUserInfoPath);
    }
  });
  
  it('should login successfully with email and password', () => {
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
        api: {
          baseUrl: `http://127.0.0.1:${port}`
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
    
    const output = execSync(
      `node ${cliPath} cc login -e test@example.com -p password123 2>&1`,
      { env, encoding: 'utf8', shell: '/bin/bash' }
    );
    
    // Check for success indication (console.log output)
    expect(output).toContain('You can now use \'roiai-cli cc push\' to sync your usage data.');
    
    // Check user info file was created
    expect(fs.existsSync(testUserInfoPath)).toBe(true);
    const userInfo = JSON.parse(fs.readFileSync(testUserInfoPath, 'utf8'));
    // Check new format from spec
    expect(userInfo.username).toBe('testuser');
    expect(userInfo.api_key).toBe('roiai_auth-token-123');
  });
  
  it('should login successfully with token', () => {
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
        api: {
          baseUrl: `http://127.0.0.1:${port}`
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
    
    const output = execSync(
      `node ${cliPath} cc login -t valid-token 2>&1`,
      { env, encoding: 'utf8', shell: '/bin/bash' }
    );
    
    // Check for success indication
    expect(output).toContain('You can now use \'roiai-cli cc push\' to sync your usage data.');
  });
  
  it('should fail with invalid credentials', () => {
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
        api: {
          baseUrl: `http://127.0.0.1:${port}`
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
    
    try {
      execSync(
        `node ${cliPath} cc login -e wrong@example.com -p wrongpass 2>&1`,
        { env, encoding: 'utf8', shell: '/bin/bash' }
      );
      // Should not reach here
      expect(true).toBe(false);
    } catch (error: any) {
      // Check that the command failed and output contains the error
      expect(error.stdout || error.stderr || error.message).toContain('Invalid credentials');
    }
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
        database: { path: TEST_DB_PATH },
        user: { infoPath: testUserInfoPath },
        claudeCode: {
          rawDataPath: TEST_DATA_DIR,
          pricingUrl: 'https://example.com/pricing',
          pricingCacheTimeout: 0,
          cacheDurationDefault: 5,
          batchSize: 100
        },
        api: {
          baseUrl: `http://127.0.0.1:${port}`
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
    
    const output = execSync(
      `node ${cliPath} cc login -t valid-token 2>&1`,
      { env, encoding: 'utf8', shell: '/bin/bash' }
    );
    
    expect(output).toContain('Already logged in as existing@example.com');
  });
});