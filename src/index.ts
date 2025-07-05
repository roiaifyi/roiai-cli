#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { ccCommand } from './commands/cc';
import { logger, LogLevel } from './utils/logger';
import { configManager } from './config';
import { ensurePrismaClient } from './utils/ensure-prisma';

// Ensure Prisma client is generated before any operations
ensurePrismaClient();

// Log environment and configuration info on startup
const environment = process.env.NODE_ENV || 'default';
console.log(chalk.gray(`Running in ${environment} mode`));

// Warn if NODE_ENV is not set in production-like environments
if (!process.env.NODE_ENV && process.argv[0].includes('node')) {
  console.log(chalk.yellow('ℹ️  NODE_ENV is not set. Using default configuration.'));
  console.log(chalk.yellow('   For production, set NODE_ENV=production'));
}

const program = new Command();

// Get version from package.json
const packageJson = require('../package.json');

// Set up the main CLI
program
  .name('roiai')
  .description('CLI tool for managing AI service usage data')
  .version(packageJson.version)
  .option('--verbose', 'Enable verbose logging')
  .hook('preAction', (thisCommand) => {
    // Set logging level based on verbose flag
    if (thisCommand.opts().verbose) {
      logger.setLevel(LogLevel.DEBUG);
    }

    // Validate configuration on startup
    try {
      const config = configManager.get();
      
      // Log API configuration in verbose mode
      if (thisCommand.opts().verbose) {
        logger.debug(`API Base URL: ${config.api.baseUrl}`);
        logger.debug(`Login endpoint: ${config.api.baseUrl}${config.api.endpoints.login}`);
        logger.debug(`Push endpoint: ${config.api.baseUrl}${config.api.endpoints.push}`);
      }
    } catch (error: any) {
      logger.error('Configuration error:', error.message);
      process.exit(1);
    }
  });

// Add subcommands
program.addCommand(ccCommand);

// Add a help command
program
  .command('help [command]')
  .description('Display help for a specific command')
  .action((commandName) => {
    if (commandName) {
      const command = program.commands.find(cmd => cmd.name() === commandName);
      if (command) {
        command.help();
      } else {
        logger.error(`Unknown command: ${commandName}`);
      }
    } else {
      program.help();
    }
  });

// Handle unknown commands
program.on('command:*', () => {
  logger.error(`Invalid command: ${program.args.join(' ')}`);
  logger.info(`Run ${chalk.cyan('roiai --help')} for a list of available commands.`);
  process.exit(1);
});

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}