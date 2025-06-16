import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as path from 'path';
import { execSync } from 'child_process';
import { resetTestDatabase, TEST_DB_PATH, TEST_DATA_DIR } from '../setup';
import { 
  createTestConfig, 
  createTestJsonlFile, 
  createTestUserInfo,
  countDatabaseRecords,
  createTestPrismaClient
} from '../test-utils';

describe('Sync Command BDD Tests', () => {
  // Helper to run CLI and capture output
  const runSync = (testConfig: any) => {
    const cliPath = path.join(process.cwd(), 'dist', 'index.js');
    try {
      const output = execSync(`node ${cliPath} cc sync`, {
        env: {
          ...process.env,
          NODE_CONFIG: JSON.stringify(testConfig)
        },
        encoding: 'utf8'
      });
      return output;
    } catch (error: any) {
      console.error('CLI Error:', error.message);
      console.error('CLI Output:', error.stdout?.toString());
      console.error('CLI Stderr:', error.stderr?.toString());
      throw error;
    }
  };
  
  beforeEach(async () => {
    await resetTestDatabase();
    createTestConfig();
    createTestUserInfo();
    
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
        // Try with unique IDs for each test run to avoid deduplication issues
        const testId = Date.now();
        const jsonlEntries = [
          {
            type: "message",
            uuid: `uuid_001_${testId}`,
            message: {
              id: `msg_001_${testId}`,
              role: "assistant",
              model: "claude-3-5-sonnet-20241022",
              usage: { 
                input_tokens: 100, 
                output_tokens: 50, 
                cache_creation_input_tokens: null, 
                cache_read_input_tokens: null 
              }
            },
            timestamp: "2024-12-01T10:00:00Z"
          },
          {
            type: "message",
            uuid: `uuid_002_${testId}`,
            message: {
              id: `msg_002_${testId}`,
              role: "assistant",
              model: "claude-3-5-sonnet-20241022",
              usage: { 
                input_tokens: 200, 
                output_tokens: 100, 
                cache_creation_input_tokens: 50, 
                cache_read_input_tokens: null 
              }
            },
            timestamp: "2024-12-01T11:00:00Z"
          }
        ];
        
        createTestJsonlFile('claude_usage_2024-12-01.jsonl', jsonlEntries, 'project-1');
        
        // Update config to point to test data directory
        const testConfig = createTestConfig({
          claudeCode: {
            rawDataPath: TEST_DATA_DIR,
            pricingUrl: 'https://example.com/test-pricing.json',
            pricingCacheTimeout: 0,
            cacheDurationDefault: 5,
            batchSize: 100
          }
        });
        
        // Act
        runSync(testConfig);
        
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
        expect(fileStatus?.lastProcessedLine).toBe(2n);
        await prisma.$disconnect();
      });
    });
    
    describe('When I run the sync command multiple times', () => {
      it('Then it should only process new files and skip already processed ones', async () => {
        // Arrange
        const file1Entries = [
          {
            type: "message",
            uuid: "uuid_001",
            message: {
              id: "msg_001",
              role: "assistant",
              model: "claude-3-5-sonnet-20241022",
              usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: null, cache_read_input_tokens: null }
            },
            timestamp: "2024-12-01T10:00:00Z"
          }
        ];
        
        const file2Entries = [
          {
            type: "message",
            uuid: "uuid_002",
            message: {
              id: "msg_002",
              role: "assistant",
              model: "claude-3-5-sonnet-20241022",
              usage: { input_tokens: 200, output_tokens: 100, cache_creation_input_tokens: null, cache_read_input_tokens: null }
            },
            timestamp: "2024-12-02T10:00:00Z"
          }
        ];
        
        createTestJsonlFile('claude_usage_2024-12-01.jsonl', file1Entries, 'test-project');
        
        const testConfig = createTestConfig({
          claudeCode: {
            rawDataPath: TEST_DATA_DIR,
            pricingUrl: 'https://example.com/test-pricing.json',
            pricingCacheTimeout: 0,
            cacheDurationDefault: 5,
            batchSize: 100
          }
        });
        
        // Act - First sync
        runSync(testConfig);
        
        // Add second file
        createTestJsonlFile('claude_usage_2024-12-02.jsonl', file2Entries, 'test-project');
        
        // Act - Second sync
        runSync(testConfig);
        
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
        const projectPath = path.join(TEST_DATA_DIR, 'projects', 'project-1');
        const fs = require('fs');
        
        // Ensure directory exists
        fs.mkdirSync(projectPath, { recursive: true });
        
        const jsonlPath = path.join(projectPath, 'claude_usage_invalid.jsonl');
        
        // Mix of valid and invalid entries
        const content = [
          '{"invalid": "entry"}', // Missing required fields
          JSON.stringify({
            type: "message",
            uuid: "uuid_valid",
            message: {
              id: "msg_valid",
              model: "claude-3-5-sonnet-20241022",
              role: "assistant",
              usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: null, cache_read_input_tokens: null }
            },
            timestamp: "2024-12-01T10:00:00Z"
          }),
          'not even json', // Invalid JSON
          '' // Empty line
        ].join('\n');
        
        fs.writeFileSync(jsonlPath, content);
        
        const testConfig = createTestConfig({
          claudeCode: {
            rawDataPath: TEST_DATA_DIR,
            pricingUrl: 'https://example.com/test-pricing.json',
            pricingCacheTimeout: 0,
            cacheDurationDefault: 5,
            batchSize: 100
          }
        });
        
        // Act
        runSync(testConfig);
        
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
            type: "message",
            uuid: "uuid_cache_1",
            message: {
              id: "msg_cache_1",
              model: "claude-3-5-sonnet-20241022",
              role: "assistant",
              usage: { 
                input_tokens: 1000, 
                output_tokens: 500, 
                cache_creation_input_tokens: 2000, 
                cache_read_input_tokens: null 
              }
            },
            timestamp: "2024-12-01T10:00:00Z"
          },
          {
            type: "message",
            uuid: "uuid_cache_2",
            message: {
              id: "msg_cache_2",
              model: "claude-3-5-sonnet-20241022",
              role: "assistant",
              usage: { 
                input_tokens: 500, 
                output_tokens: 200, 
                cache_creation_input_tokens: null, 
                cache_read_input_tokens: 1500 
              }
            },
            timestamp: "2024-12-01T11:00:00Z"
          }
        ];
        
        createTestJsonlFile('claude_usage_cache.jsonl', entries, 'cache-project');
        
        const testConfig = createTestConfig({
          claudeCode: {
            rawDataPath: TEST_DATA_DIR,
            pricingUrl: 'https://example.com/test-pricing.json',
            pricingCacheTimeout: 0,
            cacheDurationDefault: 5,
            batchSize: 100
          }
        });
        
        // Act
        runSync(testConfig);
        
        // Assert
        const prisma = createTestPrismaClient();
        const messages = await prisma.message.findMany({
          orderBy: { timestamp: 'asc' }
        });
        
        expect(messages[0].cacheCreationTokens).toBe(2000n);
        expect(messages[0].cacheReadTokens).toBe(0n);
        expect(messages[1].cacheCreationTokens).toBe(0n);
        expect(messages[1].cacheReadTokens).toBe(1500n);
        
        await prisma.$disconnect();
      });
    });
  });
});