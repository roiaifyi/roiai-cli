#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Get database path from environment or use default
const dbPath = process.env.TEST_DB_PATH || path.join(__dirname, '../test.db');

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Remove existing database file if it exists
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

// Set up the database URL
process.env.DATABASE_URL = `file:${dbPath}`;

// Run Prisma migrations
try {
  console.log(`Setting up test database at ${dbPath}...`);
  
  // Get the project root directory (where prisma folder is)
  const projectRoot = path.join(__dirname, '../..');
  
  execSync('npx prisma db push --force-reset --skip-generate', {
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
    cwd: projectRoot, // Run from project root so Prisma can find schema
    stdio: 'inherit'
  });
  console.log('Test database setup complete');
} catch (error) {
  console.error('Failed to set up test database:', error);
  process.exit(1);
}