import { existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';

/**
 * Checks if Prisma client is generated and generates it if not.
 * This is needed because we removed postinstall to fix global installation issues.
 */
export function ensurePrismaClient(): void {
  // Check if we're in development (local repo) or production (global install)
  const isDevelopment = existsSync(join(__dirname, '../../.git'));
  
  if (isDevelopment) {
    // In development, prisma client should already be generated
    return;
  }

  // Check if prisma client exists
  const prismaClientPath = join(__dirname, '../../node_modules/.prisma/client');
  
  if (!existsSync(prismaClientPath)) {
    console.log(chalk.yellow('First time setup: Generating Prisma client...'));
    
    try {
      // Find the schema.prisma file
      const schemaPath = join(__dirname, '../../prisma/schema.prisma');
      
      if (!existsSync(schemaPath)) {
        throw new Error('Prisma schema not found. Please reinstall roiai.');
      }
      
      // Generate prisma client
      execSync(`npx prisma generate --schema="${schemaPath}"`, {
        stdio: 'pipe',
        cwd: join(__dirname, '../..'),
      });
      
      console.log(chalk.green('✓ Prisma client generated successfully'));
    } catch (error) {
      console.error(chalk.red('Failed to generate Prisma client:'), error);
      console.error(chalk.yellow('Please try running: npx prisma generate'));
      process.exit(1);
    }
  }
}