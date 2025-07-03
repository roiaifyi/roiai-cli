import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { PushService } from '../../src/services/push.service';
import { PrismaClient } from '@prisma/client';
import { PushConfig, PushRequest, PushResponse } from '../../src/models/push.types';
import { createApiClient } from '../../src/api/typed-client';

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

// Mock API client
jest.mock('../../src/api/typed-client');
jest.mock('../../src/config');

describe('PushService', () => {
  let pushService: PushService;
  let mockPrisma: any;
  let mockApiClient: any;
  let mockUserService: any;

  const mockConfig: PushConfig = {
    batchSize: 100,
    maxRetries: 3,
    timeout: 5000
  };

  beforeEach(() => {
    mockPrisma = new PrismaClient();
    
    // Mock API client
    mockApiClient = {
      cliUpsync: jest.fn(),
      cliHealthCheck: jest.fn()
    };
    (createApiClient as jest.MockedFunction<typeof createApiClient>).mockReturnValue(mockApiClient);
    
    // Mock config manager
    const { configManager } = require('../../src/config');
    configManager.getApiConfig = jest.fn().mockReturnValue({
      baseUrl: 'http://test.com',
      endpoints: {
        push: '/api/v1/data/upsync'
      }
    });
    
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

  describe('selectUnpushedBatchWithEntities', () => {
    it('should select unpushed messages with entities and retry limit', async () => {
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
        },
        {
          id: 'msg2',
          messageId: 'id2',
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

      const result = await pushService.selectUnpushedBatchWithEntities(100);

      expect(mockPrisma.message.findMany).toHaveBeenCalledWith({
        where: {
          syncStatus: {
            syncedAt: null,
            retryCount: { lt: mockConfig.maxRetries }
          }
        },
        orderBy: { timestamp: 'asc' },
        take: 100,
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

    it('should return empty array when no unpushed messages', async () => {
      mockPrisma.message.findMany.mockResolvedValue([]);

      const result = await pushService.selectUnpushedBatchWithEntities(100);

      expect(result).toEqual([]);
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

      // Check new format has messages array and entities
      expect(request.messages).toBeDefined();
      expect(request.messages).toHaveLength(2);
      expect(request.entities).toBeDefined();
      
      // Check first message - IDs should be transformed
      expect(request.messages[0].id).toBeDefined();
      expect(request.messages[0].messageId).toBe('id1');
      expect(request.messages[0].model).toBe('claude-3');
      expect(request.messages[0].inputTokens).toBe(100);
      expect(request.messages[0].outputTokens).toBe(200);
      
      // Check entities - should have transformed IDs
      expect(Object.keys(request.entities.machines)).toHaveLength(1);
      expect(Object.keys(request.entities.projects)).toHaveLength(1);
      expect(Object.keys(request.entities.sessions)).toHaveLength(1);
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
    });
  });

  describe('executePush', () => {
    it('should successfully push data', async () => {
      const mockRequest: PushRequest = {
        messages: [],
        entities: {
          machines: {},
          projects: {},
          sessions: {}
        }
      };

      const mockResponse: PushResponse = {
        syncId: 'sync_123',
        results: {
          persisted: { count: 2, messageIds: ['msg1', 'msg2'] },
          deduplicated: { count: 1, messageIds: ['msg3'] },
          failed: { count: 0, details: [] }
        },
        summary: {
          totalMessages: 3,
          messagesSucceeded: 3,
          messagesFailed: 0,
          processingTimeMs: 150
        }
      };

      mockApiClient.cliUpsync.mockResolvedValue(mockResponse);

      const result = await pushService.executePush(mockRequest);

      expect(mockApiClient.cliUpsync).toHaveBeenCalledWith(mockRequest);
      expect(result).toEqual(mockResponse);
    });

    it('should handle server errors', async () => {
      const mockRequest: PushRequest = {} as any;

      const error = new Error('Invalid request');
      (error as any).code = 'VAL_001';
      (error as any).statusCode = 400;
      mockApiClient.cliUpsync.mockRejectedValue(error);

      await expect(pushService.executePush(mockRequest)).rejects.toThrow('Push failed:');
    });

    it('should handle network errors', async () => {
      const mockRequest: PushRequest = {} as any;

      const error = new Error('Failed to fetch');
      mockApiClient.cliUpsync.mockRejectedValue(error);

      await expect(pushService.executePush(mockRequest)).rejects.toThrow('Push failed: Failed to fetch');
    });
  });

  describe('processPushResponse', () => {
    it('should update sync status based on response', async () => {
      const mockResponse: PushResponse = {
        syncId: 'sync_123',
        results: {
          persisted: {
            count: 2,
            messageIds: ['msg1', 'msg2']
          },
          deduplicated: {
            count: 1,
            messageIds: ['msg3']
          },
          failed: {
            count: 1,
            details: [{
              messageId: 'msg4',
              error: 'Validation failed',
              code: 'SYNC_001'
            }]
          }
        },
        summary: {
          totalMessages: 4,
          messagesSucceeded: 3,
          messagesFailed: 1,
          processingTimeMs: 100
        }
      };

      const mockTx = {
        messageSyncStatus: {
          updateMany: jest.fn()
        }
      };

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      await pushService.processPushResponse(mockResponse);

      // Check persisted messages bulk update
      expect(mockTx.messageSyncStatus.updateMany).toHaveBeenCalledWith({
        where: { messageId: { in: ['msg1', 'msg2'] } },
        data: {
          syncedAt: expect.any(Date),
          syncResponse: 'persisted'
        }
      });

      // Check deduplicated messages bulk update
      expect(mockTx.messageSyncStatus.updateMany).toHaveBeenCalledWith({
        where: { messageId: { in: ['msg3'] } },
        data: {
          syncedAt: expect.any(Date),
          syncResponse: 'deduplicated'
        }
      });

      // Check failed messages bulk update
      expect(mockTx.messageSyncStatus.updateMany).toHaveBeenCalledWith({
        where: { messageId: { in: ['msg4'] } },
        data: {
          retryCount: { increment: 1 },
          syncResponse: 'failed: SYNC_001 - Validation failed'
        }
      });
    });

    it('should handle multiple failed messages with different errors', async () => {
      const mockResponse: PushResponse = {
        syncId: 'sync_456',
        results: {
          persisted: {
            count: 0,
            messageIds: []
          },
          deduplicated: {
            count: 0,
            messageIds: []
          },
          failed: {
            count: 3,
            details: [
              {
                messageId: 'msg1',
                error: 'Validation failed',
                code: 'SYNC_001'
              },
              {
                messageId: 'msg2',
                error: 'Validation failed',
                code: 'SYNC_001'
              },
              {
                messageId: 'msg3',
                error: 'Network timeout',
                code: 'SYNC_002'
              }
            ]
          }
        },
        summary: {
          totalMessages: 3,
          messagesSucceeded: 0,
          messagesFailed: 3,
          processingTimeMs: 50
        }
      };

      const mockTx = {
        messageSyncStatus: {
          updateMany: jest.fn()
        }
      };

      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      await pushService.processPushResponse(mockResponse);

      // Check that messages are grouped by error message
      expect(mockTx.messageSyncStatus.updateMany).toHaveBeenCalledWith({
        where: { messageId: { in: ['msg1', 'msg2'] } },
        data: {
          retryCount: { increment: 1 },
          syncResponse: 'failed: SYNC_001 - Validation failed'
        }
      });

      expect(mockTx.messageSyncStatus.updateMany).toHaveBeenCalledWith({
        where: { messageId: { in: ['msg3'] } },
        data: {
          retryCount: { increment: 1 },
          syncResponse: 'failed: SYNC_002 - Network timeout'
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