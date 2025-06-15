import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const TEST_DB_PATH = path.join(os.tmpdir(), `test-roiai-${process.pid}.db`);
export const TEST_CONFIG_PATH = path.join(os.tmpdir(), `test-config-${process.pid}.json`);
export const TEST_DATA_DIR = path.join(os.tmpdir(), `test-data-${process.pid}`);

beforeAll(async () => {
  // Create test directories
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  
  // Set up test database
  process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;
  
  // Run migrations on test database
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB_PATH}` }
  });
  
  // Generate Prisma client for test database
  execSync('npx prisma generate', {
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB_PATH}` }
  });
});

afterAll(async () => {
  // Clean up test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  
  // Clean up test data directory
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
  
  // Clean up test config
  if (fs.existsSync(TEST_CONFIG_PATH)) {
    fs.unlinkSync(TEST_CONFIG_PATH);
  }
});

// Helper to create a new Prisma client for tests
export function createTestPrismaClient() {
  return new PrismaClient({
    datasources: {
      db: {
        url: `file:${TEST_DB_PATH}`
      }
    }
  });
}

// Helper to reset database between tests
export async function resetTestDatabase() {
  const prisma = createTestPrismaClient();
  
  try {
    // Delete all data in reverse order of dependencies
    await prisma.message.deleteMany();
    await prisma.session.deleteMany();
    await prisma.project.deleteMany();
    await prisma.machine.deleteMany();
    await prisma.user.deleteMany();
    await prisma.fileStatus.deleteMany();
  } finally {
    await prisma.$disconnect();
  }
}