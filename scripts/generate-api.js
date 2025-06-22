#!/usr/bin/env node

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const OPENAPI_SPEC_PATH = path.join(__dirname, '../../roiai-web/openapi.yaml');
const OUTPUT_FILE = path.join(__dirname, '../src/generated/api.ts');
const OUTPUT_DIR = path.dirname(OUTPUT_FILE);

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Generate TypeScript types using openapi-typescript
const command = `npx openapi-typescript ${OPENAPI_SPEC_PATH} -o ${OUTPUT_FILE}`;

console.log('Generating TypeScript types from OpenAPI spec...');
console.log(`Input: ${OPENAPI_SPEC_PATH}`);
console.log(`Output: ${OUTPUT_FILE}`);

exec(command, (error, stdout, stderr) => {
  if (error) {
    console.error(`Error: ${error.message}`);
    return;
  }
  if (stderr && !stderr.includes('DeprecationWarning')) {
    console.error(`stderr: ${stderr}`);
  }
  console.log(stdout);
  console.log('TypeScript types generated successfully!');
});