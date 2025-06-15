import * as fs from 'fs';
import * as path from 'path';
import { TEST_DATA_DIR, TEST_CONFIG_PATH, createTestPrismaClient } from './setup';
import { ClaudeCodeUsageData } from '../src/models/claude-code.model';

export { createTestPrismaClient };

// Create test configuration
export function createTestConfig(overrides: any = {}) {
  const config = {
    user: {
      infoPath: path.join(TEST_DATA_DIR, 'user_info.json')
    },
    claudeCode: {
      rawDataPath: TEST_DATA_DIR,
      pricingDataPath: path.join(TEST_DATA_DIR, 'pricing-data.json'),
      cacheDurationDefault: 5,
      batchSize: 100
    },
    database: {
      dbPath: path.join(TEST_DATA_DIR, 'test.db')
    },
    ...overrides
  };
  
  fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config, null, 2));
  return config;
}

// Create test user info
export function createTestUserInfo(overrides: any = {}) {
  const userInfo = {
    email: "test@example.com",
    name: "Test User",
    ...overrides
  };
  
  const userInfoPath = path.join(TEST_DATA_DIR, 'user_info.json');
  fs.mkdirSync(path.dirname(userInfoPath), { recursive: true });
  fs.writeFileSync(userInfoPath, JSON.stringify(userInfo, null, 2));
  
  return userInfo;
}

// Create test JSONL file
export function createTestJsonlFile(filename: string, entries: Partial<ClaudeCodeUsageData>[] = []) {
  const filePath = path.join(TEST_DATA_DIR, filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  
  const content = entries.map(entry => {
    const fullEntry: ClaudeCodeUsageData = {
      id: entry.id || `msg_${Math.random().toString(36).substr(2, 9)}`,
      model: entry.model || "claude-3-5-sonnet-20241022",
      role: entry.role || "assistant",
      stop_reason: entry.stop_reason || "end_turn",
      stop_sequence: entry.stop_sequence || null,
      tool_use: entry.tool_use || [],
      usage: entry.usage || {
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        input_tokens: 100,
        output_tokens: 50
      },
      updated_at: entry.updated_at || new Date().toISOString(),
      project: entry.project || "test-project",
      user: entry.user || "test-user",
      machine: entry.machine || "test-machine",
      session: entry.session || "test-session"
    };
    return JSON.stringify(fullEntry);
  }).join('\n');
  
  fs.writeFileSync(filePath, content);
  return filePath;
}

// Create test pricing data
export function createTestPricingData() {
  const pricingData = {
    "claude-3-5-sonnet-20241022": {
      input: 0.000003,
      output: 0.000015,
      cacheWrite: 0.00000375,
      cacheRead: 0.0000003
    }
  };
  
  const pricingPath = path.join(TEST_DATA_DIR, 'pricing-data.json');
  fs.writeFileSync(pricingPath, JSON.stringify(pricingData, null, 2));
  
  return pricingData;
}

// Wait for file to be processed
export async function waitForFileProcessing(filePath: string, timeout: number = 5000) {
  const startTime = Date.now();
  const prisma = createTestPrismaClient();
  
  while (Date.now() - startTime < timeout) {
    const fileStatus = await prisma.fileStatus.findUnique({
      where: { filePath }
    });
    
    if (fileStatus && fileStatus.lastProcessedAt) {
      await prisma.$disconnect();
      return fileStatus;
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  await prisma.$disconnect();
  throw new Error(`Timeout waiting for file processing: ${filePath}`);
}

// Helper to count records in database
export async function countDatabaseRecords() {
  const prisma = createTestPrismaClient();
  
  try {
    const counts = {
      users: await prisma.user.count(),
      machines: await prisma.machine.count(),
      projects: await prisma.project.count(),
      sessions: await prisma.session.count(),
      messages: await prisma.message.count(),
      fileStatuses: await prisma.fileStatus.count()
    };
    
    return counts;
  } finally {
    await prisma.$disconnect();
  }
}