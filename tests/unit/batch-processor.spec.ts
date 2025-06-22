import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { BatchProcessor, BatchMessage } from '../../src/services/batch-processor';
import { Prisma, MessageWriter } from '@prisma/client';

// Mock Prisma
jest.mock('../../src/database', () => ({
  prisma: {
    message: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn()
    },
    messageSyncStatus: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn()
    },
    session: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      create: jest.fn()
    },
    $transaction: jest.fn(),
    $executeRaw: jest.fn()
  }
}));

import { prisma } from '../../src/database';

describe('BatchProcessor', () => {
  let batchProcessor: BatchProcessor;
  const mockPrisma = prisma as any;

  beforeEach(() => {
    jest.clearAllMocks();
    batchProcessor = new BatchProcessor(2); // Small batch size for testing
  });

  describe('loadExistingMessageIds', () => {
    it('should load existing message IDs', async () => {
      mockPrisma.message.findMany.mockResolvedValue([
        { messageId: 'msg1' },
        { messageId: 'msg2' },
        { messageId: 'msg3' }
      ]);

      await batchProcessor.loadExistingMessageIds();
      
      expect(batchProcessor.messageExists('msg1')).toBe(true);
      expect(batchProcessor.messageExists('msg2')).toBe(true);
      expect(batchProcessor.messageExists('msg3')).toBe(true);
      expect(batchProcessor.messageExists('msg4')).toBe(false);
    });
  });

  describe('addMessage and flush', () => {
    it('should add messages to buffer and flush when full', async () => {
      // Mock empty existing messages
      mockPrisma.message.findMany.mockResolvedValue([]);
      await batchProcessor.loadExistingMessageIds();
      
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockPrisma);
      });
      
      // Mock findMany to return the messages we're inserting
      mockPrisma.message.findMany.mockResolvedValue([
        { messageId: 'new-msg1' },
        { messageId: 'new-msg2' }
      ]);
      
      // Mock messageSyncStatus.findMany to return empty (no existing sync statuses)
      mockPrisma.messageSyncStatus.findMany.mockResolvedValue([]);

      const message1: BatchMessage = {
        id: 'id1',
        messageId: 'new-msg1',
        sessionId: 'session1',
        projectId: 'project1',
        userId: 'user1',
        clientMachineId: 'machine1',
        timestamp: new Date(),
        role: 'user',
        model: 'claude-3',
        type: null,
        inputTokens: 100n,
        outputTokens: 200n,
        cacheCreationTokens: 0n,
        cacheReadTokens: 0n,
        pricePerInputToken: new Prisma.Decimal(0.01),
        pricePerOutputToken: new Prisma.Decimal(0.02),
        pricePerCacheWriteToken: null,
        pricePerCacheReadToken: null,
        cacheDurationMinutes: 5,
        messageCost: new Prisma.Decimal(0.5),
        writer: MessageWriter.human
      };

      const message2: BatchMessage = {
        ...message1,
        id: 'id2',
        messageId: 'new-msg2'
      };

      // Add first message - should not flush yet
      batchProcessor.addMessage(message1);
      expect(batchProcessor.getBufferSize()).toBe(1);
      expect(batchProcessor.shouldFlush()).toBe(false);

      // Add second message - should trigger flush
      batchProcessor.addMessage(message2);
      expect(batchProcessor.shouldFlush()).toBe(true);

      // Mock message.create to work as expected
      mockPrisma.message.create.mockResolvedValue({});
      
      // Flush
      const count = await batchProcessor.flush();
      expect(count).toBe(2);
      
      // Verify that message.create was called for each message with nested sync status
      expect(mockPrisma.message.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.message.create).toHaveBeenCalledWith({
        data: {
          ...message1,
          syncStatus: {
            create: {}
          }
        }
      });
      expect(mockPrisma.message.create).toHaveBeenCalledWith({
        data: {
          ...message2,
          syncStatus: {
            create: {}
          }
        }
      });
    });

    it('should skip duplicate messages', async () => {
      mockPrisma.message.findMany.mockResolvedValue([
        { messageId: 'existing' }
      ]);

      await batchProcessor.loadExistingMessageIds();

      const existingMessage: BatchMessage = {
        id: 'id1',
        messageId: 'existing',
        sessionId: 'session1',
        projectId: 'project1',
        userId: 'user1',
        clientMachineId: 'machine1',
        timestamp: new Date(),
        role: 'user',
        model: 'claude-3',
        type: null,
        inputTokens: 100n,
        outputTokens: 200n,
        cacheCreationTokens: 0n,
        cacheReadTokens: 0n,
        pricePerInputToken: null,
        pricePerOutputToken: null,
        pricePerCacheWriteToken: null,
        pricePerCacheReadToken: null,
        cacheDurationMinutes: 5,
        messageCost: new Prisma.Decimal(0),
        writer: MessageWriter.agent
      };

      batchProcessor.addMessage(existingMessage);
      expect(batchProcessor.getBufferSize()).toBe(0);
    });
  });

  describe('ensureSessions', () => {
    it('should create missing sessions', async () => {
      mockPrisma.session.findMany.mockResolvedValue([
        { id: 'session1' }
      ]);

      // Mock session creation
      mockPrisma.session.create.mockResolvedValue({});

      const newSessions = await batchProcessor.ensureSessions(
        ['session1', 'session2', 'session3'],
        'project1',
        'user1',
        'machine1'
      );

      expect(newSessions).toEqual(new Set(['session2', 'session3']));
      expect(mockPrisma.session.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.session.create).toHaveBeenCalledWith({
        data: { id: 'session2', projectId: 'project1', userId: 'user1', clientMachineId: 'machine1' }
      });
      expect(mockPrisma.session.create).toHaveBeenCalledWith({
        data: { id: 'session3', projectId: 'project1', userId: 'user1', clientMachineId: 'machine1' }
      });
    });
  });
});