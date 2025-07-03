import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export async function setupTestDatabase(dbPath: string): Promise<void> {
  // Ensure directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Remove existing database file if it exists
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  
  // Get the project root directory (where prisma folder is)
  const projectRoot = path.join(__dirname, '../..');
  
  // Run Prisma migrations
  execSync('npx prisma db push --force-reset --skip-generate', {
    env: {
      ...process.env,
      DATABASE_URL: `file:${dbPath}`
    },
    cwd: projectRoot,
    stdio: 'pipe' // Don't output to console during tests
  });
}

export async function cleanupTestDatabase(dbPath: string): Promise<void> {
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  
  // Clean up directory if empty
  const dir = path.dirname(dbPath);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
  }
}