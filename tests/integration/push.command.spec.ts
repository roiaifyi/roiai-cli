import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { execSync, spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { TEST_DB_PATH, TEST_DATA_DIR, resetTestDatabase } from '../setup';

describe('Push Command Integration Tests', () => {
  let mockServerProcess: ChildProcess;
  let prisma: PrismaClient;
  const testPort = 3456;
  const cliPath = path.join(__dirname, '../../dist/index.js');
  
  // Helper to set mock server behavior
  const setMockServerMode = (mode: 'none' | 'total' | 'partial') => {
    const controlPath = path.join(__dirname, '../helpers/mock-control.json');
    fs.writeFileSync(controlPath, JSON.stringify({ failureMode: mode }, null, 2));
  };

  // Helper to run CLI commands with test config
  const runCli = (command: string, config?: any) => {
    const testConfig = config || {
      database: { path: TEST_DB_PATH },
      user: { infoPath: path.join(TEST_DATA_DIR, 'user_info.json') },
      claudeCode: {
        rawDataPath: TEST_DATA_DIR,
        pricingUrl: 'https://example.com/pricing',
        pricingCacheTimeout: 0,
        cacheDurationDefault: 5,
        batchSize: 100
      },
      push: {
        endpoint: `http://127.0.0.1:${testPort}/v1/data/upsync`,
        batchSize: 10,
        maxRetries: 3,
        timeout: 5000
      },
      watch: {
        pollInterval: 5000,
        ignored: ['**/node_modules/**', '**/.git/**']
      },
      logging: { level: 'error' }
    };
    
    try {
      const result = execSync(
        `node ${cliPath} ${command} 2>&1`,
        { 
          encoding: 'utf8',
          env: {
            ...process.env,
            NODE_CONFIG: JSON.stringify(testConfig),
            NODE_ENV: 'test'
          }
        }
      );
      return result;
    } catch (error: any) {
      // Return the combined output even if command failed
      return error.output ? error.output.join('') : '';
    }
  };

  beforeAll((done) => {
    // Start the mock server as a separate process
    const mockServerPath = path.join(__dirname, '../helpers/mock-server.js');
    mockServerProcess = spawn('node', [mockServerPath], {
      env: {
        ...process.env,
        MOCK_SERVER_PORT: testPort.toString()
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    
    // Wait for server to be ready
    let serverReady = false;
    mockServerProcess.on('message', (msg: any) => {
      if (msg.type === 'ready' && !serverReady) {
        serverReady = true;
        console.log(`Mock push server started on port ${testPort}`);
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
    
    // Add timeout for server startup
    setTimeout(() => {
      if (!serverReady) {
        done(new Error('Mock server failed to start within timeout'));
      }
    }, 5000);

    // Create authenticated user info
    const userInfo = {
      userId: 'anon-test-machine',
      clientMachineId: 'test-machine',
      auth: {
        realUserId: 'test-user-123',
        email: 'test@example.com',
        apiToken: 'test-auth-token'
      }
    };
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(TEST_DATA_DIR, 'user_info.json'), JSON.stringify(userInfo, null, 2));
    
    // Use the global test database
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${TEST_DB_PATH}`
        }
      }
    });
  });

  afterAll(async () => {
    // Kill the mock server
    if (mockServerProcess && !mockServerProcess.killed) {
      mockServerProcess.kill('SIGTERM');
      // Force kill after timeout
      await new Promise(resolve => {
        mockServerProcess.on('exit', resolve);
        setTimeout(() => {
          if (!mockServerProcess.killed) {
            mockServerProcess.kill('SIGKILL');
          }
          resolve(null);
        }, 1000);
      });
    }
    await prisma.$disconnect();
  });

  // Helper to create test data with correct user IDs
  const createTestData = async (messageCount: number = 0, retryCount: number = 0) => {
    const user = await prisma.user.create({
      data: {
        id: 'anon-test-machine',
        email: 'test@example.com',
        username: 'testuser'
      }
    });

    const machine = await prisma.machine.create({
      data: {
        id: 'test-machine',
        userId: user.id,
        machineName: 'Test Machine'
      }
    });

    const project = await prisma.project.create({
      data: {
        id: 'project1',
        projectName: 'Test Project',
        userId: user.id,
        clientMachineId: machine.id
      }
    });

    const session = await prisma.session.create({
      data: {
        id: 'session1',
        projectId: project.id,
        userId: user.id,
        clientMachineId: machine.id
      }
    });

    // Create messages if requested
    const messages = [];
    for (let i = 0; i < messageCount; i++) {
      const message = await prisma.message.create({
        data: {
          uuid: `msg${i}`,
          messageId: `msg${i}`,
          sessionId: session.id,
          projectId: project.id,
          userId: user.id,
          clientMachineId: machine.id,
          timestamp: new Date(Date.now() - i * 1000),
          role: 'user',
          model: 'claude-3',
          inputTokens: 100n,
          outputTokens: 200n,
          cacheCreationTokens: 0n,
          cacheReadTokens: 0n,
          messageCost: 0.003
        }
      });
      messages.push(message);

      await prisma.syncStatus.create({
        data: {
          tableName: 'messages',
          recordId: message.uuid,
          operation: 'INSERT',
          localTimestamp: new Date(),
          retryCount
        }
      });
    }

    return { user, machine, project, session, messages };
  };

  beforeEach(async () => {
    await resetTestDatabase();
    
    // Reset mock server mode
    setMockServerMode('none');
    
    // Restore authenticated user info for tests that need it
    const userInfo = {
      userId: 'anon-test-machine',
      clientMachineId: 'test-machine',
      auth: {
        realUserId: 'test-user-123',
        email: 'test@example.com',
        apiToken: 'test-auth-token'
      }
    };
    fs.writeFileSync(path.join(TEST_DATA_DIR, 'user_info.json'), JSON.stringify(userInfo, null, 2));
  });

  describe('Authentication Requirements', () => {
    it('should fail when not authenticated', async () => {
      // Create anonymous user info without auth
      const userInfo = {
        userId: 'anon-test',
        clientMachineId: 'test-machine'
      };
      fs.writeFileSync(path.join(TEST_DATA_DIR, 'user_info.json'), JSON.stringify(userInfo));
      
      const output = runCli('cc push');
      expect(output).toContain('Please login first');
    });
  });

  describe('Basic Push Flow', () => {
    it('should push messages successfully', async () => {
      // Create test data
      await createTestData(15);

      // Run push command with test config
      const output = runCli('cc push -v');

      // Verify output
      expect(output).toContain('Found 15 unsynced messages');
      expect(output).toContain('Successfully pushed: 15');

      // Verify sync status updated
      const syncedCount = await prisma.syncStatus.count({
        where: { syncedAt: { not: null } }
      });
      expect(syncedCount).toBe(15);
      
      // Verify the server received the correct data by checking the database
      // The mock server should have processed the messages correctly
    });

    it('should handle partial failures', async () => {
      // Create test data
      await createTestData(5);

      // Configure server to simulate partial failure
      setMockServerMode('partial');
      const output = runCli('cc push');

      // Verify output
      expect(output).toContain('failed');

      // Verify some messages were marked as synced, others have retry count incremented
      const syncedMessages = await prisma.syncStatus.findMany({
        where: { syncedAt: { not: null } }
      });
      const failedMessages = await prisma.syncStatus.findMany({
        where: { 
          syncedAt: null,
          retryCount: { gt: 0 }
        }
      });

      expect(syncedMessages.length).toBeGreaterThan(0);
      expect(failedMessages.length).toBeGreaterThan(0);
    });

    it('should handle network errors gracefully', async () => {
      await createTestData(5);

      // Configure server to fail
      setMockServerMode('total');
      const output = runCli('cc push');

      expect(output).toContain('Batch 1 failed');
      expect(output).toContain('Failed to push: 5');
    });

    it('should respect retry limits', async () => {
      // Create messages with high retry count
      await createTestData(5, 3);

      const output = runCli('cc push');

      expect(output).toContain('all have reached max retries');
    });

    it('should handle force flag to reset retries', async () => {
      await createTestData(5, 3);

      const output = runCli('cc push --force');

      expect(output).toContain('Reset retry count for 5 messages');
      expect(output).toContain('Successfully pushed: 5');

      // Verify retry counts were reset and messages were synced
      const messages = await prisma.syncStatus.findMany();
      const syncedMessages = messages.filter(m => m.syncedAt !== null);
      const unsyncedMessages = messages.filter(m => m.syncedAt === null);
      
      // All messages should either be synced (retryCount preserved) or have retryCount 0
      expect(syncedMessages.length).toBe(5);
      expect(unsyncedMessages.length).toBe(0);
    });

    it('should handle dry-run mode', async () => {
      await createTestData(25);
      
      const output = runCli('cc push --dry-run');

      expect(output).toContain('Dry run mode');
      expect(output).toContain('Would push 25 messages');
      expect(output).toContain('Total batches needed: 3');

      // No messages should be marked as synced
      const syncedCount = await prisma.syncStatus.count({
        where: { syncedAt: { not: null } }
      });
      expect(syncedCount).toBe(0);
    });
  });

  describe('Push Status Command', () => {
    it('should show correct statistics', async () => {
      // Create mixed state data
      await createTestData(10);
      
      // Mark some as synced
      await prisma.syncStatus.updateMany({
        where: { recordId: { in: ['msg0', 'msg1', 'msg2'] } },
        data: { syncedAt: new Date() }
      });

      // Mark some with retries
      await prisma.syncStatus.updateMany({
        where: { recordId: { in: ['msg3', 'msg4'] } },
        data: { retryCount: 2 }
      });

      const output = runCli('cc push-status');

      expect(output).toContain('Total Messages');
      expect(output).toContain('10');
      expect(output).toContain('Synced');
      expect(output).toContain('3');
      expect(output).toContain('Unsynced');
      expect(output).toContain('7');
      expect(output).toContain('Success Rate');
      expect(output).toContain('30.0%');
    });
  });
});