import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import express, { Request, Response } from 'express';
import { Server } from 'http';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { PushRequest, PushResponse } from '../../src/models/types';
import { TEST_DB_PATH, TEST_DATA_DIR, resetTestDatabase } from '../setup';

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
  const cliPath = path.join(__dirname, '../../dist/index.js');
  
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
        endpoint: `http://localhost:${testPort}/v1/usage/push`,
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

  beforeAll(async () => {
    // Create mock server
    mockServer = new MockPushServer();
    await mockServer.start(testPort);
    console.error(`Mock push server started on port ${testPort}`);

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
    await mockServer.stop();
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
    mockServer.reset();
    await resetTestDatabase();
    
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
    it.skip('should push messages successfully', async () => {
      // Create test data
      await createTestData(15);

      // Run push command with test config
      const output = runCli('cc push -v');

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

    it.skip('should handle partial failures', async () => {
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

    it.skip('should handle network errors gracefully', async () => {
      await createTestData(5);

      // Configure server to fail
      mockServer.setFailure(500);

      const output = runCli('cc push');

      expect(output).toContain('Batch 1 failed');
      expect(output).toContain('Failed to push: 5');
    });

    it('should respect retry limits', async () => {
      // Create messages with high retry count
      await createTestData(5, 3);

      const output = runCli('cc push');

      expect(output).toContain('all have reached max retries');
      
      // No requests should be made
      expect(mockServer.getRequests()).toHaveLength(0);
    });

    it.skip('should handle force flag to reset retries', async () => {
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
      
      const output = runCli('cc push --dry-run');

      expect(output).toContain('Dry run mode');
      expect(output).toContain('Would push 25 messages');
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