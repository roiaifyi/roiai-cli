#!/usr/bin/env node

const { execSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');

// Skip in development
if (existsSync(join(__dirname, '.git'))) {
  process.exit(0);
}

try {
  console.log('Setting up roiai...');
  
  // Generate Prisma client
  execSync('npx --yes prisma generate', {
    cwd: __dirname,
    stdio: 'inherit'
  });
  
  console.log('✓ Setup complete');
} catch (error) {
  console.error('Setup failed:', error.message);
  console.error('Please try running: npx prisma generate');
  // Don't exit with error to not break npm install
  process.exit(0);
}