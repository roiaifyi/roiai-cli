#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { ccCommand } from './commands/cc';
import { logger, LogLevel } from './utils/logger';
import { configManager } from './config';

const program = new Command();

// Set up the main CLI
program
  .name('roiai')
  .description('CLI tool for managing AI service usage data')
  .version('1.0.0')
  .option('-v, --verbose', 'Enable verbose logging')
  .hook('preAction', (thisCommand) => {
    // Set logging level based on verbose flag
    if (thisCommand.opts().verbose) {
      logger.setLevel(LogLevel.DEBUG);
    }

    // Validate configuration on startup
    try {
      configManager.get();
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