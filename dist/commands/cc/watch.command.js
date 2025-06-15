"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.watchCommand = void 0;
const commander_1 = require("commander");
const chokidar_1 = __importDefault(require("chokidar"));
const path_1 = __importDefault(require("path"));
const chalk_1 = __importDefault(require("chalk"));
const config_1 = require("../../config");
const database_1 = require("../../database");
const pricing_service_1 = require("../../services/pricing.service");
const user_service_1 = require("../../services/user.service");
const jsonl_service_1 = require("../../services/jsonl.service");
const logger_1 = require("../../utils/logger");
exports.watchCommand = new commander_1.Command('watch')
    .description('Watch Claude Code raw data directory for changes and auto-sync')
    .option('-p, --path <path>', 'Override raw data path to watch')
    .option('-i, --interval <ms>', 'Polling interval in milliseconds', '5000')
    .action(async (options) => {
    try {
        // Initialize services
        const pricingService = new pricing_service_1.PricingService();
        const userService = new user_service_1.UserService();
        const jsonlService = new jsonl_service_1.JSONLService(pricingService, userService);
        // Load initial data
        logger_1.logger.info('Loading pricing data...');
        await pricingService.loadPricingData();
        logger_1.logger.info('Loading user information...');
        await userService.loadUserInfo();
        const userInfo = userService.getUserInfo();
        logger_1.logger.success(`Logged in as: ${userInfo.userId} (Machine: ${userInfo.clientMachineId})`);
        // Get watch path
        const watchPath = options.path || config_1.configManager.getClaudeCodeConfig().rawDataPath;
        const watchConfig = config_1.configManager.getWatchConfig();
        logger_1.logger.info(`Watching directory: ${chalk_1.default.cyan(watchPath)}`);
        logger_1.logger.info('Press Ctrl+C to stop watching\n');
        // Set up file watcher
        const watcher = chokidar_1.default.watch(path_1.default.join(watchPath, '**/*.jsonl'), {
            ignored: watchConfig.ignored,
            persistent: true,
            usePolling: true,
            interval: parseInt(options.interval),
            awaitWriteFinish: {
                stabilityThreshold: 2000,
                pollInterval: 100
            }
        });
        // Track processing to avoid duplicates
        const processingQueue = new Set();
        let isProcessing = false;
        const processFile = async (filePath) => {
            if (processingQueue.has(filePath) || isProcessing) {
                return;
            }
            processingQueue.add(filePath);
            isProcessing = true;
            try {
                // Extract project ID from file path
                const relativePath = path_1.default.relative(watchPath, filePath);
                const projectDir = relativePath.split(path_1.default.sep)[0];
                const projectName = projectDir.replace(/^-Users-[^-]+-/, '');
                const project = await jsonlService['ensureProject'](projectName);
                logger_1.logger.info(`Processing ${chalk_1.default.yellow(path_1.default.basename(filePath))}...`);
                const result = await jsonlService.processJSONLFile(filePath, project.id);
                if (result.messagesProcessed > 0) {
                    logger_1.logger.success(`Processed ${chalk_1.default.green(result.messagesProcessed)} messages` +
                        (result.duplicatesSkipped > 0 ? ` (${chalk_1.default.yellow(result.duplicatesSkipped)} duplicates skipped)` : ''));
                }
                if (result.errors.length > 0) {
                    result.errors.forEach(err => logger_1.logger.error(err));
                }
            }
            catch (error) {
                logger_1.logger.error(`Failed to process ${filePath}:`, error);
            }
            finally {
                processingQueue.delete(filePath);
                isProcessing = false;
            }
        };
        // Watch events
        watcher
            .on('add', async (filePath) => {
            logger_1.logger.debug(`File added: ${filePath}`);
            await processFile(filePath);
        })
            .on('change', async (filePath) => {
            logger_1.logger.debug(`File changed: ${filePath}`);
            await processFile(filePath);
        })
            .on('error', (error) => {
            logger_1.logger.error('Watcher error:', error);
        })
            .on('ready', () => {
            logger_1.logger.success('Initial scan complete. Watching for changes...');
        });
        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            logger_1.logger.info('\nStopping file watcher...');
            await watcher.close();
            await database_1.db.disconnect();
            logger_1.logger.success('Watch mode stopped');
            process.exit(0);
        });
        // Keep the process running
        await new Promise(() => { });
    }
    catch (error) {
        logger_1.logger.error('Watch error:', error);
        await database_1.db.disconnect();
        process.exit(1);
    }
});
//# sourceMappingURL=watch.command.js.map