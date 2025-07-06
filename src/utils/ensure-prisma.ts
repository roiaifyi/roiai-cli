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
    // Try to check if @prisma/client exists
    require.resolve('@prisma/client');
    
    // Also check if we can access the generated client files
    const generatedPath = require.resolve('@prisma/client/index.js');
    if (!existsSync(generatedPath)) {
      throw new Error('Prisma client files not found');
    }
  } catch (error: any) {
    console.log(chalk.yellow('First time setup: Generating Prisma client...'));
    
    try {
      // Find the schema.prisma file
      const schemaPath = join(__dirname, '../../prisma/schema.prisma');
      
      if (!existsSync(schemaPath)) {
        throw new Error('Prisma schema not found. Please reinstall roiai.');
      }
      
      // Check if prisma CLI is available
      try {
        execSync('npx --yes prisma --version', {
          stdio: 'ignore',
          cwd: join(__dirname, '../..'),
        });
      } catch {
        // Prisma CLI not found, since it's now in dependencies it should be available
        console.log(chalk.yellow('Installing Prisma CLI...'));
        execSync('npm install prisma@^6.10.0', {
          stdio: 'inherit',
          cwd: join(__dirname, '../..'),
        });
      }
      
      // Generate prisma client
      execSync(`npx --yes prisma generate --schema="${schemaPath}"`, {
        stdio: 'inherit',
        cwd: join(__dirname, '../..'),
        env: {
          ...process.env,
          PRISMA_SCHEMA_PATH: schemaPath
        }
      });
      
      console.log(chalk.green('✓ Prisma client generated successfully'));
      
      // Clear the require cache to force re-import
      delete require.cache[require.resolve('@prisma/client')];
    } catch (genError: any) {
      console.error(chalk.red('Failed to generate Prisma client:'), genError.message);
      console.error(chalk.yellow('\nPlease try running the following commands:'));
      console.error(chalk.cyan('  npm install prisma@^6.10.0'));
      console.error(chalk.cyan('  npx prisma generate'));
      console.error(chalk.yellow('\nIf the issue persists, please report it at:'));
      console.error(chalk.cyan('  https://github.com/roiaifyi/roiai-cli/issues'));
      process.exit(1);
    }
  }
}