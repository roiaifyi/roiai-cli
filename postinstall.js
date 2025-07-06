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
  
  // Check if prisma binary is available
  try {
    execSync('npx --yes prisma --version', {
      cwd: __dirname,
      stdio: 'ignore'
    });
  } catch (checkError) {
    // Prisma binary not found, try to install it
    console.log('Installing Prisma CLI...');
    try {
      execSync('npm install prisma@^6.10.0', {
        cwd: __dirname,
        stdio: 'inherit'
      });
    } catch (installError) {
      console.error('Failed to install Prisma CLI');
      throw installError;
    }
  }
  
  // Generate Prisma client
  console.log('Generating Prisma client...');
  execSync('npx --yes prisma generate', {
    cwd: __dirname,
    stdio: 'inherit',
    env: {
      ...process.env,
      PRISMA_SCHEMA_PATH: join(__dirname, 'prisma', 'schema.prisma')
    }
  });
  
  console.log('✓ Setup complete');
} catch (error) {
  console.error('Setup failed:', error.message);
  console.error('\nPlease try running the following commands manually:');
  console.error('  npm install prisma@^6.10.0');
  console.error('  npx prisma generate');
  console.error('\nIf the issue persists, please report it at:');
  console.error('  https://github.com/roiaifyi/roiai-cli/issues');
  // Don't exit with error to not break npm install
  process.exit(0);
}