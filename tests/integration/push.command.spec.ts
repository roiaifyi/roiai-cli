import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import express, { Request, Response } from 'express';
import { Server } from 'http';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { PushRequest, PushResponse } from '../../src/models/types';

// Create a mock server for testing
class MockPushServer {
  private app: express.Application;
  private server: Server | null = null;
  private requests: PushRequest[] = [];
  private responseOverride: Partial<PushResponse> | null = null;
  private shouldFail = false;
  private failureStatus = 500;

  constructor() {
    this.app = express();
    this.app.use(express.json({ limit: '10mb' }));
    
    this.app.post('/v1/usage/push', (req: Request, res: Response) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      if (this.shouldFail) {
        return res.status(this.failureStatus).json({ message: 'Server error' });
      }

      const request = req.body as PushRequest;
      this.requests.push(request);

      const defaultResponse: PushResponse = {
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
            users: Object.keys(request.entities.users).length,
            machines: Object.keys(request.entities.machines).length,
            projects: Object.keys(request.entities.projects).length,
            sessions: Object.keys(request.entities.sessions).length
          },
          aggregatesUpdated: true,
          processingTimeMs: 100
        }
      };

      const response = this.responseOverride || defaultResponse;
      return res.json(response);
    });
  }

  start(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(port, () => resolve());
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  getRequests(): PushRequest[] {
    return this.requests;
  }

  reset(): void {
    this.requests = [];
    this.responseOverride = null;
    this.shouldFail = false;
    this.failureStatus = 500;
  }

  setResponseOverride(response: Partial<PushResponse>): void {
    this.responseOverride = response as PushResponse;
  }

  setFailure(status: number = 500): void {
    this.shouldFail = true;
    this.failureStatus = status;
  }
}

describe('Push Command Integration Tests', () => {
  let mockServer: MockPushServer;
  let prisma: PrismaClient;
  const testPort = 3456;
  const testConfigDir = path.join(__dirname, '../test-config');
  const testConfigPath = path.join(testConfigDir, 'test.json');
  const cliPath = path.join(__dirname, '../../dist/index.js');
  
  // Helper to run CLI commands with test config
  const runCli = (command: string) => {
    try {
      const result = execSync(
        `node ${cliPath} ${command} 2>&1`,
        { 
          encoding: 'utf8',
          env: {
            ...process.env,
            NODE_CONFIG_DIR: testConfigDir,
            NODE_ENV: 'test',
            SUPPRESS_NO_CONFIG_WARNING: '1'
          }
        }
      );
      return result;
    } catch (error: any) {
      // Return the combined output even if command failed
      return error.output ? error.output.join('') : '';
    }
  };

  beforeAll(async () => {
    // Create mock server
    mockServer = new MockPushServer();
    await mockServer.start(testPort);

    // Create test data directory
    const testDataDir = path.join(__dirname, '../../test_data');
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }
    
    // Create test config directory
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }

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
    fs.writeFileSync(path.join(testDataDir, 'user_info.json'), JSON.stringify(userInfo, null, 2));
    
    // Create test configuration with all required sections
    const testDbPath = path.resolve(__dirname, '../../prisma/test-push-integration.db');
    const testConfig = {
      database: {
        path: testDbPath
      },
      user: {
        infoPath: path.join(testDataDir, 'user_info.json')
      },
      claudeCode: {
        rawDataPath: testDataDir,
        pricingUrl: 'https://example.com/pricing',
        pricingCacheTimeout: 0,
        cacheDurationDefault: 5,
        batchSize: 100
      },
      push: {
        endpoint: `http://localhost:${testPort}/v1/usage/push`,
        batchSize: 10,
        maxRetries: 3,
        timeout: 5000
      },
      watch: {
        pollInterval: 5000,
        ignored: ['**/node_modules/**', '**/.git/**']
      },
      logging: {
        level: 'error'
      }
    };

    fs.writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2));

    // Set up test database
    const testDb = testDbPath;
    
    // Create database directory if it doesn't exist
    const dbDir = path.dirname(testDb);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${testDb}`
        }
      }
    });

    // Clean up any existing test database
    if (fs.existsSync(testDb)) {
      fs.unlinkSync(testDb);
    }
    
    // Run migrations using db push to create fresh schema
    execSync('npx prisma db push --force-reset --skip-generate', {
      env: { ...process.env, DATABASE_URL: `file:${testDb}` }
    });
  });

  afterAll(async () => {
    await mockServer.stop();
    await prisma.$disconnect();
    
    // Clean up test files
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
    const testDbPath = path.resolve(__dirname, '../../prisma/test-push-integration.db');
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    const testDataDir = path.join(__dirname, '../../test_data');
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
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
    mockServer.reset();
    
    // Clear database
    await prisma.syncStatus.deleteMany();
    await prisma.message.deleteMany();
    await prisma.session.deleteMany();
    await prisma.project.deleteMany();
    await prisma.machine.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('Authentication Requirements', () => {
    it('should fail when not authenticated', async () => {
      const userInfoPath = path.join(__dirname, '../fixtures/test-user-info.json');
      
      // Create anonymous user info without auth
      const userInfo = {
        userId: 'anon-test',
        clientMachineId: 'test-machine'
      };
      fs.mkdirSync(path.dirname(userInfoPath), { recursive: true });
      fs.writeFileSync(userInfoPath, JSON.stringify(userInfo));
      
      const env = {
        ...process.env,
        NODE_CONFIG: JSON.stringify({
          user: { infoPath: userInfoPath },
          push: { endpoint: `http://localhost:${testPort}/v1/usage/push` }
        })
      };
      
      try {
        execSync(`node ${cliPath} cc push`, 
          { env, encoding: 'utf8' }
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.stdout || error.stderr || error.message).toContain('Please login first');
      } finally {
        if (fs.existsSync(userInfoPath)) {
          fs.unlinkSync(userInfoPath);
        }
      }
    });
  });

  describe('Basic Push Flow', () => {
    it('should push messages successfully', async () => {
      // Create test data
      const { user, machine, project, session } = await createTestData();

      // Create messages
      const messages = [];
      for (let i = 0; i < 15; i++) {
        const message = await prisma.message.create({
          data: {
            uuid: `msg${i}`,
            messageId: `id${i}`,
            sessionId: session.id,
            projectId: project.id,
            userId: user.id,
            clientMachineId: machine.id,
            role: i % 2 === 0 ? 'user' : 'assistant',
            model: 'claude-3',
            inputTokens: 100n,
            outputTokens: 200n,
            cacheCreationTokens: 0n,
            cacheReadTokens: 0n,
            messageCost: 0.003,
            timestamp: new Date()
          }
        });
        messages.push(message);

        // Create sync status
        await prisma.syncStatus.create({
          data: {
            tableName: 'messages',
            recordId: message.uuid,
            operation: 'INSERT',
            localTimestamp: new Date(),
            retryCount: 0
          }
        });
      }

      // Wait a moment for database writes to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify data was created in our test database
      const unsyncedCount = await prisma.syncStatus.count({
        where: { syncedAt: null }
      });
      expect(unsyncedCount).toBe(15);
      
      // Ensure database file exists
      const dbPath = path.resolve(__dirname, '../../prisma/test-push-integration.db');
      expect(fs.existsSync(dbPath)).toBe(true);
      
      // Force a connection close to ensure data is written
      await prisma.$disconnect();
      await prisma.$connect();
      
      // Run push command with test config
      const output = runCli('cc push -v');
      
      // If it says all synced, check the database directly
      if (output.includes('All messages are already synced')) {
        // Check what the CLI sees
        const countAfter = await prisma.syncStatus.count({
          where: { syncedAt: null }
        });
        console.log('Unsynced count after push attempt:', countAfter);
        console.log('Full output:', output);
      }

      // Verify output
      expect(output).toContain('Found 15 unsynced messages');
      expect(output).toContain('15 persisted');
      expect(output).toContain('Total pushed: 15');

      // Verify server received requests
      const requests = mockServer.getRequests();
      expect(requests).toHaveLength(2); // 15 messages with batch size 10 = 2 batches
      expect(requests[0].messages).toHaveLength(10);
      expect(requests[1].messages).toHaveLength(5);
      
      // Verify user ID was replaced with authenticated user ID
      expect(requests[0].messages[0].userId).toBe('test-user-123');
      expect(requests[0].entities.users['test-user-123']).toBeDefined();
      expect(requests[0].entities.users['anon-test-machine']).toBeUndefined();

      // Verify sync status updated
      const syncedCount = await prisma.syncStatus.count({
        where: { syncedAt: { not: null } }
      });
      expect(syncedCount).toBe(15);
    });

    it('should handle partial failures', async () => {
      // Create test data
      await createTestData(5);

      // Configure server to fail some messages
      mockServer.setResponseOverride({
        batchId: 'test-batch',
        results: {
          persisted: {
            count: 3,
            messageIds: ['msg0', 'msg1', 'msg2']
          },
          deduplicated: {
            count: 0,
            messageIds: []
          },
          failed: {
            count: 2,
            details: [
              { messageId: 'msg3', error: 'Validation error' },
              { messageId: 'msg4', error: 'Invalid format' }
            ]
          }
        },
        summary: {
          totalMessages: 5,
          messagesSucceeded: 3,
          messagesFailed: 2,
          entitiesCreated: { users: 0, machines: 0, projects: 0, sessions: 0 },
          aggregatesUpdated: false,
          processingTimeMs: 50
        }
      });

      const output = runCli('cc push');

      expect(output).toContain('3 persisted');
      expect(output).toContain('2 failed');
      expect(output).toContain('Total pushed: 3');
      expect(output).toContain('Total failed: 2');

      // Verify failed messages have retry count incremented
      const failedMessages = await prisma.syncStatus.findMany({
        where: {
          recordId: { in: ['msg3', 'msg4'] }
        }
      });

      expect(failedMessages).toHaveLength(2);
      expect(failedMessages[0].retryCount).toBe(1);
      expect(failedMessages[0].syncResponse).toContain('error');
    });

    it('should handle network errors gracefully', async () => {
      await createTestData(5);

      // Configure server to fail
      mockServer.setFailure(500);

      const output = runCli('cc push');

      expect(output).toContain('Batch 1 failed');
      expect(output).toContain('Total failed: 5');
    });

    it('should respect retry limits', async () => {
      // Create messages with high retry count
      await createTestData(5, 3);

      const output = runCli('cc push');

      expect(output).toContain('All messages are already synced!');
      
      // No requests should be made
      expect(mockServer.getRequests()).toHaveLength(0);
    });

    it('should handle force flag to reset retries', async () => {
      await createTestData(5, 3);

      const output = runCli('cc push --force');

      expect(output).toContain('Reset retry count for 5 messages');
      expect(output).toContain('Total pushed: 5');

      // Verify retry counts were reset
      const messages = await prisma.syncStatus.findMany();
      expect(messages.every(m => m.retryCount === 0)).toBe(true);
    });

    it('should handle dry-run mode', async () => {
      await createTestData(25);
      
      // Debug: Check if sync_status records were created
      const syncCount = await prisma.syncStatus.count();
      console.log('Sync status count in test DB:', syncCount);
      console.log('Test DB path:', './prisma/test-cli.db');
      console.log('Test DB exists:', fs.existsSync('./prisma/test-cli.db'));

      // Read the test config to verify
      const configContent = fs.readFileSync(testConfigPath, 'utf8');
      console.log('Test config:', JSON.parse(configContent).database.path);
      
      const output = runCli('cc push --dry-run');
      console.log('CLI Output:', output);
      console.log('CLI Exit Code:', output ? 'success' : 'empty output');

      expect(output).toContain('Dry run mode');
      expect(output).toContain('Would push 10 messages in first batch');
      expect(output).toContain('Total batches needed: 3');

      // No requests should be made
      expect(mockServer.getRequests()).toHaveLength(0);

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