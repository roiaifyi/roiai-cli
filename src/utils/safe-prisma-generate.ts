#!/usr/bin/env node

/**
 * Safe postinstall script that generates Prisma client without causing npm install errors
 * This runs in a separate process to avoid blocking npm's directory operations
 */

const { existsSync } = require('fs');
const { join } = require('path');
const { spawn } = require('child_process');

// Only run in production installs (not in development)
if (existsSync(join(__dirname, '../../.git'))) {
  process.exit(0);
}

// Check if we're in a global install context
const isGlobalInstall = __dirname.includes('node_modules');

if (!isGlobalInstall) {
  process.exit(0);
}

// Generate Prisma client asynchronously
console.log('Setting up roiai...');

const schemaPath = join(__dirname, '../../prisma/schema.prisma');

if (!existsSync(schemaPath)) {
  console.error('Warning: Prisma schema not found');
  process.exit(0);
}

// Use spawn to run prisma generate in background
const prismaProcess = spawn('npx', ['prisma', 'generate', `--schema=${schemaPath}`], {
  cwd: join(__dirname, '../..'),
  stdio: 'pipe',
  detached: true,
  shell: true
});

// Detach the process so npm can continue
prismaProcess.unref();

// Exit immediately to let npm continue
process.exit(0);