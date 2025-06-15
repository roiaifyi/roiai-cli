"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushCommand = void 0;
const commander_1 = require("commander");
const ora_1 = __importDefault(require("ora"));
const chalk_1 = __importDefault(require("chalk"));
const database_1 = require("../../database");
const config_1 = require("../../config");
const logger_1 = require("../../utils/logger");
exports.pushCommand = new commander_1.Command('push')
    .description('Push local database changes to remote server')
    .option('-y, --yes', 'Skip confirmation prompt')
    .option('-b, --batch-size <size>', 'Batch size for upload', '1000')
    .action(async (options) => {
    const spinner = (0, ora_1.default)();
    try {
        // Check for pending uploads
        spinner.start('Checking for pending uploads...');
        const pendingCount = await database_1.prisma.syncStatus.count({
            where: {
                syncedAt: null,
                retryCount: { lt: 3 }
            }
        });
        const failedCount = await database_1.prisma.syncStatus.count({
            where: { retryCount: { gte: 3 } }
        });
        spinner.stop();
        if (pendingCount === 0) {
            logger_1.logger.success('✅ Everything is up to date!');
            if (failedCount > 0) {
                logger_1.logger.warn(`⚠️  ${failedCount} records failed after 3 retries`);
                logger_1.logger.info(`   Run ${chalk_1.default.bold('roiai-cli cc push --reset-failed')} to retry`);
            }
            return;
        }
        // Show breakdown by table
        const breakdown = await database_1.prisma.syncStatus.groupBy({
            by: ['tableName', 'operation'],
            where: {
                syncedAt: null,
                retryCount: { lt: 3 }
            },
            _count: true,
            orderBy: {
                tableName: 'asc'
            }
        });
        console.log('\n' + chalk_1.default.bold('📋 Pending uploads:'));
        breakdown.forEach(item => {
            console.log(`   ${item.tableName}: ${chalk_1.default.cyan(item._count)} ${item.operation} operations`);
        });
        console.log(`   ${chalk_1.default.bold('Total')}: ${chalk_1.default.cyan(pendingCount)} records\n`);
        // Confirm upload unless --yes flag
        if (!options.yes) {
            const readline = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout
            });
            const answer = await new Promise(resolve => {
                readline.question(`Upload ${pendingCount} records to remote server? [y/N] `, resolve);
            });
            readline.close();
            if (answer.toLowerCase() !== 'y') {
                logger_1.logger.info('Upload cancelled');
                return;
            }
        }
        // TODO: Implement actual upload logic
        spinner.start('Connecting to remote server...');
        // Placeholder for upload implementation
        await new Promise(resolve => setTimeout(resolve, 1000));
        spinner.text = 'Uploading data...';
        await new Promise(resolve => setTimeout(resolve, 1500));
        spinner.fail('Upload not yet implemented');
        logger_1.logger.info('\n' + chalk_1.default.yellow('ℹ️  This feature is coming soon!'));
        logger_1.logger.info('The push functionality will upload your local data to a remote server for:');
        logger_1.logger.info('  • Backup and synchronization across devices');
        logger_1.logger.info('  • Team usage analytics and reporting');
        logger_1.logger.info('  • Advanced data visualization');
        // Show what would be uploaded
        const syncConfig = config_1.configManager.getSyncConfig();
        console.log('\n' + chalk_1.default.bold('Configuration:'));
        console.log(`   API Endpoint: ${chalk_1.default.cyan(syncConfig.apiEndpoint || 'Not configured')}`);
        console.log(`   Batch Size: ${chalk_1.default.cyan(options.batchSize)}`);
        console.log(`   Max Retries: ${chalk_1.default.cyan(syncConfig.maxRetries)}`);
    }
    catch (error) {
        spinner.fail('Push failed');
        logger_1.logger.error('Push error:', error);
        process.exit(1);
    }
});
//# sourceMappingURL=push.command.js.map