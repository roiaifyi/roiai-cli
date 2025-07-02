#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// This script ensures the test database exists and has the correct schema
// It's meant to be called by the CLI process itself

function ensureTestDatabase() {
  const config = JSON.parse(process.env.NODE_CONFIG || '{}');
  const dbPath = config.database?.path;
  
  if (!dbPath) {
    console.error('No database path in config');
    return;
  }
  
  // Check if database exists and has tables
  if (fs.existsSync(dbPath)) {
    try {
      // Check if it has tables
      const tables = execSync(`sqlite3 "${dbPath}" ".tables"`, { encoding: 'utf8' }).trim();
      if (tables.includes('users') && tables.includes('machines')) {
        // Database looks good
        return;
      }
    } catch (err) {
      // Database might be corrupted
    }
  }
  
  // Create or recreate database
  console.log('Setting up test database...');
  
  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  // Get the project root directory (where prisma folder is)
  const projectRoot = path.join(__dirname, '../..');
  
  try {
    execSync('npx prisma db push --force-reset --skip-generate', {
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
      cwd: projectRoot,
      stdio: 'pipe' // Don't show output
    });
  } catch (error) {
    console.error('Failed to set up database:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  ensureTestDatabase();
}