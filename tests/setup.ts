import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Set test environment
process.env.NODE_ENV = 'test';

// Suppress Prisma logs during tests
process.env.PRISMA_HIDE_UPDATE_MESSAGE = 'true';

// Mock console methods to reduce noise during tests
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Keep error and debug for debugging
  error: console.error,
  debug: console.debug,
} as Console;

// Use local tmp directory for all test files
const tmpDir = path.join(process.cwd(), 'tmp');

export const TEST_DB_PATH = path.join(tmpDir, `test-roiai-${process.pid}.db`);
export const TEST_CONFIG_PATH = path.join(tmpDir, `test-config-${process.pid}.json`);
export const TEST_DATA_DIR = path.join(tmpDir, `test-data-${process.pid}`);

beforeAll(async () => {
  // Ensure tmp directory exists
  fs.mkdirSync(tmpDir, { recursive: true });
  
  // Create test directories
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  
  // Remove existing test database if it exists
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  
  // Set up test database
  process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;
  
  // Only log in verbose mode
  if (process.env.VERBOSE_TESTS) {
    console.log(`Setting up test database at ${TEST_DB_PATH}...`);
  }
  
  // Create the database schema using push instead of migrate
  execSync('npx prisma db push --force-reset --skip-generate', {
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB_PATH}` },
    stdio: process.env.VERBOSE_TESTS ? 'inherit' : 'pipe'
  });
  
  if (process.env.VERBOSE_TESTS) {
    console.log('Test database setup complete');
  }
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
    // Check if database exists by trying to count users
    // If it fails, the database doesn't exist yet, so skip reset
    try {
      await prisma.user.count();
    } catch (error: any) {
      if (error.message?.includes('does not exist')) {
        // Database not initialized yet, create it
        await ensureDatabaseInitialized();
        return;
      }
      throw error;
    }
    
    // Delete all data in reverse order of dependencies
    // Note: messageSyncStatus will be cascade deleted with messages
    await prisma.message.deleteMany();
    await prisma.session.deleteMany();
    await prisma.project.deleteMany();
    await prisma.machine.deleteMany();
    await prisma.user.deleteMany();
    await prisma.fileStatus.deleteMany();
  } finally {
    await prisma.$disconnect();
  }
  
  // Also clean up test data directory
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

// Helper to ensure database is initialized
export async function ensureDatabaseInitialized() {
  // Create the database schema using push
  execSync('npx prisma db push --force-reset --skip-generate', {
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB_PATH}` },
    stdio: process.env.VERBOSE_TESTS ? 'inherit' : 'pipe'
  });
}