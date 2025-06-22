import { Command } from 'commander';
import chalk from 'chalk';
import { PrismaClient } from '@prisma/client';
import { UserService } from '../../services/user.service';
import { configManager } from '../../config';
import { EndpointResolver } from '../../utils/endpoint-resolver';
import Table from 'cli-table3';

export function createPushStatusCommand() {
  return new Command('push-status')
    .description('Show push synchronization status')
    .option('-v, --verbose', 'Show detailed statistics')
    .action(async (options) => {
      const prisma = new PrismaClient();
      
      try {
        const pushConfig = configManager.getPushConfig();
        
        // Get statistics directly without requiring authentication
        const [total, synced, unsynced, retryDistribution] = await Promise.all([
          prisma.message.count(),
          prisma.messageSyncStatus.count({
            where: { syncedAt: { not: null } },
          }),
          prisma.message.count({
            where: {
              syncStatus: { syncedAt: null },
            },
          }),
          prisma.messageSyncStatus.groupBy({
            by: ["retryCount"],
            where: { syncedAt: null },
            _count: true,
          }),
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
          ['Success Rate', stats.total > 0 ? `${((stats.synced / stats.total) * 100).toFixed(1)}%` : 'N/A']
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
            const color = r.retryCount >= pushConfig.maxRetries ? chalk.red : 
                         r.retryCount >= 3 ? chalk.yellow : 
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
            take: 10
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
            take: 5,
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
              console.log();
            });
          }
        }
        
        // Configuration status
        const userService = new UserService();
        await userService.loadUserInfo();
        const isAuthenticated = userService.isAuthenticated();
        
        console.log(chalk.bold('\n⚙️  Configuration\n'));
        console.log(`Endpoint: ${EndpointResolver.getPushEndpoint()}`);
        console.log(`Authentication: ${isAuthenticated ? chalk.green('Logged in') : chalk.red('Not logged in')}`);
        console.log(`Batch Size: ${pushConfig.batchSize}`);
        console.log(`Max Retries: ${pushConfig.maxRetries}`);
        console.log(`Timeout: ${pushConfig.timeout}ms`);
        
        // Next steps
        if (stats.unsynced > 0) {
          console.log(chalk.bold('\n💡 Next Steps\n'));
          if (!isAuthenticated) {
            console.log(chalk.yellow('1. Login with: roiai login'));
          }
          console.log(`${!isAuthenticated ? '2' : '1'}. Run ${chalk.cyan('roiai cc push')} to sync ${stats.unsynced} messages`);
          
          const needsForce = stats.retryDistribution.some(r => r.retryCount >= pushConfig.maxRetries);
          if (needsForce) {
            console.log(`${!isAuthenticated ? '3' : '2'}. Use ${chalk.cyan('roiai cc push --force')} to retry failed messages`);
          }
        }
        
      } catch (error) {
        console.error(chalk.red('Failed to get push status:'), error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      } finally {
        await prisma.$disconnect();
      }
    });
}

export const pushStatusCommand = createPushStatusCommand();