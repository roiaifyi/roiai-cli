import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { PushService } from '../../src/services/push.service';
import { PrismaClient } from '@prisma/client';
import { PushConfig, PushRequest, PushResponse } from '../../src/models/types';
import axios from 'axios';

// Mock Prisma
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    message: {
      findMany: jest.fn(),
      count: jest.fn()
    },
    messageSyncStatus: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      upsert: jest.fn()
    },
    $transaction: jest.fn(async (callback: any) => callback({
      messageSyncStatus: {
        upsert: jest.fn(),
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
  let mockUserService: any;

  const mockConfig: PushConfig = {
    apiToken: 'test-token',
    batchSize: 100,
    maxRetries: 3,
    timeout: 5000
  };

  beforeEach(() => {
    mockPrisma = new PrismaClient();
    mockAxiosInstance = {
      post: jest.fn(),
      defaults: { baseURL: 'http://test.com' }
    };
    (axios.create as jest.MockedFunction<typeof axios.create>).mockReturnValue(mockAxiosInstance as any);
    
    // Create mock UserService
    mockUserService = {
      getAuthenticatedUserId: jest.fn().mockReturnValue('550e8400-e29b-41d4-a716-446655440000'), // Valid UUID
      getUserId: jest.fn().mockReturnValue('anon-user-456'),
      getApiToken: jest.fn().mockReturnValue('test-api-token')
    };
    
    pushService = new PushService(mockPrisma, mockConfig, mockUserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('selectUnpushedBatch', () => {
    it('should select unpushed messages with retry limit', async () => {
      const mockMessages = [
        { messageId: 'msg1' },
        { messageId: 'msg2' },
        { messageId: 'msg3' }
      ];

      mockPrisma.message.findMany.mockResolvedValue(mockMessages);

      const result = await pushService.selectUnpushedBatch(100);

      expect(mockPrisma.message.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { syncStatus: null },
            {
              syncStatus: {
                syncedAt: null,
                retryCount: { lt: mockConfig.maxRetries }
              }
            }
          ]
        },
        orderBy: { timestamp: 'asc' },
        take: 100,
        select: { messageId: true }
      });

      expect(result).toEqual(['msg1', 'msg2', 'msg3']);
    });

    it('should return empty array when no unpushed messages', async () => {
      mockPrisma.message.findMany.mockResolvedValue([]);

      const result = await pushService.selectUnpushedBatch(100);

      expect(result).toEqual([]);
    });
  });

  describe('loadMessagesWithEntities', () => {
    it('should load messages with all related entities', async () => {
      const mockMessages = [
        {
          id: 'msg1',
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
        where: { messageId: { in: ['msg1'] } },
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
          id: 'msg1',
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
          id: 'msg2',
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

      // Check new format has messages array and metadata
      expect(request.messages).toBeDefined();
      expect(request.messages).toHaveLength(2);
      expect(request.metadata).toBeDefined();
      
      // Check first message - IDs should be transformed
      expect(request.messages[0].id).toBeDefined();
      expect(request.messages[0].originalMessageId).toBe('id1');
      expect(request.messages[0].model).toBe('claude-3');
      expect(request.messages[0].inputTokens).toBe(100);
      expect(request.messages[0].outputTokens).toBe(200);
      
      // Check metadata
      expect(request.metadata.batch_info.total_messages).toBe(2);
      expect(request.metadata.batch_info.message_counts.by_model['claude-3']).toBe(2);
      expect(request.metadata.batch_info.message_counts.by_role['user']).toBe(1);
      expect(request.metadata.batch_info.message_counts.by_role['assistant']).toBe(1);
      
      // Check entities - should have transformed IDs
      expect(Object.keys(request.metadata.entities.users)).toHaveLength(1);
      expect(Object.keys(request.metadata.entities.machines)).toHaveLength(1);
      expect(Object.keys(request.metadata.entities.projects)).toHaveLength(1);
      expect(Object.keys(request.metadata.entities.sessions)).toHaveLength(1);
    });

    it('should handle missing optional fields', () => {
      const messages = [
        {
          id: 'msg1',
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

      expect(request.messages).toBeDefined();
      expect(request.messages[0].model).toBeUndefined();
      expect(request.messages[0].timestamp).toBeUndefined();
      expect(request.metadata.batch_info.message_counts.by_model['unknown']).toBe(1);
    });
  });

  describe('executePush', () => {
    it('should successfully push data', async () => {
      const mockRequest: PushRequest = {
        messages: [],
        metadata: {
          entities: {
            users: {},
            machines: {},
            projects: {},
            sessions: {}
          },
          batch_info: {
            batch_id: 'batch1',
            timestamp: '2024-01-01T00:00:00Z',
            client_version: '1.0.0',
            total_messages: 0,
            message_counts: {
              by_model: {},
              by_role: {}
            }
          }
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
        messageSyncStatus: {
          upsert: jest.fn()
        }
      };

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      await pushService.processPushResponse(mockResponse, messageIds);

      // Check first 3 messages marked as synced
      expect(mockTx.messageSyncStatus.upsert).toHaveBeenCalledWith({
        where: { messageId: 'msg1' },
        update: {
          syncedAt: expect.any(Date),
          syncResponse: 'persisted'
        },
        create: {
          messageId: 'msg1',
          syncedAt: expect.any(Date),
          syncResponse: 'persisted'
        }
      });

      expect(mockTx.messageSyncStatus.upsert).toHaveBeenCalledWith({
        where: { messageId: 'msg2' },
        update: {
          syncedAt: expect.any(Date),
          syncResponse: 'persisted'
        },
        create: {
          messageId: 'msg2',
          syncedAt: expect.any(Date),
          syncResponse: 'persisted'
        }
      });

      expect(mockTx.messageSyncStatus.upsert).toHaveBeenCalledWith({
        where: { messageId: 'msg3' },
        update: {
          syncedAt: expect.any(Date),
          syncResponse: 'persisted'
        },
        create: {
          messageId: 'msg3',
          syncedAt: expect.any(Date),
          syncResponse: 'persisted'
        }
      });

      // Check last message marked as failed
      expect(mockTx.messageSyncStatus.upsert).toHaveBeenCalledWith({
        where: { messageId: 'msg4' },
        update: {
          retryCount: { increment: 1 },
          syncResponse: 'failed'
        },
        create: {
          messageId: 'msg4',
          retryCount: 1,
          syncResponse: 'failed'
        }
      });
    });
  });

  describe('resetRetryCount', () => {
    it('should reset retry count for all messages', async () => {
      mockPrisma.messageSyncStatus.updateMany.mockResolvedValue({ count: 5 });

      const result = await pushService.resetRetryCount();

      expect(mockPrisma.messageSyncStatus.updateMany).toHaveBeenCalledWith({
        where: { syncedAt: null },
        data: { retryCount: 0, syncResponse: null }
      });

      expect(result).toBe(5);
    });

    it('should reset retry count for specific messages', async () => {
      mockPrisma.messageSyncStatus.updateMany.mockResolvedValue({ count: 2 });

      const result = await pushService.resetRetryCount(['msg1', 'msg2']);

      expect(mockPrisma.messageSyncStatus.updateMany).toHaveBeenCalledWith({
        where: { 
          syncedAt: null,
          messageId: { in: ['msg1', 'msg2'] }
        },
        data: { retryCount: 0, syncResponse: null }
      });

      expect(result).toBe(2);
    });
  });

  describe('getPushStatistics', () => {
    it('should return comprehensive statistics', async () => {
      mockPrisma.message.count.mockResolvedValueOnce(1000); // total
      mockPrisma.messageSyncStatus.count.mockResolvedValueOnce(800);  // synced
      mockPrisma.message.count.mockResolvedValueOnce(200); // unsynced

      mockPrisma.messageSyncStatus.groupBy.mockResolvedValue([
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