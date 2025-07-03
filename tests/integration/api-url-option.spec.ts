import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { setupTestDatabase, cleanupTestDatabase } from '../helpers/test-db-utils';

const execAsync = promisify(exec);

describe('--api-url option integration tests', () => {
  const testDbPath = path.join(__dirname, '../tmp/test-api-url.db');
  const cliPath = path.join(__dirname, '../../dist/index.js');
  const testDataDir = path.join(__dirname, '../tmp/test-data-api-url');
  
  beforeAll(async () => {
    await setupTestDatabase(testDbPath);
    // Create test data directory
    if (!require('fs').existsSync(testDataDir)) {
      require('fs').mkdirSync(testDataDir, { recursive: true });
    }
  });

  afterAll(async () => {
    await cleanupTestDatabase(testDbPath);
    // Clean up test data directory
    if (require('fs').existsSync(testDataDir)) {
      require('fs').rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('login command with --api-url', () => {
    it('should use custom API URL when provided', async () => {
      const customUrl = 'https://custom.test.api.com';
      
      try {
        // This will fail because the custom URL doesn't exist, but we can check the error
        await execAsync(`node ${cliPath} cc --api-url ${customUrl} login --help`);
      } catch (error: any) {
        // The command should work (showing help), not fail due to URL
        expect(error).toBeUndefined();
      }
    });
  });

  describe('push-status command with --api-url', () => {
    it('should display custom API URL in configuration', async () => {
      const customUrl = 'https://staging.api.roiai.fyi';
      
      const { stdout } = await execAsync(
        `NODE_ENV=test node ${cliPath} cc --api-url ${customUrl} push-status`,
        {
          env: {
            ...process.env,
            DATABASE_URL: `file:${testDbPath}`,
            NODE_ENV: 'test',
            APP_DATA_DIR: testDataDir
          }
        }
      );
      
      expect(stdout).toContain('API URL: https://staging.api.roiai.fyi');
      expect(stdout).toContain('Configuration');
    });
  });

  describe('command hierarchy', () => {
    it('should inherit --api-url from parent command', async () => {
      const parentUrl = 'https://parent.api.com';
      
      const { stdout } = await execAsync(
        `NODE_ENV=test node ${cliPath} cc --api-url ${parentUrl} push-status`,
        {
          env: {
            ...process.env,
            DATABASE_URL: `file:${testDbPath}`,
            NODE_ENV: 'test',
            APP_DATA_DIR: testDataDir
          }
        }
      );
      
      expect(stdout).toContain(`API URL: ${parentUrl}`);
    });
  });

  describe('help output', () => {
    it('should show --api-url option in cc command help', async () => {
      const { stdout } = await execAsync(`node ${cliPath} cc help`);
      
      expect(stdout).toContain('--api-url <url>');
      expect(stdout).toContain('Override API server URL');
    });
  });
});