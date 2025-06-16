import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DatabaseService } from '../../src/services/database.service';
import { resetTestDatabase, createTestPrismaClient } from '../setup';
import { Prisma } from '@prisma/client';

describe('DatabaseService BDD Tests', () => {
  let dbService: DatabaseService;
  let prisma: any;
  
  beforeEach(async () => {
    await resetTestDatabase();
    prisma = createTestPrismaClient();
    dbService = new DatabaseService(prisma);
  });
  
  afterEach(async () => {
    await prisma.$disconnect();
  });
  
  describe('Given I have Claude usage data to process', () => {
    describe('When I create a new user', () => {
      it('Then it should store the user with correct fields', async () => {
        // Arrange
        const userData = {
          id: 'test-user-123',
          email: 'test@example.com'
        };
        
        // Act
        const user = await dbService.findOrCreateUser(userData.id, userData.email, undefined);
        
        // Assert
        expect(user.id).toBe(userData.id);
        expect(user.email).toBe(userData.email);
        expect(user.createdAt).toBeInstanceOf(Date);
        expect(user.updatedAt).toBeInstanceOf(Date);
        expect(user.totalMessages).toBe(0n);
        expect(user.totalCost.toNumber()).toBe(0);
      });
      
      it('Then it should return existing user on subsequent calls', async () => {
        // Arrange
        const userData = {
          id: 'test-user-123',
          email: 'test@example.com'
        };
        
        // Act
        const user1 = await dbService.findOrCreateUser(userData.id, userData.email, undefined);
        const user2 = await dbService.findOrCreateUser(userData.id, userData.email, undefined);
        
        // Assert
        expect(user1.id).toBe(user2.id);
        expect(user1.createdAt.getTime()).toBe(user2.createdAt.getTime());
        
        // Check that only one user exists
        const userCount = await prisma.user.count();
        expect(userCount).toBe(1);
      });
    });
    
    describe('When I create a new machine', () => {
      it('Then it should store the machine with user relationship', async () => {
        // Arrange
        const userId = 'test-user';
        const machineId = 'test-machine';
        const machineName = 'Test Laptop';
        
        // Create user first
        await dbService.findOrCreateUser(userId, 'user@example.com', undefined);
        
        // Act
        const machine = await dbService.findOrCreateMachine(
          machineId,
          userId,
          machineName
        );
        
        // Assert
        expect(machine.id).toBe(machineId);
        expect(machine.userId).toBe(userId);
        expect(machine.machineName).toBe(machineName);
        expect(machine.createdAt).toBeInstanceOf(Date);
        expect(machine.updatedAt).toBeInstanceOf(Date);
      });
    });
    
    describe('When I create a new project', () => {
      it('Then it should store the project with unique constraints', async () => {
        // Arrange
        const userId = 'test-user';
        const machineId = 'test-machine';
        const projectData = {
          id: 'project-123',
          name: 'My Project',
          userId: userId,
          machineId: machineId
        };
        
        // Create dependencies
        await dbService.findOrCreateUser(userId, 'user@example.com', undefined);
        await dbService.findOrCreateMachine(machineId, userId, 'Test Machine');
        
        // Act
        const project = await dbService.findOrCreateProject(
          projectData.id,
          projectData.name,
          projectData.userId,
          projectData.machineId
        );
        
        // Assert
        expect(project.id).toBe(projectData.id);
        expect(project.projectName).toBe(projectData.name);
        expect(project.userId).toBe(projectData.userId);
        expect(project.clientMachineId).toBe(projectData.machineId);
        expect(project.totalMessages).toBe(0n);
        expect(project.totalCost.toNumber()).toBe(0);
      });
    });
    
    describe('When I create a new session', () => {
      it('Then it should store the session with all relationships', async () => {
        // Arrange
        const userId = 'test-user';
        const machineId = 'test-machine';
        const projectId = 'test-project';
        const sessionId = 'test-session';
        
        // Create dependencies
        await dbService.findOrCreateUser(userId, 'user@example.com', undefined);
        await dbService.findOrCreateMachine(machineId, userId, 'Test Machine');
        await dbService.findOrCreateProject(projectId, 'Test Project', userId, machineId);
        
        // Act
        const session = await dbService.findOrCreateSession(
          sessionId,
          projectId,
          userId,
          machineId
        );
        
        // Assert
        expect(session.id).toBe(sessionId);
        expect(session.projectId).toBe(projectId);
        expect(session.userId).toBe(userId);
        expect(session.clientMachineId).toBe(machineId);
        expect(session.totalMessages).toBe(0n);
        expect(session.totalCost.toNumber()).toBe(0);
      });
    });
    
    describe('When I create a new message', () => {
      it('Then it should store the message with calculated costs', async () => {
        // Arrange
        const messageData = {
          uuid: 'msg-uuid-123',
          messageId: 'msg-123',
          sessionId: 'test-session',
          projectId: 'test-project',
          userId: 'test-user',
          role: 'assistant',
          model: 'claude-3-5-sonnet-20241022',
          inputTokens: 1000,
          outputTokens: 500,
          cacheCreationTokens: 200,
          cacheReadTokens: 100,
          timestamp: new Date(),
          messageCost: new Prisma.Decimal(0.01)
        };
        
        // Create dependencies
        const machineId = 'test-machine';
        await dbService.findOrCreateUser(messageData.userId, 'user@example.com');
        await dbService.findOrCreateMachine(machineId, messageData.userId, 'Test Machine');
        await dbService.findOrCreateProject(messageData.projectId, 'Test Project', messageData.userId, machineId);
        await dbService.findOrCreateSession(messageData.sessionId, messageData.projectId, messageData.userId, machineId);
        
        // Act
        const message = await dbService.createMessage({
          ...messageData,
          clientMachineId: machineId
        });
        
        // Assert
        expect(message.uuid).toBe(messageData.uuid);
        expect(message.messageId).toBe(messageData.messageId);
        expect(message.sessionId).toBe(messageData.sessionId);
        expect(message.role).toBe(messageData.role);
        expect(message.model).toBe(messageData.model);
        expect(message.inputTokens).toBe(BigInt(messageData.inputTokens));
        expect(message.outputTokens).toBe(BigInt(messageData.outputTokens));
        expect(message.cacheCreationTokens).toBe(BigInt(messageData.cacheCreationTokens));
        expect(message.cacheReadTokens).toBe(BigInt(messageData.cacheReadTokens));
        expect(message.messageCost.toNumber()).toBe(0.01);
      });
      
      it('Then it should handle duplicate messages gracefully', async () => {
        // Arrange
        const messageData = {
          uuid: 'msg-uuid-123',
          messageId: 'msg-123',
          sessionId: 'test-session',
          projectId: 'test-project',
          userId: 'test-user',
          role: 'assistant',
          model: 'claude-3-5-sonnet-20241022',
          inputTokens: 1000,
          outputTokens: 500,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          timestamp: new Date(),
          messageCost: new Prisma.Decimal(0.01)
        };
        
        // Create dependencies
        const machineId = 'test-machine';
        await dbService.findOrCreateUser(messageData.userId, 'user@example.com');
        await dbService.findOrCreateMachine(machineId, messageData.userId, 'Test Machine');
        await dbService.findOrCreateProject(messageData.projectId, 'Test Project', messageData.userId, machineId);
        await dbService.findOrCreateSession(messageData.sessionId, messageData.projectId, messageData.userId, machineId);
        
        // Act
        await dbService.createMessage({
          ...messageData,
          clientMachineId: machineId
        });
        
        // Try to create duplicate - should be handled gracefully
        try {
          await dbService.createMessage({
            ...messageData,
            clientMachineId: machineId
          });
        } catch (e) {
          // Expected to throw error for duplicate
        }
        
        // Assert
        // Should either throw an error or handle it gracefully
        // Check that only one message exists
        const messageCount = await prisma.message.count();
        expect(messageCount).toBe(1);
      });
    });
    
    describe('When I update file processing status', () => {
      it('Then it should track file processing state correctly', async () => {
        // Arrange
        const filePath = '/path/to/usage.jsonl';
        const fileData = {
          fileSize: 1024,
          lastModified: new Date(),
          checksum: 'abc123'
        };
        
        // Act
        const fileStatus = await dbService.updateFileStatus(
          filePath,
          fileData.fileSize,
          fileData.lastModified,
          fileData.checksum,
          100 // recordCount
        );
        
        // Assert
        expect(fileStatus.filePath).toBe(filePath);
        expect(fileStatus.fileSize).toBe(BigInt(fileData.fileSize));
        expect(fileStatus.lastModified?.getTime()).toBe(fileData.lastModified.getTime());
        expect(fileStatus.checksum).toBe(fileData.checksum);
        expect(fileStatus.lastProcessedAt).toBeInstanceOf(Date);
      });
      
      it('Then it should check if a file was already processed', async () => {
        // Arrange
        const filePath = '/path/to/usage.jsonl';
        const checksum = 'abc123';
        
        // Act - Check before processing
        const wasProcessedBefore = await dbService.isFileProcessed(filePath, checksum);
        
        // Process the file
        await dbService.updateFileStatus(filePath, 1024, new Date(), checksum, 50);
        
        // Check after processing
        const wasProcessedAfter = await dbService.isFileProcessed(filePath, checksum);
        
        // Assert
        expect(wasProcessedBefore).toBe(false);
        expect(wasProcessedAfter).toBe(true);
      });
    });
    
    describe('When I perform batch operations', () => {
      it('Then it should handle batch inserts efficiently', async () => {
        // Arrange
        const userId = 'batch-user';
        const machineId = 'batch-machine';
        const projectId = 'batch-project';
        const sessionId = 'batch-session';
        
        // Create dependencies
        await dbService.findOrCreateUser(userId, 'batch@example.com', undefined);
        await dbService.findOrCreateMachine(machineId, userId, 'Batch Machine');
        await dbService.findOrCreateProject(projectId, 'Batch Project', userId, machineId);
        await dbService.findOrCreateSession(sessionId, projectId, userId, machineId);
        
        // Create batch of messages
        const messages = Array.from({ length: 10 }, (_, i) => ({
          uuid: `batch-msg-${i}`,
          messageId: `msg-${i}`,
          sessionId,
          projectId,
          userId,
          clientMachineId: machineId,
          role: 'assistant' as const,
          model: 'claude-3-5-sonnet-20241022',
          inputTokens: 100 * (i + 1),
          outputTokens: 50 * (i + 1),
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          timestamp: new Date(),
          messageCost: new Prisma.Decimal(0.001 * (i + 1))
        }));
        
        // Act
        const results = await dbService.createMessagesBatch(messages);
        
        // Assert
        expect(results.count).toBe(10);
        
        // Verify all messages were created
        const messageCount = await prisma.message.count({
          where: { sessionId }
        });
        expect(messageCount).toBe(10);
      });
    });
  });
  
  describe('Given I want to query usage statistics', () => {
    beforeEach(async () => {
      // Seed test data
      const userId = 'stats-user';
      const machineId = 'stats-machine';
      const projectId = 'stats-project';
      const sessionId = 'stats-session';
      
      await dbService.findOrCreateUser(userId, 'stats@example.com', undefined);
      await dbService.findOrCreateMachine(machineId, userId, 'Stats Machine');
      await dbService.findOrCreateProject(projectId, 'Stats Project', userId, machineId);
      await dbService.findOrCreateSession(sessionId, projectId, userId, machineId);
      
      // Create some messages
      for (let i = 0; i < 5; i++) {
        await dbService.createMessage({
          uuid: `stats-msg-${i}`,
          messageId: `msg-${i}`,
          sessionId,
          projectId,
          userId,
          clientMachineId: machineId,
          role: 'assistant',
          model: 'claude-3-5-sonnet-20241022',
          inputTokens: 1000,
          outputTokens: 500,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          timestamp: new Date(),
          messageCost: new Prisma.Decimal(0.01)
        });
      }
    });
    
    describe('When I get user statistics', () => {
      it('Then it should return aggregated user data', async () => {
        // Act
        const user = await dbService.getUserWithStats('stats-user');
        
        // Assert
        expect(user).toBeDefined();
        expect(user?.email).toBe('stats@example.com');
        expect(user?._count.messages).toBe(5);
        expect(user?._count.sessions).toBe(1);
        expect(user?._count.projects).toBe(1);
      });
    });
    
    describe('When I get project statistics', () => {
      it('Then it should return aggregated project data', async () => {
        // Act
        const project = await dbService.getProjectWithStats('stats-project');
        
        // Assert
        expect(project).toBeDefined();
        expect(project?.projectName).toBe('Stats Project');
        expect(project?._count.messages).toBe(5);
        expect(project?._count.sessions).toBe(1);
      });
    });
  });
});