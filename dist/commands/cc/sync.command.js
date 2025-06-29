"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncCommand = void 0;
const commander_1 = require("commander");
const ora_1 = __importDefault(require("ora"));
const chalk_1 = __importDefault(require("chalk"));
const config_1 = require("../../config");
const database_1 = require("../../database");
const pricing_service_1 = require("../../services/pricing.service");
const user_service_1 = require("../../services/user.service");
const jsonl_service_1 = require("../../services/jsonl.service");
const aggregation_service_1 = require("../../services/aggregation.service");
const incremental_aggregation_service_1 = require("../../services/incremental-aggregation.service");
const user_stats_service_1 = require("../../services/user-stats.service");
const logger_1 = require("../../utils/logger");
exports.syncCommand = new commander_1.Command('sync')
    .description('Sync Claude Code raw data to local database')
    .option('-f, --force', 'Force full resync (clear existing data)')
    .option('-p, --path <path>', 'Override raw data path')
    .action(async (options) => {
    const spinner = (0, ora_1.default)('Initializing sync process...').start();
    try {
        // Initialize services
        const pricingService = new pricing_service_1.PricingService();
        const userService = new user_service_1.UserService();
        const jsonlService = new jsonl_service_1.JSONLService(pricingService, userService);
        // Load pricing data
        spinner.text = 'Loading pricing data...';
        await pricingService.loadPricingData();
        // Load user info silently
        await userService.loadUserInfo();
        // Get initial cost before sync
        const userStatsServicePreSync = new user_stats_service_1.UserStatsService(database_1.prisma, userService);
        const userStatsBeforeSync = await userStatsServicePreSync.getAggregatedStats();
        const costBeforeSync = userStatsBeforeSync ? Number(userStatsBeforeSync.totalCost) : 0;
        // Handle force flag
        if (options.force) {
            spinner.start('Clearing existing data...');
            await database_1.db.clearAllData();
            spinner.succeed('Existing data cleared');
        }
        // Check if we need to use incremental aggregation
        const incrementalAggregationService = new incremental_aggregation_service_1.IncrementalAggregationService();
        const useIncremental = await incrementalAggregationService.shouldUseIncremental();
        const needsFullRecalc = !useIncremental || options.force;
        // Get data path
        const dataPath = options.path || config_1.configManager.getClaudeCodeConfig().rawDataPath;
        // Inform user about sync speed
        if (needsFullRecalc) {
            const messages = config_1.configManager.get().messages?.sync || {};
            if (options.force) {
                console.log(chalk_1.default.blue(messages.forceSync || 'ℹ️  Force sync requested. This will take longer as all data will be reprocessed.'));
            }
            else {
                console.log(chalk_1.default.blue(messages.firstTime || 'ℹ️  First time sync detected. This initial sync will take longer, but future syncs will be blazingly fast!'));
            }
            console.log(chalk_1.default.gray('   Only new or modified files will be processed in subsequent syncs.\n'));
        }
        // Start processing
        spinner.start('Processing Claude Code data...');
        const startTime = Date.now();
        // Set up progress tracking
        let lastProgressUpdate = Date.now();
        jsonlService.setProgressCallback((progress) => {
            const now = Date.now();
            // Update every 100ms to avoid too frequent updates
            if (now - lastProgressUpdate > 100) {
                const projectProgress = progress.totalProjects > 0
                    ? Math.round((progress.processedProjects / progress.totalProjects) * 100)
                    : 0;
                const fileProgress = progress.totalFiles > 0
                    ? Math.round((progress.processedFiles / progress.totalFiles) * 100)
                    : 0;
                const progressText = `Processing: Project ${progress.processedProjects + 1}/${progress.totalProjects} (${projectProgress}%) | ` +
                    `File ${progress.processedFiles + 1}/${progress.totalFiles} (${fileProgress}%)`;
                spinner.text = progressText;
                lastProgressUpdate = now;
            }
        });
        const result = await jsonlService.processDirectory(dataPath);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        spinner.succeed(`Sync completed in ${duration}s`);
        // Check if any new data was processed
        const changes = jsonlService.getIncrementalChanges();
        const hasNewData = changes.newMessages > 0 || changes.newProjects.length > 0 || changes.newSessions.length > 0;
        if (needsFullRecalc) {
            // Full recalculation needed for initial sync or force flag
            spinner.start('Recalculating aggregates...');
            const aggregationService = new aggregation_service_1.AggregationService(database_1.prisma);
            await aggregationService.recalculateAllAggregates();
            spinner.succeed('Aggregates recalculated');
        }
        else if (hasNewData) {
            // Recalculate aggregates for incremental changes
            spinner.start('Updating aggregates...');
            const aggregationService = new aggregation_service_1.AggregationService(database_1.prisma);
            await aggregationService.recalculateAllAggregates();
            spinner.succeed('Aggregates updated');
            // Show incremental changes
            if (changes.newMessages > 0 || changes.newProjects.length > 0 || changes.newSessions.length > 0) {
                console.log('\n' + chalk_1.default.bold('🔄 Incremental Changes:'));
                if (changes.newProjects.length > 0) {
                    console.log(`   ${chalk_1.default.green('+')} New projects: ${chalk_1.default.cyan(changes.newProjects.join(', '))}`);
                }
                if (changes.newSessions.length > 0) {
                    console.log(`   ${chalk_1.default.green('+')} New sessions: ${chalk_1.default.cyan(changes.newSessions.length)} session(s)`);
                    if (changes.newSessions.length <= 5) {
                        console.log(`     ${chalk_1.default.gray(changes.newSessions.map(s => s.substring(0, 8) + '...').join(', '))}`);
                    }
                }
                if (changes.newMessages > 0) {
                    console.log(`   ${chalk_1.default.green('+')} New messages: ${chalk_1.default.cyan(changes.newMessages)}`);
                }
            }
        }
        else {
            console.log(chalk_1.default.gray('  Using incremental aggregation (already initialized)'));
            console.log(chalk_1.default.gray('  No new data found'));
        }
        // Show results
        console.log('\n' + chalk_1.default.bold('📊 Sync Results:'));
        console.log(`   Projects processed: ${chalk_1.default.green(result.projectsProcessed)}`);
        console.log(`   Sessions processed: ${chalk_1.default.green(result.sessionsProcessed)}`);
        console.log(`   Messages processed: ${chalk_1.default.green(result.messagesProcessed)}`);
        // Show processing speed
        const messagesPerSecond = result.messagesProcessed > 0
            ? (result.messagesProcessed / parseFloat(duration)).toFixed(1)
            : '0';
        console.log(`   Processing speed: ${chalk_1.default.cyan(messagesPerSecond + ' messages/sec')}`);
        if (result.errors.length > 0) {
            console.log(`   Errors: ${chalk_1.default.red(result.errors.length)}`);
            if (result.errors.length <= 10) {
                result.errors.forEach(err => console.log(chalk_1.default.red(`     - ${err}`)));
            }
            else {
                console.log(chalk_1.default.red(`     (showing first 10 of ${result.errors.length} errors)`));
                result.errors.slice(0, 10).forEach(err => console.log(chalk_1.default.red(`     - ${err}`)));
            }
        }
        // Show token usage by model for processed messages
        if (result.tokenUsageByModel.size > 0) {
            // Filter out models with zero usage
            const modelsWithUsage = Array.from(result.tokenUsageByModel.values()).filter(usage => {
                const totalTokens = usage.inputTokens + usage.outputTokens +
                    usage.cacheCreationTokens + usage.cacheReadTokens;
                return totalTokens > 0;
            });
            if (modelsWithUsage.length > 0) {
                console.log('\n' + chalk_1.default.bold('🤖 Token Usage by Model (Processed Messages):'));
                // Sort by model name
                const sortedUsage = modelsWithUsage.sort((a, b) => a.model.localeCompare(b.model));
                for (const usage of sortedUsage) {
                    console.log(`\n   ${chalk_1.default.cyan(usage.model)}:`);
                    console.log(`     Input tokens: ${chalk_1.default.green(usage.inputTokens.toLocaleString())}`);
                    console.log(`     Output tokens: ${chalk_1.default.green(usage.outputTokens.toLocaleString())}`);
                    console.log(`     Cache creation tokens: ${chalk_1.default.green(usage.cacheCreationTokens.toLocaleString())}`);
                    console.log(`     Cache read tokens: ${chalk_1.default.green(usage.cacheReadTokens.toLocaleString())}`);
                    const totalTokens = usage.inputTokens + usage.outputTokens +
                        usage.cacheCreationTokens + usage.cacheReadTokens;
                    console.log(`     Total tokens: ${chalk_1.default.yellow(totalTokens.toLocaleString())}`);
                }
            }
        }
        // Show aggregated user stats
        const userStatsService = new user_stats_service_1.UserStatsService(database_1.prisma, userService);
        const userStats = await userStatsService.getAggregatedStats();
        if (userStats) {
            console.log('\n' + chalk_1.default.bold('👤 User Stats:'));
            console.log(`   📁 Projects: ${chalk_1.default.cyan(userStats.totalProjects)}`);
            console.log(`   💬 Sessions: ${chalk_1.default.cyan(userStats.totalSessions)}`);
            console.log(`   📝 Messages: ${chalk_1.default.cyan(userStats.totalMessages)}`);
            // Show message breakdown by writer
            const messageBreakdown = await userStatsService.getMessageBreakdown();
            if (messageBreakdown) {
                console.log(`\n   ${chalk_1.default.bold('💬 Message Breakdown:')}`);
                console.log(`     👤 Human: ${chalk_1.default.green(messageBreakdown.human)} (${messageBreakdown.humanPercentage}%)`);
                console.log(`     ⚙️  Agent: ${chalk_1.default.yellow(messageBreakdown.agent)} (${messageBreakdown.agentPercentage}%)`);
                console.log(`     🤖 Assistant: ${chalk_1.default.blue(messageBreakdown.assistant)} (${messageBreakdown.assistantPercentage}%)`);
                console.log(`     📊 Total: ${chalk_1.default.cyan(messageBreakdown.total)} messages`);
            }
            console.log(`\n   🔤 Input tokens: ${chalk_1.default.cyan(userStats.totalInputTokens.toLocaleString())}`);
            console.log(`   💭 Output tokens: ${chalk_1.default.cyan(userStats.totalOutputTokens.toLocaleString())}`);
            console.log(`   💾 Cache creation tokens: ${chalk_1.default.cyan(userStats.totalCacheCreationTokens.toLocaleString())}`);
            console.log(`   ⚡ Cache read tokens: ${chalk_1.default.cyan(userStats.totalCacheReadTokens.toLocaleString())}`);
            // Show detailed user stats by model before total cost
            const userStatsByModel = await userStatsService.getStatsByModel();
            if (userStatsByModel.length > 0) {
                console.log('\n' + chalk_1.default.bold('   🤖 Usage & Cost by Model:'));
                for (const modelStats of userStatsByModel) {
                    console.log(`\n      ${chalk_1.default.magenta('●')} ${chalk_1.default.cyan.bold(modelStats.model)}:`);
                    console.log(`        📊 Messages: ${chalk_1.default.white(modelStats.messageCount.toLocaleString())}`);
                    console.log(`        📥 Input: ${chalk_1.default.green(modelStats.inputTokens.toLocaleString())} tokens`);
                    console.log(`        📤 Output: ${chalk_1.default.green(modelStats.outputTokens.toLocaleString())} tokens`);
                    if (modelStats.cacheCreationTokens > 0) {
                        console.log(`        💾 Cache write: ${chalk_1.default.blue(modelStats.cacheCreationTokens.toLocaleString())} tokens`);
                    }
                    if (modelStats.cacheReadTokens > 0) {
                        console.log(`        ⚡ Cache read: ${chalk_1.default.blue(modelStats.cacheReadTokens.toLocaleString())} tokens`);
                    }
                    const totalTokens = modelStats.inputTokens + modelStats.outputTokens +
                        modelStats.cacheCreationTokens + modelStats.cacheReadTokens;
                    console.log(`        🎯 Total: ${chalk_1.default.yellow.bold(totalTokens.toLocaleString())} tokens`);
                    console.log(`        💰 Cost: ${chalk_1.default.bold.green('$' + modelStats.cost.toFixed(4))}`);
                }
            }
            // Show total cost as the bottom line
            const fullConfig = config_1.configManager.get();
            const sectionSeparator = fullConfig.display?.sectionSeparator || '═';
            const sectionSeparatorWidth = fullConfig.display?.sectionSeparatorWidth || 50;
            console.log('\n' + chalk_1.default.gray(sectionSeparator.repeat(sectionSeparatorWidth)));
            // Show incremental cost change
            const costAfterSync = Number(userStats.totalCost);
            const incrementalCost = costAfterSync - costBeforeSync;
            if (incrementalCost > 0) {
                console.log(`${chalk_1.default.bold('📈 Cost Added:')} ${chalk_1.default.bold.yellow('+$' + incrementalCost.toFixed(4))}`);
            }
            console.log(`${chalk_1.default.bold('💵 Total Cost:')} ${chalk_1.default.bold.green('$' + Number(userStats.totalCost).toFixed(4))}`);
        }
        // Check for pending sync items
        const pendingSync = await database_1.prisma.messageSyncStatus.count({
            where: { syncedAt: null }
        });
        if (pendingSync > 0) {
            console.log(`\n${chalk_1.default.yellow('⚠️')}  ${pendingSync} records pending upload. Run ${chalk_1.default.bold('roiai cc push')} to sync with remote server.`);
        }
    }
    catch (error) {
        spinner.fail('Sync failed');
        logger_1.logger.error('Sync error:', error);
        process.exit(1);
    }
    finally {
        await database_1.db.disconnect();
    }
});
//# sourceMappingURL=sync.command.js.map