import { Command } from 'commander';
import chalk from 'chalk';
import { UserService } from '../../services/user.service';
import { configManager } from '../../config';
import { EndpointResolver } from '../../utils/endpoint-resolver';
import Table from 'cli-table3';
import { logger } from '../../utils/logger';
import { DatabaseManager } from '../../utils/database-manager';
import { QueryHelper } from '../../utils/query-helper';
import { ConfigHelper } from '../../utils/config-helper';
import { FormatterUtils } from '../../utils/formatter-utils';

export function createPushStatusCommand() {
  return new Command('push-status')
    .description('Show push synchronization status')
    .option('-v, --verbose', 'Show detailed statistics')
    .action(async (options) => {
      await DatabaseManager.withDatabase(async (prisma) => {
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
        
        logger.info(chalk.bold('\n📊 Push Status\n'));
        
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
        
        logger.info(summaryTable.toString());
        
        // Retry distribution
        if (stats.retryDistribution.length > 0) {
          logger.info(chalk.bold('\n🔄 Retry Distribution\n'));
          
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
          
          logger.info(retryTable.toString());
          
          const maxRetriesReached = stats.retryDistribution
            .filter(r => r.retryCount >= pushConfig.maxRetries)
            .reduce((sum, r) => sum + r.count, 0);
            
          if (maxRetriesReached > 0) {
            logger.info(chalk.red(`\n⚠️  ${maxRetriesReached} messages have reached max retries (${pushConfig.maxRetries})`));
            logger.info(chalk.dim('Run with --force flag to reset retry counts'));
          }
        }
        
        if (options.verbose) {
          // Recent push history
          logger.info(chalk.bold('\n📅 Recent Push Activity\n'));
          
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
            
            logger.info(historyTable.toString());
          } else {
            logger.info(chalk.dim('No recent push activity'));
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
            logger.info(chalk.bold('\n❌ Sample Failed Messages\n'));
            
            failedMessages.forEach(msg => {
              logger.info(`Message: ${msg.messageId}`);
              logger.info(`  Retries: ${msg.retryCount}`);
              logger.info(`  Error: ${chalk.red(msg.syncResponse || 'Unknown error')}`);
              logger.info('');
            });
          }
        }
        
        // Configuration status
        const userService = new UserService();
        await userService.loadUserInfo();
        const isAuthenticated = userService.isAuthenticated();
        
        logger.info(chalk.bold('\n⚙️  Configuration\n'));
        logger.info(`Endpoint: ${EndpointResolver.getPushEndpoint()}`);
        logger.info(`Authentication: ${isAuthenticated ? chalk.green('Logged in') : chalk.red('Not logged in')}`);
        logger.info(`Batch Size: ${pushConfig.batchSize}`);
        logger.info(`Max Retries: ${pushConfig.maxRetries}`);
        logger.info(`Timeout: ${pushConfig.timeout}ms`);
        
        // Next steps
        if (stats.unsynced > 0) {
          logger.info(chalk.bold('\n💡 Next Steps\n'));
          if (!isAuthenticated) {
            logger.info(chalk.yellow('1. Login with: roiai login'));
          }
          logger.info(`${!isAuthenticated ? '2' : '1'}. Run ${chalk.cyan('roiai cc push')} to sync ${stats.unsynced} messages`);
          
          const needsForce = stats.retryDistribution.some(r => r.retryCount >= pushConfig.maxRetries);
          if (needsForce) {
            logger.info(`${!isAuthenticated ? '3' : '2'}. Use ${chalk.cyan('roiai cc push --force')} to retry failed messages`);
          }
        }
        
        } catch (error) {
          logger.error(chalk.red('Failed to get push status:'), FormatterUtils.getErrorMessage(error));
          process.exit(1);
        }
      });
    });
}

export const pushStatusCommand = createPushStatusCommand();