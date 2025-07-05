import { Command } from 'commander';
import chalk from 'chalk';
import { UserService } from '../../services/user.service';
import { configManager } from '../../config';
import { EndpointResolver } from '../../utils/endpoint-resolver';
import Table from 'cli-table3';
import { DatabaseUtils } from '../../utils/database-utils';
import { QueryHelper } from '../../utils/query-helper';
import { ConfigHelper } from '../../utils/config-helper';
import { FormatterUtils } from '../../utils/formatter-utils';
import { ApiUrlResolver } from '../../utils/api-url-resolver';

export function createPushStatusCommand() {
  const command = new Command('push-status')
    .description('Show push synchronization status')
    .option('-v, --verbose', 'Show detailed statistics')
    .action(async (options) => {
      await DatabaseUtils.withDatabase(async (prisma) => {
        try {
        const pushConfig = configManager.getPushConfig();
        
        // Get statistics directly without requiring authentication
        const [total, synced, unsynced, retryDistribution] = await Promise.all([
          QueryHelper.getMessageCount(prisma),
          prisma.messageSyncStatus.count({
            where: { syncedAt: { not: null } },
          }),
          QueryHelper.getUnsyncedMessageCount(prisma),
          QueryHelper.getRetryDistribution(prisma),
        ]);

        const stats = {
          total,
          synced,
          unsynced,
          retryDistribution: retryDistribution.map((r) => ({
            retryCount: r.retryCount,
            count: r._count,
          })),
        };
        
        console.log(chalk.bold('\n📊 Push Status\n'));
        
        // Summary table
        const summaryTable = new Table({
          head: ['Metric', 'Count'],
          colWidths: [20, 15]
        });
        
        summaryTable.push(
          ['Total Messages', stats.total],
          ['Synced', chalk.green(stats.synced.toString())],
          ['Unsynced', chalk.yellow(stats.unsynced.toString())],
          ['Success Rate', stats.total > 0 ? `${FormatterUtils.formatPercentage(stats.synced, stats.total)}%` : 'N/A']
        );
        
        console.log(summaryTable.toString());
        
        // Retry distribution
        if (stats.retryDistribution.length > 0) {
          console.log(chalk.bold('\n🔄 Retry Distribution\n'));
          
          const retryTable = new Table({
            head: ['Retry Count', 'Messages'],
            colWidths: [15, 15]
          });
          
          stats.retryDistribution.forEach(r => {
            const retryWarningThreshold = ConfigHelper.getPushConfig().retryWarningThreshold;
            const color = r.retryCount >= pushConfig.maxRetries ? chalk.red : 
                         r.retryCount >= retryWarningThreshold ? chalk.yellow : 
                         chalk.white;
            retryTable.push([r.retryCount, color(r.count.toString())]);
          });
          
          console.log(retryTable.toString());
          
          const maxRetriesReached = stats.retryDistribution
            .filter(r => r.retryCount >= pushConfig.maxRetries)
            .reduce((sum, r) => sum + r.count, 0);
            
          if (maxRetriesReached > 0) {
            console.log(chalk.red(`\n⚠️  ${maxRetriesReached} messages have reached max retries (${pushConfig.maxRetries})`));
            console.log(chalk.dim('Run with --force flag to reset retry counts'));
          }
        }
        
        if (options.verbose) {
          // Recent push history
          console.log(chalk.bold('\n📅 Recent Push Activity\n'));
          
          const recentPushes = await prisma.messageSyncStatus.findMany({
            where: {
              syncedAt: { not: null }
            },
            orderBy: {
              syncedAt: 'desc'
            },
            take: ConfigHelper.getPushConfig().recentPushHistoryLimit
          });
          
          if (recentPushes.length > 0) {
            const historyTable = new Table({
              head: ['Message ID', 'Response', 'Synced At'],
              colWidths: [40, 15, 25]
            });
            
            recentPushes.forEach(push => {
              historyTable.push([
                push.messageId.substring(0, 36),
                push.syncResponse || 'unknown',
                push.syncedAt?.toISOString() || 'N/A'
              ]);
            });
            
            console.log(historyTable.toString());
          } else {
            console.log(chalk.dim('No recent push activity'));
          }
          
          // Failed messages sample
          const failedMessages = await prisma.messageSyncStatus.findMany({
            where: {
              syncedAt: null,
              retryCount: { gte: 3 },
              syncResponse: { not: null }
            },
            take: ConfigHelper.getPushConfig().sampleFailedMessagesLimit,
            orderBy: {
              retryCount: 'desc'
            }
          });
          
          if (failedMessages.length > 0) {
            console.log(chalk.bold('\n❌ Sample Failed Messages\n'));
            
            failedMessages.forEach(msg => {
              console.log(`Message: ${msg.messageId}`);
              console.log(`  Retries: ${msg.retryCount}`);
              console.log(`  Error: ${chalk.red(msg.syncResponse || 'Unknown error')}`);
              console.log('');
            });
          }
        }
        
        // Configuration status
        const userService = new UserService();
        let isAuthenticated = false;
        try {
          await userService.loadUserInfo();
          isAuthenticated = userService.isAuthenticated();
        } catch (error) {
          // In test environment, user info might not be available
          if (process.env.NODE_ENV !== 'test') {
            throw error;
          }
        }
        
        console.log(chalk.bold('\n⚙️  Configuration\n'));
        const apiUrl = ApiUrlResolver.getApiUrl(command);
        console.log(`API URL: ${apiUrl}`);
        console.log(`Endpoint: ${EndpointResolver.getPushEndpoint()}`);
        console.log(`Authentication: ${isAuthenticated ? chalk.green('Logged in') : chalk.red('Not logged in')}`);
        console.log(`Batch Size: ${pushConfig.batchSize}`);
        console.log(`Max Retries: ${pushConfig.maxRetries}`);
        console.log(`Timeout: ${pushConfig.timeout}ms`);
        
        // Next steps
        if (stats.unsynced > 0) {
          console.log(chalk.bold('\n💡 Next Steps\n'));
          if (!isAuthenticated) {
            console.log(chalk.yellow('1. Create a free account at ') + chalk.cyan('https://roiAI.fyi'));
            console.log(chalk.yellow('2. Verify your email address'));
            console.log(chalk.yellow('3. Login with: ') + chalk.green('roiai cc login'));
            console.log(`4. Run ${chalk.cyan('roiai cc push')} to sync ${stats.unsynced} messages`);
          } else {
            console.log(`1. Run ${chalk.cyan('roiai cc push')} to sync ${stats.unsynced} messages`);
          }
          
          const needsForce = stats.retryDistribution.some(r => r.retryCount >= pushConfig.maxRetries);
          if (needsForce) {
            console.log(`${!isAuthenticated ? '5' : '2'}. Use ${chalk.cyan('roiai cc push --force')} to retry failed messages`);
          }
        }
        
        } catch (error) {
          console.error(chalk.red('Failed to get push status:'), FormatterUtils.getErrorMessage(error));
          process.exit(1);
        }
      });
    });
  
  return command;
}

export const pushStatusCommand = createPushStatusCommand();