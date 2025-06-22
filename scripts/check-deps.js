#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Read package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

// Get all dependencies
const allDeps = {
  ...packageJson.dependencies,
  ...packageJson.devDependencies
};

// Dependencies to check (excluding build tools and types)
const depsToCheck = Object.keys(allDeps).filter(dep => {
  // Skip build tools and type definitions that are required but not imported
  const skipList = [
    '@jest/globals',
    '@openapitools/openapi-generator-cli',
    '@types/', // Skip all type definitions
    'jest',
    'nodemon',
    'openapi-typescript',
    'prisma',
    'ts-jest',
    'ts-node',
    'typescript'
  ];
  
  return !skipList.some(skip => dep.startsWith(skip));
});

console.log('Checking usage of dependencies...\n');

const results = {
  used: [],
  unused: []
};

// Check each dependency
depsToCheck.forEach(dep => {
  try {
    // Search for imports/requires in src and tests directories
    const searchCommand = `find src tests -name "*.ts" -o -name "*.js" | xargs grep -l "${dep}" 2>/dev/null || true`;
    const output = execSync(searchCommand, { cwd: path.join(__dirname, '..') }).toString().trim();
    
    if (output) {
      results.used.push(dep);
    } else {
      // Special check for express which might be used in JS test files
      if (dep === 'express') {
        const jsSearchCommand = `find tests -name "*.js" | xargs grep -l "express" 2>/dev/null || true`;
        const jsOutput = execSync(jsSearchCommand, { cwd: path.join(__dirname, '..') }).toString().trim();
        if (jsOutput) {
          results.used.push(dep);
        } else {
          results.unused.push(dep);
        }
      } else {
        results.unused.push(dep);
      }
    }
  } catch (error) {
    console.error(`Error checking ${dep}:`, error.message);
  }
});

// Report results
console.log('✅ Used dependencies:');
results.used.forEach(dep => console.log(`   - ${dep}`));

console.log('\n❌ Potentially unused dependencies:');
results.unused.forEach(dep => console.log(`   - ${dep}`));

// Check for duplicates (axios vs node-fetch)
console.log('\n⚠️  Potential duplicates:');
if (results.used.includes('axios') && results.used.includes('node-fetch')) {
  console.log('   - Both axios and node-fetch are used. Consider using only one HTTP client.');
}