import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as path from 'path';
import { execSync } from 'child_process';
import { resetTestDatabase, TEST_DB_PATH, TEST_DATA_DIR } from '../setup';
import { 
  createTestConfig, 
  createTestJsonlFile, 
  createTestUserInfo,
  createTestPricingData,
  countDatabaseRecords,
  createTestPrismaClient
} from '../test-utils';

describe('Sync Command BDD Tests', () => {
  beforeEach(async () => {
    await resetTestDatabase();
    createTestConfig();
    createTestUserInfo();
    createTestPricingData();
    
    // Set up environment
    process.env.NODE_ENV = 'test';
    process.env.NODE_CONFIG_DIR = path.join(process.cwd(), 'config');
    process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;
  });
  
  afterEach(async () => {
    await resetTestDatabase();
  });
  
  describe('Given I have Claude usage data in JSONL files', () => {
    describe('When I run the sync command for the first time', () => {
      it('Then it should process all JSONL files and store data in the database', async () => {
        // Arrange
        const jsonlEntries = [
          {
            id: "msg_001",
            role: "assistant" as const,
            usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: null, cache_read_input_tokens: null },
            updated_at: "2024-12-01T10:00:00Z",
            project: "project-1",
            user: "user-1",
            machine: "machine-1",
            session: "session-1"
          },
          {
            id: "msg_002",
            role: "user" as const,
            usage: { input_tokens: 200, output_tokens: null, cache_creation_input_tokens: 50, cache_read_input_tokens: null },
            updated_at: "2024-12-01T11:00:00Z",
            project: "project-1",
            user: "user-1",
            machine: "machine-1",
            session: "session-1"
          }
        ];
        
        createTestJsonlFile('claude_usage_2024-12-01.jsonl', jsonlEntries);
        
        // Update config to point to test data directory
        const testConfig = createTestConfig({
          claudeCode: {
            rawDataPath: TEST_DATA_DIR,
            pricingDataPath: path.join(TEST_DATA_DIR, 'pricing-data.json'),
            cacheDurationDefault: 5,
            batchSize: 100
          }
        });
        
        // Act
        const cliPath = path.join(process.cwd(), 'dist', 'index.js');
        execSync(`node ${cliPath} cc sync`, {
          env: {
            ...process.env,
            NODE_CONFIG: JSON.stringify(testConfig)
          },
          stdio: 'pipe'
        });
        
        // Assert
        const counts = await countDatabaseRecords();
        expect(counts.users).toBe(1);
        expect(counts.machines).toBe(1);
        expect(counts.projects).toBe(1);
        expect(counts.sessions).toBe(1);
        expect(counts.messages).toBe(2);
        expect(counts.fileStatuses).toBe(1);
        
        // Verify file was marked as processed
        const prisma = createTestPrismaClient();
        const fileStatus = await prisma.fileStatus.findFirst({
          where: { filePath: { contains: 'claude_usage_2024-12-01.jsonl' } }
        });
        expect(fileStatus).toBeTruthy();
        expect(fileStatus?.lastProcessedAt).toBeTruthy();
        expect(fileStatus?.lastProcessedLine).toBe(2);
        await prisma.$disconnect();
      });
    });
    
    describe('When I run the sync command multiple times', () => {
      it('Then it should only process new files and skip already processed ones', async () => {
        // Arrange
        const file1Entries = [
          {
            id: "msg_001",
            role: "assistant" as const,
            usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: null, cache_read_input_tokens: null },
            updated_at: "2024-12-01T10:00:00Z"
          }
        ];
        
        const file2Entries = [
          {
            id: "msg_002",
            role: "assistant" as const,
            usage: { input_tokens: 200, output_tokens: 100, cache_creation_input_tokens: null, cache_read_input_tokens: null },
            updated_at: "2024-12-02T10:00:00Z"
          }
        ];
        
        createTestJsonlFile('claude_usage_2024-12-01.jsonl', file1Entries);
        
        const testConfig = createTestConfig({
          claudeCode: {
            rawDataPath: TEST_DATA_DIR,
            pricingDataPath: path.join(TEST_DATA_DIR, 'pricing-data.json'),
            cacheDurationDefault: 5,
            batchSize: 100
          }
        });
        
        const cliPath = path.join(process.cwd(), 'dist', 'index.js');
        
        // Act - First sync
        execSync(`node ${cliPath} cc sync`, {
          env: {
            ...process.env,
            NODE_CONFIG: JSON.stringify(testConfig)
          },
          stdio: 'pipe'
        });
        
        // Add second file
        createTestJsonlFile('claude_usage_2024-12-02.jsonl', file2Entries);
        
        // Act - Second sync
        execSync(`node ${cliPath} cc sync`, {
          env: {
            ...process.env,
            NODE_CONFIG: JSON.stringify(testConfig)
          },
          stdio: 'pipe'
        });
        
        // Assert
        const counts = await countDatabaseRecords();
        expect(counts.messages).toBe(2);
        expect(counts.fileStatuses).toBe(2);
        
        // Verify both files are marked as processed
        const prisma = createTestPrismaClient();
        const fileStatuses = await prisma.fileStatus.findMany();
        expect(fileStatuses).toHaveLength(2);
        expect(fileStatuses.every(fs => fs.lastProcessedAt !== null)).toBe(true);
        await prisma.$disconnect();
      });
    });
    
    describe('When I have invalid JSONL data', () => {
      it('Then it should skip invalid entries and process valid ones', async () => {
        // Arrange
        const jsonlPath = path.join(TEST_DATA_DIR, 'claude_usage_invalid.jsonl');
        const fs = require('fs');
        
        // Mix of valid and invalid entries
        const content = [
          '{"invalid": "entry"}', // Missing required fields
          JSON.stringify({
            id: "msg_valid",
            model: "claude-3-5-sonnet-20241022",
            role: "assistant",
            stop_reason: "end_turn",
            stop_sequence: null,
            tool_use: [],
            usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: null, cache_read_input_tokens: null },
            updated_at: "2024-12-01T10:00:00Z",
            project: "project-1",
            user: "user-1",
            machine: "machine-1",
            session: "session-1"
          }),
          'not even json', // Invalid JSON
          '' // Empty line
        ].join('\n');
        
        fs.writeFileSync(jsonlPath, content);
        
        const testConfig = createTestConfig({
          claudeCode: {
            rawDataPath: TEST_DATA_DIR,
            pricingDataPath: path.join(TEST_DATA_DIR, 'pricing-data.json'),
            cacheDurationDefault: 5,
            batchSize: 100
          }
        });
        
        // Act
        const cliPath = path.join(process.cwd(), 'dist', 'index.js');
        execSync(`node ${cliPath} cc sync`, {
          env: {
            ...process.env,
            NODE_CONFIG: JSON.stringify(testConfig)
          },
          stdio: 'pipe'
        });
        
        // Assert
        const counts = await countDatabaseRecords();
        expect(counts.messages).toBe(1); // Only the valid entry
      });
    });
    
    describe('When I have usage data with cache tokens', () => {
      it('Then it should correctly track cache usage for cost calculations', async () => {
        // Arrange
        const entries = [
          {
            id: "msg_cache_1",
            model: "claude-3-5-sonnet-20241022",
            role: "assistant" as const,
            stop_reason: "end_turn",
            stop_sequence: null,
            tool_use: [],
            usage: { 
              input_tokens: 1000, 
              output_tokens: 500, 
              cache_creation_input_tokens: 2000, 
              cache_read_input_tokens: null 
            },
            updated_at: "2024-12-01T10:00:00Z",
            project: "cache-project",
            user: "cache-user",
            machine: "cache-machine",
            session: "cache-session"
          },
          {
            id: "msg_cache_2",
            model: "claude-3-5-sonnet-20241022",
            role: "assistant" as const,
            stop_reason: "end_turn",
            stop_sequence: null,
            tool_use: [],
            usage: { 
              input_tokens: 500, 
              output_tokens: 200, 
              cache_creation_input_tokens: null, 
              cache_read_input_tokens: 1500 
            },
            updated_at: "2024-12-01T11:00:00Z",
            project: "cache-project",
            user: "cache-user",
            machine: "cache-machine",
            session: "cache-session"
          }
        ];
        
        createTestJsonlFile('claude_usage_cache.jsonl', entries);
        
        const testConfig = createTestConfig({
          claudeCode: {
            rawDataPath: TEST_DATA_DIR,
            pricingDataPath: path.join(TEST_DATA_DIR, 'pricing-data.json'),
            cacheDurationDefault: 5,
            batchSize: 100
          }
        });
        
        // Act
        const cliPath = path.join(process.cwd(), 'dist', 'index.js');
        execSync(`node ${cliPath} cc sync`, {
          env: {
            ...process.env,
            NODE_CONFIG: JSON.stringify(testConfig)
          },
          stdio: 'pipe'
        });
        
        // Assert
        const prisma = createTestPrismaClient();
        const messages = await prisma.message.findMany({
          orderBy: { timestamp: 'asc' }
        });
        
        expect(messages[0].cacheCreationTokens).toBe(2000);
        expect(messages[0].cacheReadTokens).toBe(0);
        expect(messages[1].cacheCreationTokens).toBe(0);
        expect(messages[1].cacheReadTokens).toBe(1500);
        
        await prisma.$disconnect();
      });
    });
  });
});