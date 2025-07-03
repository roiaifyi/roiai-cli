import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { PushService } from '../../src/services/push.service';
import { UserService } from '../../src/services/user.service';
import { PushConfig } from '../../src/models/types';
import { TEST_DB_PATH, resetTestDatabase } from '../setup';

describe('PushService Integration Tests', () => {
  let mockServerProcess: ChildProcess;
  let pushService: PushService;
  let userService: UserService;
  let prisma: PrismaClient;
  const testPort = 3457;
  
  // Helper to set mock server behavior
  const setMockServerMode = (mode: 'none' | 'total' | 'partial') => {
    const controlPath = path.join(__dirname, '../helpers/mock-control.json');
    fs.writeFileSync(controlPath, JSON.stringify({ failureMode: mode }, null, 2));
  };

  const pushConfig: PushConfig = {
    batchSize: 10,
    maxRetries: 3,
    timeout: 5000
  };

  beforeAll(async () => {
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
    await new Promise<void>((resolve, reject) => {
      mockServerProcess.on('message', (msg: any) => {
        if (msg.type === 'ready') {
          resolve();
        }
      });
      
      // Handle server errors
      mockServerProcess.stderr?.on('data', (data) => {
        console.error('Mock server error:', data.toString());
      });
      
      mockServerProcess.on('error', (err) => {
        console.error('Failed to start mock server:', err);
        reject(err);
      });
      
      // Timeout after 5 seconds
      setTimeout(() => reject(new Error('Mock server startup timeout')), 5000);
    });
    
    // Wait a bit to ensure global setup is complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Set up test database
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${TEST_DB_PATH}`
        }
      },
      log: ['error'] // Only log errors
    });
    
    // Create a mock user service
    userService = new UserService();
    // Mock the user service methods
    userService.getUserInfo = () => ({
      anonymousId: 'test-user',
      clientMachineId: 'test-machine',
      auth: {
        userId: 'authenticated-user',
        email: 'test@example.com',
        username: 'test',
        apiToken: 'test-auth-token'
      }
    });
    userService.getUserId = () => 'test-user';
    userService.getClientMachineId = () => 'test-machine';
    userService.isAuthenticated = () => true;
    userService.getAuthenticatedUserId = () => '550e8400-e29b-41d4-a716-446655440000'; // Valid UUID
    userService.getApiToken = () => 'test-auth-token';
    
    // Create push service with custom endpoint
    pushService = new PushService(prisma, pushConfig, userService);
    
    // Override the apiClient to use the correct test endpoint
    const { createApiClient } = require('../../src/api/typed-client');
    const testEndpoint = `http://127.0.0.1:${testPort}`;
    pushService['apiClient'] = createApiClient(testEndpoint, 'test-auth-token');
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

  beforeEach(async () => {
    await resetTestDatabase();
    setMockServerMode('none');
    // Ensure we have a fresh database connection
    await prisma.$disconnect();
    await prisma.$connect();
    // Small delay to ensure database is fully ready
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  // Helper to create test data
  const createTestData = async (messageCount: number = 10, retryCount: number = 0) => {
    const testId = Date.now().toString(); // Unique ID for this test run
    const user = await prisma.user.create({
      data: {
        id: `test-user-${testId}`,
        email: 'test@example.com'
      }
    });

    const machine = await prisma.machine.create({
      data: {
        id: `test-machine-${testId}`,
        userId: user.id,
        machineName: 'Test Machine'
      }
    });

    const project = await prisma.project.create({
      data: {
        id: `test-project-${testId}`,
        projectName: 'Test Project',
        userId: user.id,
        clientMachineId: machine.id
      }
    });

    const session = await prisma.session.create({
      data: {
        id: `test-session-${testId}`,
        projectId: project.id,
        userId: user.id,
        clientMachineId: machine.id
      }
    });

    const messages = [];
    for (let i = 0; i < messageCount; i++) {
      const message = await prisma.message.create({
        data: {
          id: `msg-${testId}-${i}`,
          messageId: `msg-${testId}-${i}`,
          sessionId: session.id,
          projectId: project.id,
          userId: user.id,
          clientMachineId: machine.id,
          timestamp: new Date(),
          role: i % 2 === 0 ? 'user' : 'assistant',
          model: 'claude-3',
          inputTokens: 100n,
          outputTokens: 200n,
          cacheCreationTokens: 0n,
          cacheReadTokens: 0n,
          messageCost: 0.003,
          writer: i % 2 === 0 ? 'human' : 'assistant',
          syncStatus: {
            create: {
              retryCount
            }
          }
        }
      });
      messages.push(message);
    }

    return { user, machine, project, session, messages };
  };

  describe('End-to-end push flow', () => {
    it('should successfully push a batch of messages', async () => {
      await createTestData(15);
      
      // Push messages using the service methods
      let totalPushed = 0;
      let batchCount = 0;
      
      while (true) {
        const messages = await pushService.selectUnpushedBatchWithEntities(10);
        if (messages.length === 0) break;
        
        batchCount++;
        const request = pushService.buildPushRequest(messages);
        const response = await pushService.executePush(request);
        await pushService.processPushResponse(response);
        
        totalPushed += messages.length;
      }
      
      expect(batchCount).toBe(2); // 15 messages with batch size 10
      expect(totalPushed).toBe(15);
      
      // Verify all messages are marked as synced
      const syncedCount = await prisma.messageSyncStatus.count({
        where: { syncedAt: { not: null } }
      });
      expect(syncedCount).toBe(15);
    });

    it('should handle partial failures correctly', async () => {
      await createTestData(10);
      setMockServerMode('partial');
      
      let successCount = 0;
      let failureCount = 0;
      
      const messages = await pushService.selectUnpushedBatchWithEntities(10);
      const request = pushService.buildPushRequest(messages);
      
      try {
        const response = await pushService.executePush(request);
        await pushService.processPushResponse(response);
        
        // Handle new response format
        successCount = response.results.persisted.count + response.results.deduplicated.count;
        failureCount = response.results.failed.count;
      } catch (error) {
        // Count as all failed if request fails
        failureCount = messages.length;
      }
      
      expect(successCount).toBeGreaterThan(0);
      expect(failureCount).toBeGreaterThan(0);
      expect(successCount + failureCount).toBe(10);
      
      // Verify retry counts were incremented for failed messages
      const failedMessages = await prisma.messageSyncStatus.findMany({
        where: { 
          syncedAt: null,
          retryCount: { gt: 0 }
        }
      });
      expect(failedMessages.length).toBeGreaterThan(0);
    });

    it('should respect retry limits', async () => {
      await createTestData(5, 3); // Messages with 3 retries (max)
      
      const eligibleCount = await pushService.countEligibleMessages();
      expect(eligibleCount).toBe(0);
      
      const messages = await pushService.selectUnpushedBatchWithEntities(10);
      expect(messages.length).toBe(0);
    });

    it('should handle network errors', async () => {
      await createTestData(5);
      setMockServerMode('total');
      
      let errorOccurred = false;
      let errorMessage = '';
      
      const messages = await pushService.selectUnpushedBatchWithEntities(10);
      const messageIds = messages.map(msg => msg.messageId);
      const request = pushService.buildPushRequest(messages);
      
      try {
        await pushService.executePush(request);
      } catch (error: any) {
        errorOccurred = true;
        errorMessage = error.message;
        // Increment retry counts for failed batch
        await pushService.incrementRetryCountForBatch(messageIds);
      }
      
      expect(errorOccurred).toBe(true);
      expect(errorMessage).toContain('Push failed');
      
      // Verify retry counts were incremented
      const syncStatuses = await prisma.messageSyncStatus.findMany({
        where: { messageId: { in: messageIds } }
      });
      expect(syncStatuses.every(m => m.retryCount === 1)).toBe(true);
    });

    it('should handle authentication errors', async () => {
      await createTestData(5);
      
      // Create service without auth token
      const unauthUserService = new UserService();
      unauthUserService.getUserInfo = () => ({
        anonymousId: 'test-user',
        clientMachineId: 'test-machine'
      });
      unauthUserService.getUserId = () => 'test-user';
      unauthUserService.getClientMachineId = () => 'test-machine';
      unauthUserService.isAuthenticated = () => false;
      unauthUserService.getAuthenticatedUserId = () => null;
      unauthUserService.getApiToken = () => null;
      
      // This should throw because no authenticated user
      expect(() => {
        new PushService(prisma, pushConfig, unauthUserService);
      }).toThrow('No API token available');
    });
  });

  describe('Statistics', () => {
    it('should provide accurate push statistics', async () => {
      const { messages } = await createTestData(20);
      
      // Mark some as already synced
      const messagesToSync = messages.slice(0, 5).map(m => m.messageId);
      await prisma.messageSyncStatus.updateMany({
        where: { messageId: { in: messagesToSync } },
        data: { syncedAt: new Date() }
      });
      
      const stats = await pushService.getPushStatistics();
      
      expect(stats.total).toBe(20);
      expect(stats.synced).toBe(5);
      expect(stats.unsynced).toBe(15);
      expect(stats.retryDistribution['0'].count).toBe(15);
    });
  });

  describe('Force retry', () => {
    it('should reset retry counts when requested', async () => {
      await createTestData(5, 3);
      
      const resetCount = await pushService.resetRetryCount();
      expect(resetCount).toBe(5);
      
      // Now messages should be eligible
      const eligibleCount = await pushService.countEligibleMessages();
      expect(eligibleCount).toBe(5);
      
      // Verify retry counts were reset
      const syncStatuses = await prisma.messageSyncStatus.findMany();
      expect(syncStatuses.every(m => m.retryCount === 0)).toBe(true);
    });

    it('should reset specific messages only', async () => {
      const { messages } = await createTestData(10, 2);
      
      // Reset only specific messages
      const messageIds = messages.slice(0, 3).map(m => m.messageId);
      const resetCount = await pushService.resetRetryCount(messageIds);
      expect(resetCount).toBe(3);
      
      // Verify only specified messages were reset
      const resetMessages = await prisma.messageSyncStatus.findMany({
        where: { messageId: { in: messageIds } }
      });
      expect(resetMessages.every((m: any) => m.retryCount === 0)).toBe(true);
      
      // Verify other messages still have retry count
      const otherMessages = await prisma.messageSyncStatus.findMany({
        where: { messageId: { notIn: messageIds } }
      });
      expect(otherMessages.every((m: any) => m.retryCount === 2)).toBe(true);
    });
  });
});