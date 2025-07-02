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
  
  beforeAll(async () => {
    // Set up test database
    execSync('node ' + path.join(__dirname, '../helpers/setup-test-db.js'), {
      env: { ...process.env, TEST_DB_PATH },
      stdio: 'inherit'
    });
    
    // Start the mock server as a separate process
    const mockServerPath = path.join(__dirname, '../helpers/mock-server.js');
    mockServerProcess = spawn('node', [mockServerPath], {
      env: {
        ...process.env,
        MOCK_SERVER_PORT: port.toString()
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // Handle server output
    mockServerProcess.stdout?.on('data', (data) => {
      console.log('Mock server:', data.toString().trim());
    });
    
    // Handle server errors
    mockServerProcess.stderr?.on('data', (data) => {
      console.error('Mock server error:', data.toString());
    });
    
    mockServerProcess.on('error', (err) => {
      console.error('Failed to start mock server:', err);
      throw err;
    });
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 1500));
  });
  
  afterAll((done) => {
    // Kill the mock server
    if (mockServerProcess && !mockServerProcess.killed) {
      mockServerProcess.on('exit', () => {
        // Clean up test database
        if (fs.existsSync(TEST_DB_PATH)) {
          fs.unlinkSync(TEST_DB_PATH);
        }
        done();
      });
      mockServerProcess.kill('SIGTERM');
      // Force kill after timeout
      setTimeout(() => {
        if (!mockServerProcess.killed) {
          mockServerProcess.kill('SIGKILL');
        }
        // Clean up test database
        if (fs.existsSync(TEST_DB_PATH)) {
          fs.unlinkSync(TEST_DB_PATH);
        }
        done();
      }, 1000);
    } else {
      // Clean up test database
      if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
      }
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
    
    let output;
    try {
      output = execSync(
        `node ${cliPath} cc login -e test@example.com -p password123 2>&1`,
        { env, encoding: 'utf8', shell: '/bin/bash' }
      );
    } catch (err: any) {
      console.error('Login command failed:');
      console.error('stdout:', err.stdout);
      console.error('stderr:', err.stderr);
      console.error('status:', err.status);
      throw err;
    }
    
    // Check for success indication (console.log output)
    expect(output).toContain('You can now use \'roiai cc push\' to sync your usage data.');
    
    // Check user info file was created
    expect(fs.existsSync(testUserInfoPath)).toBe(true);
    const userInfo = JSON.parse(fs.readFileSync(testUserInfoPath, 'utf8'));
    // Check user info format
    expect(userInfo.user).toBeDefined();
    expect(userInfo.user.id).toBe('123');
    expect(userInfo.user.email).toBe('test@example.com');
    expect(userInfo.user.username).toBe('testuser');
    expect(userInfo.api_key).toBe('roiai_auth-token-123');
  });
  
  it('should login successfully with token', () => {
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
    
    let output;
    try {
      output = execSync(
        `node ${cliPath} cc login -t valid-token 2>&1`,
        { env, encoding: 'utf8', shell: '/bin/bash' }
      );
    } catch (err: any) {
      console.error('Login with token command failed:');
      console.error('stdout:', err.stdout);
      console.error('stderr:', err.stderr);
      console.error('status:', err.status);
      throw err;
    }
    
    // Check for success indication
    expect(output).toContain('You can now use \'roiai cc push\' to sync your usage data.');
  });
  
  it('should fail with invalid credentials', () => {
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
  
  it('should allow re-login and revoke old API key', () => {
    // Create existing user info with auth
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
    
    const existingUserInfo = {
      anonymousId: 'anon-123',
      clientMachineId: '123',
      auth: {
        userId: 'user-existing',
        email: 'existing@example.com',
        username: 'existing',
        apiToken: 'existing-token'
      }
    };
    fs.mkdirSync(path.dirname(testUserInfoPath), { recursive: true });
    fs.writeFileSync(testUserInfoPath, JSON.stringify(existingUserInfo));
    
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
    
    let output;
    try {
      output = execSync(
        `node ${cliPath} cc login -t valid-token 2>&1`,
        { env, encoding: 'utf8', shell: '/bin/bash' }
      );
    } catch (err: any) {
      console.error('Re-login command failed:');
      console.error('stdout:', err.stdout);
      console.error('stderr:', err.stderr);
      console.error('status:', err.status);
      throw err;
    }
    
    expect(output).toContain('Successfully switched from existing@example.com to test@example.com');
  });
});