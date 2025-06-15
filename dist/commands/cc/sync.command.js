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
        // Load user info
        spinner.text = 'Loading user information...';
        await userService.loadUserInfo();
        const userInfo = userService.getUserInfo();
        spinner.succeed(`Logged in as: ${userInfo.userId} (Machine: ${userInfo.clientMachineId})`);
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
        // Configure JSONLService based on aggregation mode
        jsonlService.setUseIncrementalAggregation(!needsFullRecalc);
        // Get data path
        const dataPath = options.path || config_1.configManager.getClaudeCodeConfig().rawDataPath;
        // Start processing
        spinner.start('Processing Claude Code data...');
        const startTime = Date.now();
        const result = await jsonlService.processDirectory(dataPath);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        spinner.succeed(`Sync completed in ${duration}s`);
        if (needsFullRecalc) {
            // Full recalculation needed for initial sync or force flag
            spinner.start('Recalculating aggregates...');
            const aggregationService = new aggregation_service_1.AggregationService(database_1.prisma);
            await aggregationService.recalculateAllAggregates();
            spinner.succeed('Aggregates recalculated');
        }
        else {
            console.log(chalk_1.default.gray('  Using incremental aggregation (already initialized)'));
            // Show incremental changes if any
            const changes = jsonlService.getIncrementalChanges();
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
                    console.log(`   ${chalk_1.default.green('+')} Cost added: ${chalk_1.default.cyan('$' + changes.totalCostAdded.toFixed(4))}`);
                }
            }
            else {
                console.log(chalk_1.default.gray('  No new data found'));
            }
        }
        // Show results
        console.log('\n' + chalk_1.default.bold('📊 Sync Results:'));
        console.log(`   Sessions processed: ${chalk_1.default.green(result.sessionsProcessed)}`);
        console.log(`   Messages processed: ${chalk_1.default.green(result.messagesProcessed)}`);
        console.log(`   Duplicates skipped: ${chalk_1.default.yellow(result.duplicatesSkipped)}`);
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
        // Show database stats
        const stats = await getDatabaseStats();
        console.log('\n' + chalk_1.default.bold('💾 Database Stats:'));
        console.log(`   Total users: ${chalk_1.default.cyan(stats.users)}`);
        console.log(`   Total projects: ${chalk_1.default.cyan(stats.projects)}`);
        console.log(`   Total sessions: ${chalk_1.default.cyan(stats.sessions)}`);
        console.log(`   Total messages: ${chalk_1.default.cyan(stats.messages)}`);
        console.log(`   Total cost: ${chalk_1.default.cyan('$' + stats.totalCost.toFixed(4))}`);
        // Show aggregated user stats
        const userStats = await getUserAggregatedStats();
        if (userStats) {
            console.log('\n' + chalk_1.default.bold('👤 User Stats:'));
            console.log(`   Projects: ${chalk_1.default.cyan(userStats.totalProjects)}`);
            console.log(`   Sessions: ${chalk_1.default.cyan(userStats.totalSessions)}`);
            console.log(`   Messages: ${chalk_1.default.cyan(userStats.totalMessages)}`);
            console.log(`   Total cost: ${chalk_1.default.cyan('$' + Number(userStats.totalCost).toFixed(4))}`);
            console.log(`   Input tokens: ${chalk_1.default.cyan(userStats.totalInputTokens.toLocaleString())}`);
            console.log(`   Output tokens: ${chalk_1.default.cyan(userStats.totalOutputTokens.toLocaleString())}`);
            console.log(`   Cache creation tokens: ${chalk_1.default.cyan(userStats.totalCacheCreationTokens.toLocaleString())}`);
            console.log(`   Cache read tokens: ${chalk_1.default.cyan(userStats.totalCacheReadTokens.toLocaleString())}`);
        }
        // Check for pending sync items
        const pendingSync = await database_1.prisma.syncStatus.count({
            where: { syncedAt: null }
        });
        if (pendingSync > 0) {
            console.log(`\n${chalk_1.default.yellow('⚠️')}  ${pendingSync} records pending upload. Run ${chalk_1.default.bold('roiai-cli cc push')} to sync with remote server.`);
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
async function getDatabaseStats() {
    const [users, projects, sessions, messages, totalCostResult] = await Promise.all([
        database_1.prisma.user.count(),
        database_1.prisma.project.count(),
        database_1.prisma.session.count(),
        database_1.prisma.message.count(),
        database_1.prisma.message.aggregate({
            _sum: {
                messageCost: true
            }
        })
    ]);
    return {
        users,
        projects,
        sessions,
        messages,
        totalCost: Number(totalCostResult._sum.messageCost || 0)
    };
}
async function getUserAggregatedStats() {
    const userService = new user_service_1.UserService();
    await userService.loadUserInfo();
    const userId = userService.getUserId();
    const user = await database_1.prisma.user.findUnique({
        where: { id: userId }
    });
    return user;
}
//# sourceMappingURL=sync.command.js.map