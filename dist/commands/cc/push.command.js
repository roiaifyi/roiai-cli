"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushCommand = void 0;
exports.createPushCommand = createPushCommand;
const commander_1 = require("commander");
const ora_1 = __importDefault(require("ora"));
const chalk_1 = __importDefault(require("chalk"));
const client_1 = require("@prisma/client");
const push_service_1 = require("../../services/push.service");
const config_1 = require("../../config");
function createPushCommand() {
    return new commander_1.Command('push')
        .description('Push local usage data to remote server')
        .option('-b, --batch-size <number>', 'Messages per batch', parseInt)
        .option('-d, --dry-run', 'Preview what would be pushed without actually pushing')
        .option('-f, --force', 'Reset retry count for failed records and retry')
        .option('-v, --verbose', 'Show detailed progress')
        .action(async (options) => {
        const spinner = (0, ora_1.default)('Initializing push...').start();
        const prisma = new client_1.PrismaClient();
        try {
            const pushConfig = config_1.configManager.getPushConfig();
            // Validate configuration
            if (!pushConfig.apiToken) {
                spinner.fail('Push API token not configured. Please set push.apiToken in config.');
                process.exit(1);
            }
            const pushService = new push_service_1.PushService(prisma, pushConfig);
            // Use config batch size if not specified in command line
            const batchSize = options.batchSize || pushConfig.batchSize;
            // Get initial statistics
            let stats = await pushService.getPushStatistics();
            if (stats.unsynced === 0) {
                spinner.succeed('All messages are already synced!');
                return;
            }
            spinner.info(`Found ${chalk_1.default.yellow(stats.unsynced)} unsynced messages`);
            if (stats.retryDistribution.length > 0) {
                console.log('\nRetry distribution:');
                stats.retryDistribution.forEach(r => {
                    console.log(`  ${r.retryCount} retries: ${r.count} messages`);
                });
            }
            // Handle force option
            if (options.force) {
                spinner.start('Resetting retry counts...');
                const resetCount = await pushService.resetRetryCount();
                spinner.succeed(`Reset retry count for ${resetCount} messages`);
                // Get fresh statistics after reset
                stats = await pushService.getPushStatistics();
            }
            // Get count of messages eligible for pushing (retry count < max)
            const eligibleCount = await pushService.countEligibleMessages();
            if (eligibleCount === 0) {
                if (stats.unsynced > 0) {
                    spinner.warn(`Found ${stats.unsynced} unsynced messages, but all have reached max retries. Use --force to retry them.`);
                }
                else {
                    spinner.succeed('All messages are already synced!');
                }
                return;
            }
            if (options.dryRun) {
                spinner.info('Dry run mode - no data will be pushed');
                console.log(`\nWould push ${eligibleCount} messages (out of ${stats.unsynced} total unsynced)`);
                console.log(`Total batches needed: ${Math.ceil(eligibleCount / batchSize)}`);
                return;
            }
            // Main push loop
            let totalPushed = 0;
            let batchNumber = 0;
            const processedMessages = new Set();
            while (true) {
                batchNumber++;
                spinner.start(`Processing batch ${batchNumber}...`);
                // Select batch
                const messageIds = await pushService.selectUnpushedBatch(batchSize);
                if (messageIds.length === 0) {
                    spinner.stop();
                    break;
                }
                spinner.text = `Processing batch ${batchNumber} (${messageIds.length} messages)...`;
                // Track processed messages to avoid double counting
                messageIds.forEach(id => processedMessages.add(id));
                // Load messages with entities
                const messages = await pushService.loadMessagesWithEntities(messageIds);
                // Build request
                const request = pushService.buildPushRequest(messages);
                if (messages.length !== messageIds.length) {
                    console.error(chalk_1.default.red(`  WARNING: Selected ${messageIds.length} messages but loaded ${messages.length}`));
                }
                try {
                    // Execute push
                    const response = await pushService.executePush(request);
                    // Process response
                    await pushService.processPushResponse(response, messageIds);
                    const succeeded = response.results.persisted.count + response.results.deduplicated.count;
                    const failed = response.results.failed.count;
                    totalPushed += succeeded;
                    // Debug check
                    if (succeeded + failed !== messageIds.length) {
                        console.error(chalk_1.default.red(`  ERROR: Count mismatch! Batch had ${messageIds.length} messages, but response shows ${succeeded} succeeded + ${failed} failed = ${succeeded + failed}`));
                    }
                    spinner.succeed(`Batch ${batchNumber}: ` +
                        `${chalk_1.default.green(response.results.persisted.count)} persisted, ` +
                        `${chalk_1.default.blue(response.results.deduplicated.count)} deduplicated, ` +
                        `${chalk_1.default.red(response.results.failed.count)} failed`);
                    if (options.verbose && response.results.failed.count > 0) {
                        console.log('\nFailed messages:');
                        response.results.failed.details.slice(0, 5).forEach(detail => {
                            console.log(`  ${detail.messageId}: ${detail.error}`);
                        });
                        if (response.results.failed.details.length > 5) {
                            console.log(`  ... and ${response.results.failed.details.length - 5} more`);
                        }
                    }
                    // Show processing time
                    if (options.verbose) {
                        console.log(`  Server processing time: ${response.summary.processingTimeMs}ms`);
                        if (response.summary.entitiesCreated) {
                            const created = response.summary.entitiesCreated;
                            if (Object.values(created).some(v => v > 0)) {
                                console.log(`  Entities created: ${JSON.stringify(created)}`);
                            }
                        }
                    }
                }
                catch (error) {
                    spinner.fail(`Batch ${batchNumber} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    // When the entire batch fails, we need to increment retry count to prevent infinite loops
                    await pushService.incrementRetryCountForBatch(messageIds);
                    // For network errors, we might want to stop processing
                    if (error instanceof Error && error.message.includes('Network error')) {
                        console.log(chalk_1.default.yellow('\nNetwork error detected. You can run the command again to retry.'));
                        break;
                    }
                }
            }
            // Final summary
            const finalStats = await pushService.getPushStatistics();
            const failedToPush = processedMessages.size - totalPushed;
            console.log(chalk_1.default.bold('\n📊 Push Summary:'));
            console.log(`  Started with: ${stats.unsynced} messages`);
            console.log(`  Successfully pushed: ${chalk_1.default.green(totalPushed)}`);
            console.log(`  Failed to push: ${chalk_1.default.red(failedToPush)}`);
            console.log(`  Remaining unsynced: ${chalk_1.default.yellow(finalStats.unsynced)}`);
            if (finalStats.unsynced > 0) {
                const eligibleRemaining = await pushService.countEligibleMessages();
                if (eligibleRemaining === 0) {
                    console.log(chalk_1.default.dim('\nAll remaining messages have hit max retries. Use --force to retry them.'));
                }
                else {
                    console.log(chalk_1.default.dim('\nRun the command again to retry failed messages.'));
                }
            }
        }
        catch (error) {
            spinner.fail(`Push failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            if (options.verbose && error instanceof Error) {
                console.error('\nError details:', error.stack);
            }
            process.exit(1);
        }
        finally {
            await prisma.$disconnect();
        }
    });
}
// Keep the old command for backward compatibility
exports.pushCommand = createPushCommand();
//# sourceMappingURL=push.command.js.map