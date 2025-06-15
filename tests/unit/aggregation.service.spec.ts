import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AggregationService } from '../../src/services/aggregation.service';
import { resetTestDatabase, createTestPrismaClient } from '../setup';
import { Prisma } from '@prisma/client';

describe('AggregationService BDD Tests', () => {
  let aggregationService: AggregationService;
  let prisma: any;
  
  beforeEach(async () => {
    await resetTestDatabase();
    prisma = createTestPrismaClient();
    aggregationService = new AggregationService(prisma);
    
    // Seed test data
    await seedTestData();
  });
  
  afterEach(async () => {
    await prisma.$disconnect();
  });
  
  async function seedTestData() {
    // Create users
    await prisma.user.createMany({
      data: [
        { id: 'user1', email: 'user1@example.com' },
        { id: 'user2', email: 'user2@example.com' }
      ]
    });
    
    // Create machines
    await prisma.machine.createMany({
      data: [
        { id: 'machine1', userId: 'user1', machineName: 'laptop-1' },
        { id: 'machine2', userId: 'user2', machineName: 'laptop-2' }
      ]
    });
    
    // Create projects
    await prisma.project.createMany({
      data: [
        { id: 'project1', projectName: 'Project Alpha', userId: 'user1', clientMachineId: 'machine1' },
        { id: 'project2', projectName: 'Project Beta', userId: 'user1', clientMachineId: 'machine1' }
      ]
    });
    
    // Create sessions
    await prisma.session.createMany({
      data: [
        { id: 'session1', userId: 'user1', clientMachineId: 'machine1', projectId: 'project1' },
        { id: 'session2', userId: 'user1', clientMachineId: 'machine1', projectId: 'project2' },
        { id: 'session3', userId: 'user2', clientMachineId: 'machine2', projectId: 'project1' }
      ]
    });
    
    // Create messages with various token usage patterns
    const messages = [
      // Session 1 - Project Alpha, User 1
      {
        uuid: 'msg1',
        messageId: 'msg_001',
        sessionId: 'session1',
        projectId: 'project1',
        userId: 'user1',
        role: 'assistant',
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1000,
        outputTokens: 500,
        cacheCreationTokens: 200,
        cacheReadTokens: 0,
        timestamp: new Date('2024-12-01T10:00:00Z'),
        messageCost: new Prisma.Decimal(0.01)
      },
      {
        uuid: 'msg2',
        messageId: 'msg_002',
        sessionId: 'session1',
        projectId: 'project1',
        userId: 'user1',
        role: 'assistant',
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 800,
        outputTokens: 300,
        cacheCreationTokens: 0,
        cacheReadTokens: 150,
        timestamp: new Date('2024-12-01T11:00:00Z'),
        messageCost: new Prisma.Decimal(0.008)
      },
      // Session 2 - Project Beta, User 1
      {
        uuid: 'msg3',
        messageId: 'msg_003',
        sessionId: 'session2',
        projectId: 'project2',
        userId: 'user1',
        role: 'assistant',
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 2000,
        outputTokens: 1000,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        timestamp: new Date('2024-12-02T10:00:00Z'),
        messageCost: new Prisma.Decimal(0.02)
      },
      // Session 3 - Project Alpha, User 2
      {
        uuid: 'msg4',
        messageId: 'msg_004',
        sessionId: 'session3',
        projectId: 'project1',
        userId: 'user2',
        role: 'assistant',
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1500,
        outputTokens: 700,
        cacheCreationTokens: 300,
        cacheReadTokens: 0,
        timestamp: new Date('2024-12-03T10:00:00Z'),
        messageCost: new Prisma.Decimal(0.015)
      }
    ];
    
    await prisma.message.createMany({ data: messages });
  }
  
  describe('Given I have usage data across multiple projects and users', () => {
    describe('When I request usage by project', () => {
      it('Then it should aggregate tokens and costs correctly for each project', async () => {
        // Act
        const projectUsage = await aggregationService.getUsageByProject();
        
        // Assert
        expect(projectUsage).toHaveLength(2);
        
        const alphaUsage = projectUsage.find(p => p.projectName === 'Project Alpha');
        expect(alphaUsage).toBeDefined();
        expect(alphaUsage?.inputTokens).toBe(1000 + 800 + 1500); // 3300
        expect(alphaUsage?.outputTokens).toBe(500 + 300 + 700); // 1500
        expect(alphaUsage?.cacheCreationInputTokens).toBe(200 + 300); // 500
        expect(alphaUsage?.cacheReadInputTokens).toBe(150);
        expect(alphaUsage?.totalCost).toBe(0.01 + 0.008 + 0.015); // 0.033
        expect(alphaUsage?.messageCount).toBe(3);
        
        const betaUsage = projectUsage.find(p => p.projectName === 'Project Beta');
        expect(betaUsage).toBeDefined();
        expect(betaUsage?.inputTokens).toBe(2000);
        expect(betaUsage?.outputTokens).toBe(1000);
        expect(betaUsage?.totalCost).toBe(0.02);
        expect(betaUsage?.messageCount).toBe(1);
      });
    });
    
    describe('When I request usage by user', () => {
      it('Then it should aggregate tokens and costs correctly for each user', async () => {
        // Act
        const userUsage = await aggregationService.getUsageByUser();
        
        // Assert
        expect(userUsage).toHaveLength(2);
        
        const user1Usage = userUsage.find(u => u.userName === 'user1@example.com');
        expect(user1Usage).toBeDefined();
        expect(user1Usage?.inputTokens).toBe(1000 + 800 + 2000); // 3800
        expect(user1Usage?.outputTokens).toBe(500 + 300 + 1000); // 1800
        expect(user1Usage?.totalCost).toBe(0.01 + 0.008 + 0.02); // 0.038
        expect(user1Usage?.messageCount).toBe(3);
        
        const user2Usage = userUsage.find(u => u.userName === 'user2@example.com');
        expect(user2Usage).toBeDefined();
        expect(user2Usage?.inputTokens).toBe(1500);
        expect(user2Usage?.outputTokens).toBe(700);
        expect(user2Usage?.totalCost).toBe(0.015);
        expect(user2Usage?.messageCount).toBe(1);
      });
    });
    
    describe('When I request daily usage summary', () => {
      it('Then it should aggregate usage by date correctly', async () => {
        // Act
        const startDate = new Date('2024-12-01');
        const endDate = new Date('2024-12-31');
        const dailyUsage = await aggregationService.getDailyUsage(startDate, endDate);
        
        // Assert
        expect(dailyUsage).toHaveLength(3);
        
        const dec1Usage = dailyUsage.find(d => d.date === '2024-12-01');
        expect(dec1Usage).toBeDefined();
        expect(dec1Usage?.inputTokens).toBe(1000 + 800); // 1800
        expect(dec1Usage?.outputTokens).toBe(500 + 300); // 800
        expect(dec1Usage?.totalCost).toBe(0.01 + 0.008); // 0.018
        expect(dec1Usage?.messageCount).toBe(2);
        
        const dec2Usage = dailyUsage.find(d => d.date === '2024-12-02');
        expect(dec2Usage).toBeDefined();
        expect(dec2Usage?.inputTokens).toBe(2000);
        expect(dec2Usage?.outputTokens).toBe(1000);
        
        const dec3Usage = dailyUsage.find(d => d.date === '2024-12-03');
        expect(dec3Usage).toBeDefined();
        expect(dec3Usage?.inputTokens).toBe(1500);
        expect(dec3Usage?.outputTokens).toBe(700);
      });
    });
    
    describe('When I request usage by model', () => {
      it('Then it should aggregate usage grouped by model correctly', async () => {
        // Act
        const modelUsage = await aggregationService.getUsageByModel();
        
        // Assert
        expect(modelUsage).toHaveLength(1); // Only one model in test data
        
        const claudeUsage = modelUsage[0];
        expect(claudeUsage.model).toBe('claude-3-5-sonnet-20241022');
        expect(claudeUsage.inputTokens).toBe(1000 + 800 + 2000 + 1500); // 5300
        expect(claudeUsage.outputTokens).toBe(500 + 300 + 1000 + 700); // 2500
        expect(claudeUsage.cacheCreationInputTokens).toBe(200 + 300); // 500
        expect(claudeUsage.cacheReadInputTokens).toBe(150);
        expect(claudeUsage.totalCost).toBe(0.01 + 0.008 + 0.02 + 0.015); // 0.053
        expect(claudeUsage.messageCount).toBe(4);
      });
    });
    
    describe('When I request total usage summary', () => {
      it('Then it should calculate overall statistics correctly', async () => {
        // Act
        const summary = await aggregationService.getTotalUsage();
        
        // Assert
        expect(summary.totalInputTokens).toBe(5300);
        expect(summary.totalOutputTokens).toBe(2500);
        expect(summary.totalCacheCreationTokens).toBe(500);
        expect(summary.totalCacheReadTokens).toBe(150);
        expect(summary.totalCost).toBe(0.053);
        expect(summary.totalMessages).toBe(4);
        expect(summary.uniqueUsers).toBe(2);
        expect(summary.uniqueProjects).toBe(2);
        expect(summary.uniqueSessions).toBe(3);
      });
    });
  });
  
  describe('Given I have no usage data', () => {
    beforeEach(async () => {
      await resetTestDatabase();
      prisma = createTestPrismaClient();
      aggregationService = new AggregationService(prisma);
    });
    
    describe('When I request any aggregation', () => {
      it('Then it should return empty results with zero values', async () => {
        // Act
        const projectUsage = await aggregationService.getUsageByProject();
        const userUsage = await aggregationService.getUsageByUser();
        const summary = await aggregationService.getTotalUsage();
        
        // Assert
        expect(projectUsage).toHaveLength(0);
        expect(userUsage).toHaveLength(0);
        expect(summary.totalInputTokens).toBe(0);
        expect(summary.totalCost).toBe(0);
        expect(summary.totalMessages).toBe(0);
      });
    });
  });
});