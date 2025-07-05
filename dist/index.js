#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const cc_1 = require("./commands/cc");
const logger_1 = require("./utils/logger");
const config_1 = require("./config");
const prisma_check_1 = require("./utils/prisma-check");
// Ensure Prisma client is generated (for global installations)
(0, prisma_check_1.ensurePrismaClient)();
// Log environment and configuration info on startup
const environment = process.env.NODE_ENV || 'default';
console.log(chalk_1.default.gray(`Running in ${environment} mode`));
// Warn if NODE_ENV is not set in production-like environments
if (!process.env.NODE_ENV && process.argv[0].includes('node')) {
    console.log(chalk_1.default.yellow('ℹ️  NODE_ENV is not set. Using default configuration.'));
    console.log(chalk_1.default.yellow('   For production, set NODE_ENV=production'));
}
const program = new commander_1.Command();
// Set up the main CLI
program
    .name('roiai')
    .description('CLI tool for managing AI service usage data')
    .version('1.0.0')
    .option('-v, --verbose', 'Enable verbose logging')
    .hook('preAction', (thisCommand) => {
    // Set logging level based on verbose flag
    if (thisCommand.opts().verbose) {
        logger_1.logger.setLevel(logger_1.LogLevel.DEBUG);
    }
    // Validate configuration on startup
    try {
        const config = config_1.configManager.get();
        // Log API configuration in verbose mode
        if (thisCommand.opts().verbose) {
            logger_1.logger.debug(`API Base URL: ${config.api.baseUrl}`);
            logger_1.logger.debug(`Login endpoint: ${config.api.baseUrl}${config.api.endpoints.login}`);
            logger_1.logger.debug(`Push endpoint: ${config.api.baseUrl}${config.api.endpoints.push}`);
        }
    }
    catch (error) {
        logger_1.logger.error('Configuration error:', error.message);
        process.exit(1);
    }
});
// Add subcommands
program.addCommand(cc_1.ccCommand);
// Add a help command
program
    .command('help [command]')
    .description('Display help for a specific command')
    .action((commandName) => {
    if (commandName) {
        const command = program.commands.find(cmd => cmd.name() === commandName);
        if (command) {
            command.help();
        }
        else {
            logger_1.logger.error(`Unknown command: ${commandName}`);
        }
    }
    else {
        program.help();
    }
});
// Handle unknown commands
program.on('command:*', () => {
    logger_1.logger.error(`Invalid command: ${program.args.join(' ')}`);
    logger_1.logger.info(`Run ${chalk_1.default.cyan('roiai --help')} for a list of available commands.`);
    process.exit(1);
});
// Parse command line arguments
program.parse(process.argv);
// Show help if no command provided
if (!process.argv.slice(2).length) {
    program.outputHelp();
}
//# sourceMappingURL=index.js.map