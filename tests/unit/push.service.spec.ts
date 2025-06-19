import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { PushService } from '../../src/services/push.service';
import { PrismaClient } from '@prisma/client';
import { PushConfig, PushRequest, PushResponse } from '../../src/models/types';
import axios from 'axios';

// Mock Prisma
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    syncStatus: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn()
    },
    message: {
      findMany: jest.fn()
    },
    $transaction: jest.fn(async (callback: any) => callback({
      syncStatus: {
        updateMany: jest.fn()
      }
    }))
  }))
}));

// Mock axios
jest.mock('axios');

describe('PushService', () => {
  let pushService: PushService;
  let mockPrisma: any;
  let mockAxiosInstance: any;

  const mockConfig: PushConfig = {
    endpoint: 'https://api.example.com/push',
    apiToken: 'test-token',
    batchSize: 100,
    maxRetries: 3,
    timeout: 5000
  };

  beforeEach(() => {
    mockPrisma = new PrismaClient();
    mockAxiosInstance = {
      post: jest.fn()
    };
    (axios.create as jest.MockedFunction<typeof axios.create>).mockReturnValue(mockAxiosInstance as any);
    pushService = new PushService(mockPrisma, mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('selectUnpushedBatch', () => {
    it('should select unpushed messages with retry limit', async () => {
      const mockRecords = [
        { recordId: 'msg1' },
        { recordId: 'msg2' },
        { recordId: 'msg3' }
      ];

      mockPrisma.syncStatus.findMany.mockResolvedValue(mockRecords);

      const result = await pushService.selectUnpushedBatch(100);

      expect(mockPrisma.syncStatus.findMany).toHaveBeenCalledWith({
        where: {
          tableName: 'messages',
          syncedAt: null,
          retryCount: { lt: mockConfig.maxRetries }
        },
        orderBy: { localTimestamp: 'asc' },
        take: 100,
        select: { recordId: true }
      });

      expect(result).toEqual(['msg1', 'msg2', 'msg3']);
    });

    it('should return empty array when no unpushed messages', async () => {
      mockPrisma.syncStatus.findMany.mockResolvedValue([]);

      const result = await pushService.selectUnpushedBatch(100);

      expect(result).toEqual([]);
    });
  });

  describe('loadMessagesWithEntities', () => {
    it('should load messages with all related entities', async () => {
      const mockMessages = [
        {
          uuid: 'msg1',
          messageId: 'id1',
          userId: 'user1',
          clientMachineId: 'machine1',
          projectId: 'project1',
          sessionId: 'session1',
          session: {
            project: {
              projectName: 'Test Project',
              user: { email: 'test@example.com' },
              machine: { machineName: 'Test Machine' }
            }
          }
        }
      ];

      mockPrisma.message.findMany.mockResolvedValue(mockMessages);

      const result = await pushService.loadMessagesWithEntities(['msg1']);

      expect(mockPrisma.message.findMany).toHaveBeenCalledWith({
        where: { uuid: { in: ['msg1'] } },
        include: {
          session: {
            include: {
              project: {
                include: {
                  machine: true,
                  user: true
                }
              }
            }
          }
        }
      });

      expect(result).toEqual(mockMessages);
    });
  });

  describe('buildPushRequest', () => {
    it('should build request with deduplicated entities', () => {
      const messages = [
        {
          uuid: 'msg1',
          messageId: 'id1',
          userId: 'user1',
          clientMachineId: 'machine1',
          projectId: 'project1',
          sessionId: 'session1',
          role: 'user',
          model: 'claude-3',
          inputTokens: 100,
          outputTokens: 200,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          messageCost: '0.003',
          timestamp: new Date('2024-01-01'),
          session: {
            project: {
              projectName: 'Test Project',
              user: { email: 'test@example.com', username: 'testuser' },
              machine: { machineName: 'Test Machine' }
            }
          }
        },
        {
          uuid: 'msg2',
          messageId: 'id2',
          userId: 'user1', // Same user
          clientMachineId: 'machine1', // Same machine
          projectId: 'project1', // Same project
          sessionId: 'session1', // Same session
          role: 'assistant',
          model: 'claude-3',
          inputTokens: 50,
          outputTokens: 150,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          messageCost: '0.002',
          timestamp: new Date('2024-01-02'),
          session: {
            project: {
              projectName: 'Test Project',
              user: { email: 'test@example.com', username: 'testuser' },
              machine: { machineName: 'Test Machine' }
            }
          }
        }
      ];

      const request = pushService.buildPushRequest(messages) as any;

      // Check new format has records array
      expect(request.records).toBeDefined();
      expect(request.records).toHaveLength(2);
      
      // Check first record
      expect(request.records[0].service).toBe('claude');
      expect(request.records[0].model).toBe('claude-3');
      expect(request.records[0].usage.prompt_tokens).toBe(100);
      expect(request.records[0].usage.completion_tokens).toBe(200);
      expect(request.records[0].cost).toBe(0.003);
      expect(request.records[0].metadata.message_id).toBe('id1');
      expect(request.records[0].metadata.uuid).toBe('msg1');
    });

    it('should handle missing optional fields', () => {
      const messages = [
        {
          uuid: 'msg1',
          messageId: 'id1',
          userId: 'user1',
          clientMachineId: 'machine1',
          projectId: 'project1',
          sessionId: 'session1',
          role: 'user',
          inputTokens: 100,
          outputTokens: 200,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          messageCost: '0.003',
          session: {
            project: {}
          }
        }
      ];

      const request = pushService.buildPushRequest(messages) as any;

      expect(request.records).toBeDefined();
      expect(request.records[0].model).toBe('unknown');
      expect(request.records[0].timestamp).toBeDefined();
    });
  });

  describe('executePush', () => {
    it('should successfully push data', async () => {
      const mockRequest: PushRequest = {
        batchId: 'batch1',
        timestamp: '2024-01-01T00:00:00Z',
        entities: {
          users: {},
          machines: {},
          projects: {},
          sessions: {}
        },
        messages: [],
        metadata: {
          clientVersion: '1.0.0',
          totalMessages: 0
        }
      };

      const mockResponse: PushResponse = {
        batchId: 'batch1',
        results: {
          persisted: { count: 2, messageIds: ['msg1', 'msg2'] },
          deduplicated: { count: 1, messageIds: ['msg3'] },
          failed: { count: 0, details: [] }
        },
        summary: {
          totalMessages: 3,
          messagesSucceeded: 3,
          messagesFailed: 0,
          entitiesCreated: { users: 1, machines: 1, projects: 1, sessions: 1 },
          aggregatesUpdated: true,
          processingTimeMs: 150
        }
      };

      mockAxiosInstance.post.mockResolvedValue({ data: mockResponse });

      const result = await pushService.executePush(mockRequest);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('', mockRequest);
      expect(result).toEqual(mockResponse);
    });

    it('should handle server errors', async () => {
      const mockRequest: PushRequest = {} as any;

      const error = new Error('Request failed');
      (error as any).isAxiosError = true;
      (error as any).response = {
        status: 400,
        data: { message: 'Invalid request' }
      };
      mockAxiosInstance.post.mockRejectedValue(error);

      await expect(pushService.executePush(mockRequest)).rejects.toThrow('Push failed: 400 - Invalid request');
    });

    it('should handle network errors', async () => {
      const mockRequest: PushRequest = {} as any;

      const error = new Error('Network timeout');
      (error as any).isAxiosError = true;
      (error as any).request = {};
      mockAxiosInstance.post.mockRejectedValue(error);

      await expect(pushService.executePush(mockRequest)).rejects.toThrow('Network error: Network timeout');
    });
  });

  describe('processPushResponse', () => {
    it('should update sync status based on response', async () => {
      const mockResponse = {
        success: true,
        data: {
          processed: 3,
          failed: 1,
          uploadId: 'upload_123'
        }
      };

      const messageIds = ['msg1', 'msg2', 'msg3', 'msg4'];

      const mockTx = {
        syncStatus: {
          updateMany: jest.fn()
        }
      };

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      await pushService.processPushResponse(mockResponse, messageIds);

      // Check first 3 messages marked as synced
      expect(mockTx.syncStatus.updateMany).toHaveBeenCalledWith({
        where: { tableName: 'messages', recordId: 'msg1' },
        data: expect.objectContaining({
          syncedAt: expect.any(Date),
          syncBatchId: 'upload_123',
          syncResponse: 'persisted'
        })
      });

      expect(mockTx.syncStatus.updateMany).toHaveBeenCalledWith({
        where: { tableName: 'messages', recordId: 'msg2' },
        data: expect.objectContaining({
          syncedAt: expect.any(Date),
          syncBatchId: 'upload_123',
          syncResponse: 'persisted'
        })
      });

      expect(mockTx.syncStatus.updateMany).toHaveBeenCalledWith({
        where: { tableName: 'messages', recordId: 'msg3' },
        data: expect.objectContaining({
          syncedAt: expect.any(Date),
          syncBatchId: 'upload_123',
          syncResponse: 'persisted'
        })
      });

      // Check last message marked as failed
      expect(mockTx.syncStatus.updateMany).toHaveBeenCalledWith({
        where: { tableName: 'messages', recordId: 'msg4' },
        data: {
          retryCount: { increment: 1 },
          syncResponse: 'failed'
        }
      });
    });
  });

  describe('resetRetryCount', () => {
    it('should reset retry count for all messages', async () => {
      mockPrisma.syncStatus.updateMany.mockResolvedValue({ count: 5 });

      const result = await pushService.resetRetryCount();

      expect(mockPrisma.syncStatus.updateMany).toHaveBeenCalledWith({
        where: { tableName: 'messages', syncedAt: null },
        data: { retryCount: 0, syncResponse: null }
      });

      expect(result).toBe(5);
    });

    it('should reset retry count for specific messages', async () => {
      mockPrisma.syncStatus.updateMany.mockResolvedValue({ count: 2 });

      const result = await pushService.resetRetryCount(['msg1', 'msg2']);

      expect(mockPrisma.syncStatus.updateMany).toHaveBeenCalledWith({
        where: { 
          tableName: 'messages',
          syncedAt: null,
          recordId: { in: ['msg1', 'msg2'] }
        },
        data: { retryCount: 0, syncResponse: null }
      });

      expect(result).toBe(2);
    });
  });

  describe('getPushStatistics', () => {
    it('should return comprehensive statistics', async () => {
      mockPrisma.syncStatus.count
        .mockResolvedValueOnce(1000) // total
        .mockResolvedValueOnce(800)  // synced
        .mockResolvedValueOnce(200); // unsynced

      mockPrisma.syncStatus.groupBy.mockResolvedValue([
        { retryCount: 0, _count: 150 },
        { retryCount: 1, _count: 30 },
        { retryCount: 2, _count: 15 },
        { retryCount: 3, _count: 5 }
      ]);

      const result = await pushService.getPushStatistics();

      expect(result).toEqual({
        total: 1000,
        synced: 800,
        unsynced: 200,
        retryDistribution: [
          { retryCount: 0, count: 150 },
          { retryCount: 1, count: 30 },
          { retryCount: 2, count: 15 },
          { retryCount: 3, count: 5 }
        ]
      });
    });
  });
});