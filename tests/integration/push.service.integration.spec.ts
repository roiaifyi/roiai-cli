import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { PushService } from '../../src/services/push.service';
import { MockPushServer } from '../helpers/mock-server';
import { PushConfig } from '../../src/models/types';
import fs from 'fs';
import path from 'path';

describe('PushService Integration Tests', () => {
  let mockServer: MockPushServer;
  let pushService: PushService;
  let prisma: PrismaClient;
  const testPort = 3457;
  const testDbPath = './prisma/test-integration.db';

  beforeAll(async () => {
    // Start mock server
    mockServer = new MockPushServer({
      port: testPort,
      authToken: 'test-token'
    });
    await mockServer.start();

    // Create database directory if it doesn't exist
    const dbDir = path.dirname(testDbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Set up database
    process.env.DATABASE_URL = `file:${testDbPath}`;
    
    // Run migrations to create schema
    const { execSync } = require('child_process');
    execSync('npx prisma db push --force-reset --skip-generate', {
      env: { ...process.env, DATABASE_URL: `file:${testDbPath}` }
    });
    
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${testDbPath}`
        }
      }
    });

    // Initialize service
    const pushConfig: PushConfig = {
      endpoint: `http://localhost:${testPort}/v1/usage/push`,
      apiToken: 'test-token',
      batchSize: 10,
      maxRetries: 3,
      timeout: 5000
    };
    pushService = new PushService(prisma, pushConfig);
  });

  afterAll(async () => {
    await mockServer.stop();
    await prisma.$disconnect();
    
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  beforeEach(async () => {
    mockServer.reset();
    
    // Clear database using Prisma methods
    await prisma.syncStatus.deleteMany();
    await prisma.message.deleteMany();
    await prisma.session.deleteMany();
    await prisma.project.deleteMany();
    await prisma.machine.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('End-to-end push flow', () => {
    it('should successfully push a batch of messages', async () => {
      // Create test data
      const user = await prisma.user.create({
        data: {
          id: 'user1',
          email: 'test@example.com',
          username: 'testuser'
        }
      });

      const machine = await prisma.machine.create({
        data: {
          id: 'machine1',
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

      // Create messages and sync status
      const messageIds: string[] = [];
      for (let i = 0; i < 5; i++) {
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

        await prisma.syncStatus.create({
          data: {
            tableName: 'messages',
            recordId: message.uuid,
            operation: 'INSERT',
            localTimestamp: new Date(),
            retryCount: 0
          }
        });

        messageIds.push(message.uuid);
      }

      // Execute the full push flow
      const batch = await pushService.selectUnpushedBatch(10);
      expect(batch).toHaveLength(5);

      const messages = await pushService.loadMessagesWithEntities(batch);
      expect(messages).toHaveLength(5);

      const request = pushService.buildPushRequest(messages);
      expect(request.messages).toHaveLength(5);
      expect(Object.keys(request.entities.users).length).toBe(1);
      expect(Object.keys(request.entities.machines).length).toBe(1);
      expect(Object.keys(request.entities.projects).length).toBe(1);
      expect(Object.keys(request.entities.sessions).length).toBe(1);

      const response = await pushService.executePush(request);
      expect(response.results.persisted.count).toBe(5);
      expect(response.summary.totalMessages).toBe(5);

      await pushService.processPushResponse(response, batch);

      // Verify all messages are marked as synced
      const syncedCount = await prisma.syncStatus.count({
        where: {
          tableName: 'messages',
          syncedAt: { not: null }
        }
      });
      expect(syncedCount).toBe(5);

      // Verify server received the request
      expect(mockServer.getRequestCount()).toBe(1);
      const serverRequest = mockServer.getLastRequest();
      expect(serverRequest?.messages).toHaveLength(5);
    });

    it('should handle partial failures correctly', async () => {
      // Create minimal test data
      await createMinimalTestData(prisma, 3);

      // Configure server to return partial failure
      mockServer.queuePartialSuccess(3, 2);

      // Execute push flow
      const batch = await pushService.selectUnpushedBatch(10);
      const messages = await pushService.loadMessagesWithEntities(batch);
      const request = pushService.buildPushRequest(messages);
      const response = await pushService.executePush(request);

      expect(response.results.persisted.count).toBe(2);
      expect(response.results.failed.count).toBe(1);

      await pushService.processPushResponse(response, batch);

      // Verify sync status
      const synced = await prisma.syncStatus.count({
        where: { syncedAt: { not: null } }
      });
      expect(synced).toBe(2);

      const failed = await prisma.syncStatus.findFirst({
        where: { recordId: 'msg2' }
      });
      expect(failed?.retryCount).toBe(1);
      expect(failed?.syncResponse).toContain('Validation error');
    });

    it('should respect retry limits', async () => {
      // Create messages with max retries
      await createMinimalTestData(prisma, 3, 3);

      const batch = await pushService.selectUnpushedBatch(10);
      expect(batch).toHaveLength(0); // Should not select any
    });

    it('should handle network errors', async () => {
      await createMinimalTestData(prisma, 2);

      // Configure server to return error
      mockServer.queueError(500, 'Internal Server Error');

      const batch = await pushService.selectUnpushedBatch(10);
      const messages = await pushService.loadMessagesWithEntities(batch);
      const request = pushService.buildPushRequest(messages);

      await expect(pushService.executePush(request)).rejects.toThrow('Push failed: 500');
    });

    it('should handle authentication errors', async () => {
      // Create service with wrong token
      const badService = new PushService(prisma, {
        endpoint: `http://localhost:${testPort}/v1/usage/push`,
        apiToken: 'wrong-token',
        batchSize: 10,
        maxRetries: 3,
        timeout: 5000
      });

      await createMinimalTestData(prisma, 1);

      const batch = await badService.selectUnpushedBatch(10);
      const messages = await badService.loadMessagesWithEntities(batch);
      const request = badService.buildPushRequest(messages);

      await expect(badService.executePush(request)).rejects.toThrow('Push failed: 401');
    });
  });

  describe('Statistics', () => {
    it('should provide accurate push statistics', async () => {
      // Create mixed state data
      await createMinimalTestData(prisma, 10);

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

      const stats = await pushService.getPushStatistics();

      expect(stats.total).toBe(10);
      expect(stats.synced).toBe(3);
      expect(stats.unsynced).toBe(7);
      expect(stats.retryDistribution).toContainEqual({ retryCount: 0, count: 5 });
      expect(stats.retryDistribution).toContainEqual({ retryCount: 2, count: 2 });
    });
  });

  describe('Force retry', () => {
    it('should reset retry counts when requested', async () => {
      // Create messages with retries
      await createMinimalTestData(prisma, 5, 2);

      const resetCount = await pushService.resetRetryCount();
      expect(resetCount).toBe(5);

      // Verify all retry counts are 0
      const messages = await prisma.syncStatus.findMany();
      expect(messages.every(m => m.retryCount === 0)).toBe(true);
    });

    it('should reset specific messages only', async () => {
      await createMinimalTestData(prisma, 5, 2);

      const resetCount = await pushService.resetRetryCount(['msg0', 'msg1']);
      expect(resetCount).toBe(2);

      // Verify only specified messages were reset
      const reset = await prisma.syncStatus.findMany({
        where: { recordId: { in: ['msg0', 'msg1'] } }
      });
      expect(reset.every(m => m.retryCount === 0)).toBe(true);

      const notReset = await prisma.syncStatus.findMany({
        where: { recordId: { in: ['msg2', 'msg3', 'msg4'] } }
      });
      expect(notReset.every(m => m.retryCount === 2)).toBe(true);
    });
  });
});

// Helper function to create minimal test data
async function createMinimalTestData(
  prisma: PrismaClient, 
  count: number, 
  retryCount: number = 0
): Promise<void> {
  const user = await prisma.user.create({
    data: { id: 'user1', email: 'test@example.com' }
  });

  const machine = await prisma.machine.create({
    data: { id: 'machine1', userId: user.id }
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

  for (let i = 0; i < count; i++) {
    await prisma.message.create({
      data: {
        uuid: `msg${i}`,
        messageId: `id${i}`,
        sessionId: session.id,
        projectId: project.id,
        userId: user.id,
        clientMachineId: machine.id,
        role: 'user',
        model: 'claude-3',
        inputTokens: 100n,
        outputTokens: 200n,
        cacheCreationTokens: 0n,
        cacheReadTokens: 0n,
        messageCost: 0.003
      }
    });

    await prisma.syncStatus.create({
      data: {
        tableName: 'messages',
        recordId: `msg${i}`,
        operation: 'INSERT',
        localTimestamp: new Date(),
        retryCount
      }
    });
  }
}