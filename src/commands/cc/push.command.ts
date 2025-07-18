import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { PushService } from '../../services/push.service';
import { UserService } from '../../services/user.service';
import { SyncService } from '../../services/sync.service';
import { configManager } from '../../config';
import { PushOptions } from '../../models/push.types';
import { AuthValidator } from '../../utils/auth-validator';
import { DatabaseUtils } from '../../utils/database-utils';
import { ConfigHelper } from '../../utils/config-helper';
import { ProgressDisplay } from '../../utils/progress-display';
import { SpinnerErrorHandler } from '../../utils/spinner-error-handler';
import { FormatterUtils } from '../../utils/formatter-utils';
import { ErrorFormatter } from '../../utils/error-formatter';
import { ApiUrlResolver } from '../../utils/api-url-resolver';

export function createPushCommand() {
  const command = new Command('push')
    .description('Upload analytics to roiAI cloud (automatically syncs first)')
    .option('-b, --batch-size <number>', 'Messages per batch (default: 1000)', parseInt)
    .option('-d, --dry-run', 'Preview what would be pushed without uploading')
    .option('-f, --force', 'Reset retry count for failed records')
    .option('-v, --verbose', 'Show detailed progress information')
    .option('-s, --skip-sync', 'Skip automatic sync, use existing local data')
    .action(async function(this: Command, options: PushOptions) {
      const spinner = ora('Initializing push...').start();
      
      await DatabaseUtils.withDatabase(async (prisma) => {
        try {
        // Initialize user service and check authentication
        const userService = new UserService();
        await AuthValidator.validateAndGetToken(userService, spinner);
        
        // Run sync first unless skipped
        if (!options.skipSync) {
          spinner.text = 'Running sync before push...';
          const syncService = new SyncService(prisma, userService);
          
          try {
            const syncResult = await syncService.sync({ quiet: true });
            
            if (syncResult.hasNewData) {
              spinner.succeed(
                `Sync completed: ${syncResult.messagesProcessed} messages processed` +
                (syncResult.incrementalCost > 0 ? ` (+${FormatterUtils.formatCurrency(syncResult.incrementalCost)})` : '')
              );
            } else {
              spinner.succeed('Sync completed: No new data found');
            }
          } catch (syncError) {
            spinner.fail('Sync failed');
            console.error(chalk.red('Error during sync:'), syncError instanceof Error ? syncError.message : 'Unknown error');
            console.log(chalk.yellow('\nContinuing with push using existing data...'));
          }
          
          // Restart spinner for push
          spinner.start('Initializing push...');
        }
        
        const pushConfig = configManager.getPushConfig();
        const apiUrl = ApiUrlResolver.getApiUrl(this);

        const pushService = new PushService(prisma, pushConfig, userService, apiUrl);
        
        // Check authentication before proceeding
        spinner.start('Verifying authentication...');
        const authCheck = await pushService.checkAuthentication();
        
        if (!authCheck.valid) {
          spinner.fail('Authentication check failed');
          
          console.error(chalk.red('\n❌ Authentication Error Details:'));
          console.error(chalk.white(authCheck.error || 'Unknown error'));
          
          // Add helpful next steps based on error type
          if (authCheck.error?.includes('Network error') || 
              authCheck.error?.includes('Cannot connect') ||
              authCheck.error?.includes('Cannot find')) {
            console.log(chalk.yellow('\n💡 Troubleshooting tips:'));
            console.log(chalk.gray('  1. Check your internet connection'));
            console.log(chalk.gray('  2. Verify the API URL in your configuration'));
            console.log(chalk.gray('  3. Try accessing the server directly in a browser'));
            console.log(chalk.gray('  4. Check if you\'re behind a corporate firewall/proxy'));
          } else if (authCheck.error?.includes('Invalid') || 
                     authCheck.error?.includes('expired')) {
            console.log(chalk.yellow('\n🔑 Your authentication has expired or is invalid.'));
            console.log(chalk.yellow('\nTo fix this issue:'));
            console.log(chalk.white('  1. Run: ') + chalk.green('roiai cc login'));
            console.log(chalk.white('  2. Enter your credentials'));
            console.log(chalk.white('  3. Try the push command again'));
            console.log(chalk.dim('\nIf you don\'t have an account yet, create one at ') + chalk.cyan('https://roiAI.fyi'));
          }
          
          process.exit(1);
        }
        
        spinner.succeed(`Authenticated as ${authCheck.user?.email || 'user'}`);
        if (options.verbose && authCheck.machine) {
          console.log(chalk.dim(`  Machine: ${authCheck.machine.name || authCheck.machine.id}`));
        }
        
        // Use config batch size if not specified in command line
        const batchSize = options.batchSize || pushConfig.batchSize;
        
        // Get initial statistics
        spinner.start('Analyzing push queue...');
        let stats = await pushService.getPushStatistics();
        
        if (stats.unsynced === 0) {
          spinner.succeed('All messages are already synced!');
          return;
        }

        // Display initial statistics in a compact format
        spinner.succeed(
          `Found ${chalk.bold.yellow(stats.unsynced.toLocaleString())} messages to push ` +
          `(${chalk.green(stats.synced.toLocaleString())} already synced, ` +
          `${chalk.bold(stats.total.toLocaleString())} total)`
        );
        
        if (stats.retryDistribution.length > 0 && options.verbose) {
          console.log(chalk.dim('\nRetry distribution:'));
          stats.retryDistribution.forEach(r => {
            const icon = r.retryCount === 0 ? '🆕' : r.retryCount >= pushConfig.maxRetries ? '⚠️' : '🔄';
            console.log(`  ${icon} ${r.retryCount} ${r.retryCount === 1 ? 'retry' : 'retries'}: ${chalk.bold(r.count.toLocaleString())} messages`);
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
          } else {
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
        let totalFailed = 0;
        let batchNumber = 0;
        const processedMessages = new Set<string>();
        const totalBatches = Math.ceil(eligibleCount / batchSize);

        console.log(''); // Add empty line for progress display
        spinner.start('Starting push...');

        while (true) {
          batchNumber++;
          
          // Periodically check authentication during long push sessions
          const authRecheckInterval = pushConfig.authRecheckInterval || 10;
          if (batchNumber > 1 && batchNumber % authRecheckInterval === 1) {
            const authRecheck = await pushService.checkAuthentication();
            
            if (!authRecheck.valid) {
              const error = new Error(authRecheck.error || 'Authentication lost during push session');
              
              if (authRecheck.error?.includes('Network error') || 
                  authRecheck.error?.includes('Cannot connect')) {
                SpinnerErrorHandler.handleNetworkError(spinner, error);
                process.exit(1);
              } else {
                SpinnerErrorHandler.handleAuthError(spinner, error);
              }
            }
          }
          
          // Calculate progress
          const processedCount = processedMessages.size;
          
          spinner.text = ProgressDisplay.formatBatchProgress(
            batchNumber,
            totalBatches,
            processedCount,
            eligibleCount,
            { pushed: totalPushed, failed: totalFailed }
          );
          
          // Select batch
          const messages = await pushService.selectUnpushedBatchWithEntities(batchSize);
          
          if (messages.length === 0) {
            // Final progress update before stopping
            spinner.succeed(ProgressDisplay.formatBatchProgress(
              totalBatches,
              totalBatches,
              eligibleCount,
              eligibleCount,
              { pushed: totalPushed, failed: totalFailed }
            ));
            break;
          }

          const messageIds = messages.map(msg => msg.messageId);
          
          // Track processed messages to avoid double counting
          messageIds.forEach(id => processedMessages.add(id));

          // Build request
          const request = pushService.buildPushRequest(messages);

          try {
            // Execute push
            const response = await pushService.executePush(request);
            
            // Process response
            await pushService.processPushResponse(response);
            
            const persisted = response.results.persisted.count;
            const deduplicated = response.results.deduplicated.count;
            const failed = response.results.failed.count;
            const succeeded = persisted + deduplicated;
            
            totalPushed += succeeded;
            totalFailed += failed;
            
            // Don't print success line, progress will be updated in next iteration
            
            if (options.verbose) {
              console.log(chalk.dim(`  Sync ID: ${response.syncId}`));
              console.log(chalk.dim(`  Processing time: ${response.summary.processingTimeMs}ms`));
              
              // Show failed message details if any with helpful context
              if (response.results.failed.details.length > 0) {
                const maxFailedShown = ConfigHelper.getDisplay().maxFailedMessagesShown;
                console.error(chalk.red('\n  Failed messages:'));
                for (const failure of response.results.failed.details.slice(0, maxFailedShown)) {
                  console.error(`    ${failure.messageId}: ${failure.code} - ${failure.error}`);
                  
                  // Add helpful tips using error formatter
                  const tip = ErrorFormatter.getErrorTip(failure.code);
                  if (tip) {
                    console.error(chalk.dim(`      → ${tip}`));
                  }
                }
                if (response.results.failed.details.length > maxFailedShown) {
                  console.error(`    ... and ${response.results.failed.details.length - maxFailedShown} more`);
                }
              }
            }

          } catch (error) {
            totalFailed += messages.length;
            
            // Update progress for error message
            const errorProcessedCount = processedMessages.size;
            const errorProgressPercent = FormatterUtils.calculatePercentage(errorProcessedCount, eligibleCount);
            const errorProgressBar = ProgressDisplay.generateProgressBar(errorProgressPercent);
            
            const errorMessage = SpinnerErrorHandler.getErrorMessage(error);
            // Update spinner text to show error but continue
            if (!options.verbose) {
              spinner.text = `[${errorProgressBar}] ${errorProgressPercent}% - Batch ${batchNumber}/${totalBatches}: ${chalk.red('failed')} - ${errorMessage}`;
            } else {
              spinner.fail(`[${errorProgressBar}] ${errorProgressPercent}% - Batch ${batchNumber}/${totalBatches} failed: ${errorMessage}`);
            }
            
            // Check if this is an authentication error
            if (SpinnerErrorHandler.isAuthError(error)) {
              SpinnerErrorHandler.handleAuthError(spinner, error);
            }
            
            // When the entire batch fails, we need to increment retry count to prevent infinite loops
            await pushService.incrementRetryCountForBatch(messageIds);
            
            // For network errors, we might want to stop processing
            if (SpinnerErrorHandler.isNetworkError(error)) {
              console.log(chalk.yellow('\nNetwork error detected. You can run the command again to retry.'));
              break;
            }
          }
        }

        // Final summary in a compact format
        const finalStats = await pushService.getPushStatistics();
        
        console.log(
          `\n${chalk.bold('Summary:')} ` +
          `${chalk.green(totalPushed.toLocaleString())} pushed, ` +
          `${chalk.red(totalFailed.toLocaleString())} failed, ` +
          `${chalk.yellow(finalStats.unsynced.toLocaleString())} remaining`
        );
        
        if (finalStats.unsynced > 0) {
          const eligibleRemaining = await pushService.countEligibleMessages();
          if (eligibleRemaining === 0) {
            console.log(chalk.dim('\nAll remaining messages have hit max retries. Use --force to retry them.'));
          } else {
            console.log(chalk.dim('\nRun the command again to retry failed messages.'));
          }
        }

        } catch (error) {
          spinner.fail(`Push failed: ${SpinnerErrorHandler.getErrorMessage(error)}`);
          if (options.verbose && error instanceof Error) {
            console.error(chalk.dim('\nError details:'), error.stack);
          }
          process.exit(1);
        }
      });
    });
  
  return command;
}

// Keep the old command for backward compatibility
export const pushCommand = createPushCommand();