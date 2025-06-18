import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { configManager } from '../../config';
import { db, prisma } from '../../database';
import { PricingService } from '../../services/pricing.service';
import { UserService } from '../../services/user.service';
import { JSONLService } from '../../services/jsonl.service';
import { AggregationService } from '../../services/aggregation.service';
import { IncrementalAggregationService } from '../../services/incremental-aggregation.service';
import { logger } from '../../utils/logger';

export const syncCommand = new Command('sync')
  .description('Sync Claude Code raw data to local database')
  .option('-f, --force', 'Force full resync (clear existing data)')
  .option('-p, --path <path>', 'Override raw data path')
  .action(async (options) => {
    const spinner = ora('Initializing sync process...').start();

    try {
      // Initialize services
      const pricingService = new PricingService();
      const userService = new UserService();
      const jsonlService = new JSONLService(pricingService, userService);

      // Load pricing data
      spinner.text = 'Loading pricing data...';
      await pricingService.loadPricingData();

      // Load user info
      spinner.text = 'Loading user information...';
      await userService.loadUserInfo();
      const userInfo = userService.getUserInfo();
      
      if (userService.isAuthenticated()) {
        const email = userService.getAuthenticatedEmail();
        const realUserId = userService.getAuthenticatedUserId();
        spinner.succeed(`Logged in as: ${email} (User ID: ${realUserId})`);
      } else {
        spinner.succeed(`Running in anonymous mode (Machine: ${userInfo.clientMachineId})`);
      }

      // Handle force flag
      if (options.force) {
        spinner.start('Clearing existing data...');
        await db.clearAllData();
        spinner.succeed('Existing data cleared');
      }

      // Check if we need to use incremental aggregation
      const incrementalAggregationService = new IncrementalAggregationService();
      const useIncremental = await incrementalAggregationService.shouldUseIncremental();
      const needsFullRecalc = !useIncremental || options.force;
      
      // Configure JSONLService based on aggregation mode
      jsonlService.setUseIncrementalAggregation(!needsFullRecalc);
      
      // Get data path
      const dataPath = options.path || configManager.getClaudeCodeConfig().rawDataPath;
      
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

      if (needsFullRecalc) {
        // Full recalculation needed for initial sync or force flag
        spinner.start('Recalculating aggregates...');
        const aggregationService = new AggregationService(prisma);
        await aggregationService.recalculateAllAggregates();
        spinner.succeed('Aggregates recalculated');
      } else {
        console.log(chalk.gray('  Using incremental aggregation (already initialized)'));
        
        // Show incremental changes if any
        const changes = jsonlService.getIncrementalChanges();
        if (changes.newMessages > 0 || changes.newProjects.length > 0 || changes.newSessions.length > 0) {
          console.log('\n' + chalk.bold('🔄 Incremental Changes:'));
          
          if (changes.newProjects.length > 0) {
            console.log(`   ${chalk.green('+')} New projects: ${chalk.cyan(changes.newProjects.join(', '))}`);
          }
          
          if (changes.newSessions.length > 0) {
            console.log(`   ${chalk.green('+')} New sessions: ${chalk.cyan(changes.newSessions.length)} session(s)`);
            if (changes.newSessions.length <= 5) {
              console.log(`     ${chalk.gray(changes.newSessions.map(s => s.substring(0, 8) + '...').join(', '))}`);
            }
          }
          
          if (changes.newMessages > 0) {
            console.log(`   ${chalk.green('+')} New messages: ${chalk.cyan(changes.newMessages)}`);
            console.log(`   ${chalk.green('+')} Cost added: ${chalk.bold.green('$' + changes.totalCostAdded.toFixed(4))}`);
          }
        } else {
          console.log(chalk.gray('  No new data found'));
        }
      }

      // Show results
      console.log('\n' + chalk.bold('📊 Sync Results:'));
      console.log(`   Projects processed: ${chalk.green(result.projectsProcessed)}`);
      console.log(`   Sessions processed: ${chalk.green(result.sessionsProcessed)}`);
      console.log(`   Messages processed: ${chalk.green(result.messagesProcessed)}`);
      
      // Show processing speed
      const messagesPerSecond = result.messagesProcessed > 0 
        ? (result.messagesProcessed / parseFloat(duration)).toFixed(1)
        : '0';
      console.log(`   Processing speed: ${chalk.cyan(messagesPerSecond + ' messages/sec')}`);
      
      if (result.errors.length > 0) {
        console.log(`   Errors: ${chalk.red(result.errors.length)}`);
        if (result.errors.length <= 10) {
          result.errors.forEach(err => console.log(chalk.red(`     - ${err}`)));
        } else {
          console.log(chalk.red(`     (showing first 10 of ${result.errors.length} errors)`));
          result.errors.slice(0, 10).forEach(err => console.log(chalk.red(`     - ${err}`)));
        }
      }

      // Show token usage by model for processed messages
      if (result.tokenUsageByModel.size > 0) {
        console.log('\n' + chalk.bold('🤖 Token Usage by Model (Processed Messages):'));
        
        // Convert Map to array and sort by model name
        const sortedUsage = Array.from(result.tokenUsageByModel.values()).sort((a, b) => 
          a.model.localeCompare(b.model)
        );
        
        for (const usage of sortedUsage) {
          console.log(`\n   ${chalk.cyan(usage.model)}:`);
          console.log(`     Input tokens: ${chalk.green(usage.inputTokens.toLocaleString())}`);
          console.log(`     Output tokens: ${chalk.green(usage.outputTokens.toLocaleString())}`);
          console.log(`     Cache creation tokens: ${chalk.green(usage.cacheCreationTokens.toLocaleString())}`);
          console.log(`     Cache read tokens: ${chalk.green(usage.cacheReadTokens.toLocaleString())}`);
          
          const totalTokens = usage.inputTokens + usage.outputTokens + 
                            usage.cacheCreationTokens + usage.cacheReadTokens;
          console.log(`     Total tokens: ${chalk.yellow(totalTokens.toLocaleString())}`);
        }
      }

      // Show database stats
      const stats = await getDatabaseStats();
      console.log('\n' + chalk.bold('💾 Database Stats:'));
      console.log(`   Total users: ${chalk.cyan(stats.users)}`);
      console.log(`   Total projects: ${chalk.cyan(stats.projects)}`);
      console.log(`   Total sessions: ${chalk.cyan(stats.sessions)}`);
      console.log(`   Total messages: ${chalk.cyan(stats.messages)}`);
      console.log(chalk.gray('   ' + '─'.repeat(30)));
      console.log(`   ${chalk.bold('Total cost:')} ${chalk.bold.green('$' + stats.totalCost.toFixed(4))}`);

      // Show aggregated user stats
      const userStats = await getUserAggregatedStats();
      if (userStats) {
        console.log('\n' + chalk.bold('👤 User Stats:'));
        console.log(`   Projects: ${chalk.cyan(userStats.totalProjects)}`);
        console.log(`   Sessions: ${chalk.cyan(userStats.totalSessions)}`);
        console.log(`   Messages: ${chalk.cyan(userStats.totalMessages)}`);
        console.log(`   Input tokens: ${chalk.cyan(userStats.totalInputTokens.toLocaleString())}`);
        console.log(`   Output tokens: ${chalk.cyan(userStats.totalOutputTokens.toLocaleString())}`);
        console.log(`   Cache creation tokens: ${chalk.cyan(userStats.totalCacheCreationTokens.toLocaleString())}`);
        console.log(`   Cache read tokens: ${chalk.cyan(userStats.totalCacheReadTokens.toLocaleString())}`);
        console.log(chalk.gray('   ' + '─'.repeat(30)));
        console.log(`   ${chalk.bold('Total cost:')} ${chalk.bold.green('$' + Number(userStats.totalCost).toFixed(4))}`);
      }

      // Check for pending sync items
      const pendingSync = await prisma.syncStatus.count({
        where: { syncedAt: null }
      });
      
      if (pendingSync > 0) {
        console.log(`\n${chalk.yellow('⚠️')}  ${pendingSync} records pending upload. Run ${chalk.bold('roiai-cli cc push')} to sync with remote server.`);
      }

    } catch (error) {
      spinner.fail('Sync failed');
      logger.error('Sync error:', error);
      process.exit(1);
    } finally {
      await db.disconnect();
    }
  });

async function getDatabaseStats() {
  const [users, projects, sessions, messages, totalCostResult] = await Promise.all([
    prisma.user.count(),
    prisma.project.count(),
    prisma.session.count(),
    prisma.message.count(),
    prisma.message.aggregate({
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
  const userService = new UserService();
  await userService.loadUserInfo();
  const userId = userService.getUserId();
  
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });
  
  return user;
}