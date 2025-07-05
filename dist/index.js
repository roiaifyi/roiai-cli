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
const ensure_prisma_1 = require("./utils/ensure-prisma");
// Ensure Prisma client is generated before any operations
(0, ensure_prisma_1.ensurePrismaClient)();
const program = new commander_1.Command();
// Get version from package.json
const packageJson = require('../package.json');
// Set up the main CLI
program
    .name('roiai')
    .description('Analyze your Claude Code usage and costs - locally or across all your development machines.\n\n' +
    '  Privacy First: Use "roiai cc sync" to analyze data locally without any cloud upload.\n' +
    '  Multi-Machine: Use "roiai cc push" to consolidate data from all your machines.\n\n' +
    '  Quick Start:\n' +
    '    $ roiai cc sync          # Analyze Claude Code usage (local only)\n' +
    '    $ roiai cc login         # Login to roiAI account\n' +
    '    $ roiai cc push          # Upload to cloud and view at roiai.fyi\n\n' +
    '  Learn more at https://roiai.fyi')
    .version(packageJson.version)
    .option('--verbose', 'Enable verbose logging')
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
// Add helpful footer information
program.addHelpText('after', `
Examples:
  $ roiai cc sync              # Analyze Claude Code usage locally
  $ roiai cc login             # Login to roiAI account  
  $ roiai cc push              # Upload and view at roiai.fyi
  $ roiai cc push-status       # Check authentication status

Documentation:
  GitHub: https://github.com/roiaifyi/roiai-cli
  Website: https://roiai.fyi`);
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