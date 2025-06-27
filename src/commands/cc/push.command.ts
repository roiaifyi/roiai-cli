import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { PrismaClient } from '@prisma/client';
import { PushService } from '../../services/push.service';
import { UserService } from '../../services/user.service';
import { configManager } from '../../config';
import { PushOptions } from '../../models/push.types';

export function createPushCommand() {
  return new Command('push')
    .description('Push local usage data to remote server')
    .option('-b, --batch-size <number>', 'Messages per batch', parseInt)
    .option('-d, --dry-run', 'Preview what would be pushed without actually pushing')
    .option('-f, --force', 'Reset retry count for failed records and retry')
    .option('-v, --verbose', 'Show detailed progress')
    .action(async (options: PushOptions) => {
      const spinner = ora('Initializing push...').start();
      const prisma = new PrismaClient();
      
      try {
        // Initialize user service and check authentication
        const userService = new UserService();
        await userService.loadUserInfo();
        
        if (!userService.isAuthenticated()) {
          spinner.fail('Please login first using \'roiai-cli cc login\' to push data');
          process.exit(1);
        }
        
        const apiToken = userService.getApiToken();
        if (!apiToken) {
          spinner.fail('No API token found. Please login again.');
          process.exit(1);
        }
        
        const pushConfig = configManager.getPushConfig();

        const pushService = new PushService(prisma, pushConfig, userService);
        
        // Check authentication before proceeding
        spinner.start('Verifying authentication...');
        const authCheck = await pushService.checkAuthentication();
        
        if (!authCheck.valid) {
          spinner.fail('Authentication check failed');
          
          console.log(chalk.red('\n❌ Authentication Error Details:'));
          console.log(chalk.white(authCheck.error || 'Unknown error'));
          
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
            console.log(chalk.yellow('\n🔑 To fix this issue:'));
            console.log(chalk.green('  roiai-cli cc login'));
          }
          
          process.exit(1);
        }
        
        spinner.succeed(`Authenticated as ${authCheck.user?.email || 'user'}`);
        if (options.verbose && authCheck.machine) {
          console.log(`  Machine: ${authCheck.machine.name || authCheck.machine.id}`);
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
          
          // Periodically check authentication during long push sessions (every 10 batches)
          if (batchNumber > 1 && batchNumber % 10 === 1) {
            const authRecheck = await pushService.checkAuthentication();
            
            if (!authRecheck.valid) {
              spinner.fail('Authentication lost during push session');
              
              console.log(chalk.red('\n🚫 Authentication Error:'));
              console.log(chalk.white(authRecheck.error || 'Unknown error'));
              
              if (authRecheck.error?.includes('Network error') || 
                  authRecheck.error?.includes('Cannot connect')) {
                console.log(chalk.yellow('\n💡 Connection lost. Please check your network and try again.'));
              } else {
                console.log(chalk.yellow('\n🔑 Your API token may have expired. Please run \'roiai-cli cc login\' to refresh your credentials.'));
              }
              
              process.exit(1);
            }
          }
          
          // Calculate progress
          const processedCount = processedMessages.size;
          const progressPercent = eligibleCount > 0 ? Math.round((processedCount / eligibleCount) * 100) : 0;
          const progressBar = '█'.repeat(Math.floor(progressPercent / 2)) + '░'.repeat(50 - Math.floor(progressPercent / 2));
          
          spinner.text = `[${progressBar}] ${progressPercent}% - Batch ${batchNumber}/${totalBatches} (${totalPushed} pushed, ${totalFailed} failed)`;
          
          // Select batch
          const messages = await pushService.selectUnpushedBatchWithEntities(batchSize);
          
          if (messages.length === 0) {
            // Final progress update before stopping
            const finalProgressBar = '█'.repeat(50);
            spinner.succeed(`[${finalProgressBar}] 100% - Completed all ${totalBatches} batches`);
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
              console.log(`  Sync ID: ${response.syncId}`);
              console.log(`  Processing time: ${response.summary.processingTimeMs}ms`);
              
              // Show failed message details if any
              if (response.results.failed.details.length > 0) {
                console.log(chalk.red('\n  Failed messages:'));
                for (const failure of response.results.failed.details.slice(0, 5)) {
                  console.log(`    ${failure.messageId}: ${failure.code} - ${failure.error}`);
                }
                if (response.results.failed.details.length > 5) {
                  console.log(`    ... and ${response.results.failed.details.length - 5} more`);
                }
              }
            }

          } catch (error) {
            totalFailed += messages.length;
            
            // Update progress for error message
            const errorProcessedCount = processedMessages.size;
            const errorProgressPercent = eligibleCount > 0 ? Math.round((errorProcessedCount / eligibleCount) * 100) : 0;
            const errorProgressBar = '█'.repeat(Math.floor(errorProgressPercent / 2)) + '░'.repeat(50 - Math.floor(errorProgressPercent / 2));
            
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            // Update spinner text to show error but continue
            if (!options.verbose) {
              spinner.text = `[${errorProgressBar}] ${errorProgressPercent}% - Batch ${batchNumber}/${totalBatches}: ${chalk.red('failed')} - ${errorMessage}`;
            } else {
              spinner.fail(`[${errorProgressBar}] ${errorProgressPercent}% - Batch ${batchNumber}/${totalBatches} failed: ${errorMessage}`);
            }
            
            // Check if this is an authentication error
            if (error instanceof Error && (
              error.message.includes('401') || 
              error.message.includes('Unauthorized') ||
              error.message.includes('Invalid API key') ||
              error.message.includes('Authentication failed')
            )) {
              console.log(chalk.red('\n🚫 Authentication failed during push!'));
              console.log(chalk.yellow('Your API token may have expired or been revoked.'));
              console.log(chalk.yellow('Please run \'roiai-cli cc login\' to refresh your credentials and try again.'));
              process.exit(1);
            }
            
            // When the entire batch fails, we need to increment retry count to prevent infinite loops
            await pushService.incrementRetryCountForBatch(messageIds);
            
            // For network errors, we might want to stop processing
            if (error instanceof Error && error.message.includes('Network error')) {
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
        spinner.fail(`Push failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        if (options.verbose && error instanceof Error) {
          console.error('\nError details:', error.stack);
        }
        process.exit(1);
      } finally {
        await prisma.$disconnect();
      }
    });
}

// Keep the old command for backward compatibility
export const pushCommand = createPushCommand();