import * as fs from 'fs';
import * as path from 'path';
import { TEST_DATA_DIR, TEST_CONFIG_PATH, TEST_DB_PATH, createTestPrismaClient } from './setup';

export { createTestPrismaClient };

// Create test configuration
export function createTestConfig(overrides: any = {}) {
  const config = {
    app: {
      dataDir: TEST_DATA_DIR
    },
    user: {
      infoPath: path.join(TEST_DATA_DIR, 'user_info.json')
    },
    claudeCode: {
      rawDataPath: TEST_DATA_DIR,
      pricingUrl: 'https://example.com/test-pricing.json',
      pricingCacheTimeout: 0, // No cache for tests
      cacheDurationDefault: 5,
      batchSize: 100
    },
    database: {
      path: TEST_DB_PATH
    },
    ...overrides
  };
  
  fs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config, null, 2));
  return config;
}

// Create test user info
export function createTestUserInfo(overrides: any = {}) {
  // First create machine info
  const machineInfo = {
    machineId: "test-machine-123",
    macAddress: "aa:bb:cc:dd:ee:ff",
    osInfo: {
      platform: "darwin",
      release: "20.0.0",
      arch: "x64",
      hostname: "test-machine"
    },
    createdAt: new Date().toISOString(),
    version: 2
  };
  
  const machineInfoPath = path.join(TEST_DATA_DIR, 'machine_info.json');
  fs.mkdirSync(path.dirname(machineInfoPath), { recursive: true });
  fs.writeFileSync(machineInfoPath, JSON.stringify(machineInfo, null, 2));
  
  // Create user info with new structure
  const userInfo = {
    anonymousId: "anon-test-machine-123",
    clientMachineId: "test-machine-123",
    auth: {
      userId: "test-user-123",
      email: "test@example.com",
      username: "test",
      apiToken: "test-auth-token"
    },
    ...overrides
  };
  
  const userInfoPath = path.join(TEST_DATA_DIR, 'user_info.json');
  fs.writeFileSync(userInfoPath, JSON.stringify(userInfo, null, 2));
  
  return userInfo;
}

// Create test JSONL file
export function createTestJsonlFile(filename: string, entries: any[] = [], projectName: string = 'test-project') {
  // Create the expected directory structure: projects/[project-name]/
  const projectPath = path.join(TEST_DATA_DIR, 'projects', projectName);
  
  // Ensure directories exist
  fs.mkdirSync(projectPath, { recursive: true });
  
  const filePath = path.join(projectPath, filename);
  
  const content = entries.map(entry => {
    // If entry is already in JSONL format, use it directly
    if (entry.type || entry.message) {
      return JSON.stringify(entry);
    }
    
    // Otherwise, convert old format to JSONL format
    const fullEntry = {
      type: "message",
      uuid: entry.uuid || `uuid_${Math.random().toString(36).substr(2, 9)}`,
      message: {
        id: entry.id || `msg_${Math.random().toString(36).substr(2, 9)}`,
        model: entry.model || "claude-3-5-sonnet-20241022",
        role: entry.role || "assistant",
        usage: entry.usage || {
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null,
          input_tokens: 100,
          output_tokens: 50
        }
      },
      timestamp: entry.updated_at || entry.timestamp || new Date().toISOString()
    };
    return JSON.stringify(fullEntry);
  }).join('\n');
  
  fs.writeFileSync(filePath, content);
  return filePath;
}

// Create test pricing data (for mocking fetch responses)
export function createTestPricingData() {
  const pricingData = {
    metadata: {
      id: "test-pricing",
      provider: "Anthropic",
      providerUrl: "https://www.anthropic.com",
      apiEndpoint: "https://api.anthropic.com",
      source: "test",
      lastUpdated: new Date().toISOString(),
      version: "1.0.0",
      description: "Test pricing data",
      currency: "USD",
      unit: "per token",
      notes: "Test data"
    },
    models: [
      {
        modelId: "claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet",
        input: 0.000003,
        output: 0.000015,
        cache: {
          "5m": { write: 0.00000375, read: 0.0000003 },
          "1h": { write: 0.00000375, read: 0.0000003 }
        },
        originalRates: {
          input: "$3/MTok",
          output: "$15/MTok"
        }
      }
    ]
  };
  
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