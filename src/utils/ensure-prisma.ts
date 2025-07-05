import { existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';

let hasChecked = false;

/**
 * Ensures Prisma client is generated before any database operations
 * This is needed for global npm installations where postinstall may not work correctly
 */
export function ensurePrismaClient(): void {
  if (hasChecked) {
    return;
  }
  
  hasChecked = true;
  
  // Check if we're in development (local repo) or production (global install)
  const isDevelopment = existsSync(join(__dirname, '../../.git'));
  
  if (isDevelopment) {
    // In development, prisma client should already be generated
    return;
  }
  
  try {
    // Try to import and test the client
    const { PrismaClient } = require('@prisma/client');
    // Just try to instantiate with a dummy URL - if it throws, we'll catch it
    new PrismaClient({
      datasources: {
        db: {
          url: 'file:./test.db'
        }
      }
    });
  } catch (error: any) {
    if (error.message.includes('did not initialize yet')) {
      console.log(chalk.yellow('First time setup: Generating Prisma client...'));
      
      try {
        // Find the schema.prisma file
        const schemaPath = join(__dirname, '../../prisma/schema.prisma');
        
        if (!existsSync(schemaPath)) {
          throw new Error('Prisma schema not found. Please reinstall roiai.');
        }
        
        // Generate prisma client
        execSync(`npx --yes prisma generate --schema="${schemaPath}"`, {
          stdio: 'inherit',
          cwd: join(__dirname, '../..'),
        });
        
        console.log(chalk.green('✓ Prisma client generated successfully'));
        
        // Clear the require cache to force re-import
        delete require.cache[require.resolve('@prisma/client')];
      } catch (genError: any) {
        console.error(chalk.red('Failed to generate Prisma client:'), genError.message);
        console.error(chalk.yellow('Please try running: npx prisma generate'));
        process.exit(1);
      }
    }
  }
}