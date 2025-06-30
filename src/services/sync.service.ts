import ora from 'ora';
import chalk from 'chalk';
import { PrismaClient } from '@prisma/client';
import { configManager } from '../config';
import { db } from '../database';
import { PricingService } from './pricing.service';
import { UserService } from './user.service';
import { JSONLService } from './jsonl.service';
import { AggregationService } from './aggregation.service';
import { IncrementalAggregationService } from './incremental-aggregation.service';
import { UserStatsService } from './user-stats.service';
import { logger } from '../utils/logger';

export interface SyncOptions {
  force?: boolean;
  path?: string;
  quiet?: boolean;
}

export interface SyncResult {
  projectsProcessed: number;
  sessionsProcessed: number;
  messagesProcessed: number;
  errors: string[];
  duration: number;
  hasNewData: boolean;
  incrementalCost: number;
}

export class SyncService {
  constructor(
    private prisma: PrismaClient,
    private userService: UserService
  ) {}

  async sync(options: SyncOptions = {}): Promise<SyncResult> {
    const spinner = options.quiet ? null : ora('Initializing sync process...').start();
    const startTime = Date.now();

    try {
      // Initialize services
      const pricingService = new PricingService();
      const jsonlService = new JSONLService(pricingService, this.userService);

      // Load pricing data
      if (spinner) spinner.text = 'Loading pricing data...';
      await pricingService.loadPricingData();

      // Load user info silently
      await this.userService.loadUserInfo();

      // Get initial cost before sync
      const userStatsServicePreSync = new UserStatsService(this.prisma, this.userService);
      const userStatsBeforeSync = await userStatsServicePreSync.getAggregatedStats();
      const costBeforeSync = userStatsBeforeSync ? Number(userStatsBeforeSync.totalCost) : 0;

      // Handle force flag
      if (options.force) {
        if (spinner) spinner.start('Clearing existing data...');
        await db.clearAllData();
        if (spinner) spinner.succeed('Existing data cleared');
      }

      // Check if we need to use incremental aggregation
      const incrementalAggregationService = new IncrementalAggregationService();
      const useIncremental = await incrementalAggregationService.shouldUseIncremental();
      const needsFullRecalc = !useIncremental || options.force;
      
      // Get data path
      const dataPath = options.path || configManager.getClaudeCodeConfig().rawDataPath;
      
      // Inform user about sync speed (only if not quiet)
      if (!options.quiet && needsFullRecalc) {
        const messages = configManager.get().messages?.sync || {};
        if (options.force) {
          console.log(chalk.blue(messages.forceSync || 'ℹ️  Force sync requested. This will take longer as all data will be reprocessed.'));
        } else {
          console.log(chalk.blue(messages.firstTime || 'ℹ️  First time sync detected. This initial sync will take longer, but future syncs will be blazingly fast!'));
        }
        console.log(chalk.gray('   Only new or modified files will be processed in subsequent syncs.\n'));
      }
      
      // Start processing
      if (spinner) spinner.start('Processing Claude Code data...');
      
      // Set up progress tracking (only if not quiet)
      if (!options.quiet && spinner) {
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
      }
      
      const result = await jsonlService.processDirectory(dataPath);
      
      const duration = ((Date.now() - startTime) / 1000);
      if (spinner) spinner.succeed(`Sync completed in ${duration.toFixed(2)}s`);

      // Check if any new data was processed
      const changes = jsonlService.getIncrementalChanges();
      const hasNewData = changes.newMessages > 0 || changes.newProjects.length > 0 || changes.newSessions.length > 0;
      
      if (needsFullRecalc) {
        // Full recalculation needed for initial sync or force flag
        if (spinner) spinner.start('Recalculating aggregates...');
        const aggregationService = new AggregationService(this.prisma);
        await aggregationService.recalculateAllAggregates();
        if (spinner) spinner.succeed('Aggregates recalculated');
      } else if (hasNewData) {
        // Recalculate aggregates for incremental changes
        if (spinner) spinner.start('Updating aggregates...');
        const aggregationService = new AggregationService(this.prisma);
        await aggregationService.recalculateAllAggregates();
        if (spinner) spinner.succeed('Aggregates updated');
      }

      // Calculate incremental cost
      const userStatsServicePostSync = new UserStatsService(this.prisma, this.userService);
      const userStatsAfterSync = await userStatsServicePostSync.getAggregatedStats();
      const costAfterSync = userStatsAfterSync ? Number(userStatsAfterSync.totalCost) : 0;
      const incrementalCost = costAfterSync - costBeforeSync;

      // Show detailed results only if not quiet
      if (!options.quiet) {
        this.showSyncResults(result, changes, hasNewData, incrementalCost, duration);
      }

      return {
        projectsProcessed: result.projectsProcessed,
        sessionsProcessed: result.sessionsProcessed,
        messagesProcessed: result.messagesProcessed,
        errors: result.errors,
        duration,
        hasNewData,
        incrementalCost
      };

    } catch (error) {
      if (spinner) spinner.fail('Sync failed');
      logger.error('Sync error:', error);
      throw error;
    }
  }

  private async showSyncResults(
    result: any,
    changes: any,
    hasNewData: boolean,
    incrementalCost: number,
    duration: number
  ): Promise<void> {
    // Show incremental changes
    if (hasNewData && (changes.newMessages > 0 || changes.newProjects.length > 0 || changes.newSessions.length > 0)) {
      console.log('\n' + chalk.bold('🔄 Incremental Changes:'));
      
      if (changes.newProjects.length > 0) {
        console.log(`   ${chalk.green('+')} New projects: ${chalk.cyan(changes.newProjects.join(', '))}`);
      }
      
      if (changes.newSessions.length > 0) {
        console.log(`   ${chalk.green('+')} New sessions: ${chalk.cyan(changes.newSessions.length)} session(s)`);
        if (changes.newSessions.length <= 5) {
          console.log(`     ${chalk.gray(changes.newSessions.map((s: string) => s.substring(0, 8) + '...').join(', '))}`);
        }
      }
      
      if (changes.newMessages > 0) {
        console.log(`   ${chalk.green('+')} New messages: ${chalk.cyan(changes.newMessages)}`);
      }
    }

    // Show results
    console.log('\n' + chalk.bold('📊 Sync Results:'));
    console.log(`   Projects processed: ${chalk.green(result.projectsProcessed)}`);
    console.log(`   Sessions processed: ${chalk.green(result.sessionsProcessed)}`);
    console.log(`   Messages processed: ${chalk.green(result.messagesProcessed)}`);
    
    // Show processing speed
    const messagesPerSecond = result.messagesProcessed > 0 
      ? (result.messagesProcessed / duration).toFixed(1)
      : '0';
    console.log(`   Processing speed: ${chalk.cyan(messagesPerSecond + ' messages/sec')}`);
    
    if (result.errors.length > 0) {
      console.log(`   Errors: ${chalk.red(result.errors.length)}`);
      if (result.errors.length <= 10) {
        result.errors.forEach((err: string) => console.log(chalk.red(`     - ${err}`)));
      } else {
        console.log(chalk.red(`     (showing first 10 of ${result.errors.length} errors)`));
        result.errors.slice(0, 10).forEach((err: string) => console.log(chalk.red(`     - ${err}`)));
      }
    }

    // Show aggregated user stats
    const userStatsService = new UserStatsService(this.prisma, this.userService);
    const userStats = await userStatsService.getAggregatedStats();
    if (userStats) {
      console.log('\n' + chalk.bold('👤 User Stats:'));
      console.log(`   📁 Projects: ${chalk.cyan(userStats.totalProjects)}`);
      console.log(`   💬 Sessions: ${chalk.cyan(userStats.totalSessions)}`);
      console.log(`   📝 Messages: ${chalk.cyan(userStats.totalMessages)}`);
      
      // Show message breakdown by writer
      const messageBreakdown = await userStatsService.getMessageBreakdown();
      if (messageBreakdown) {
        console.log(`\n   ${chalk.bold('💬 Message Breakdown:')}`);
        console.log(`     👤 Human: ${chalk.green(messageBreakdown.human)} (${messageBreakdown.humanPercentage}%)`);
        console.log(`     ⚙️  Agent: ${chalk.yellow(messageBreakdown.agent)} (${messageBreakdown.agentPercentage}%)`);
        console.log(`     🤖 Assistant: ${chalk.blue(messageBreakdown.assistant)} (${messageBreakdown.assistantPercentage}%)`);
        console.log(`     📊 Total: ${chalk.cyan(messageBreakdown.total)} messages`);
      }
      
      console.log(`\n   🔤 Input tokens: ${chalk.cyan(userStats.totalInputTokens.toLocaleString())}`);
      console.log(`   💭 Output tokens: ${chalk.cyan(userStats.totalOutputTokens.toLocaleString())}`);
      console.log(`   💾 Cache creation tokens: ${chalk.cyan(userStats.totalCacheCreationTokens.toLocaleString())}`);
      console.log(`   ⚡ Cache read tokens: ${chalk.cyan(userStats.totalCacheReadTokens.toLocaleString())}`);

      // Show detailed user stats by model before total cost
      const userStatsByModel = await userStatsService.getStatsByModel();
      if (userStatsByModel.length > 0) {
        console.log('\n' + chalk.bold('   🤖 Usage & Cost by Model:'));
        
        for (const modelStats of userStatsByModel) {
          console.log(`\n      ${chalk.magenta('●')} ${chalk.cyan.bold(modelStats.model)}:`);
          console.log(`        📊 Messages: ${chalk.white(modelStats.messageCount.toLocaleString())}`);
          console.log(`        📥 Input: ${chalk.green(modelStats.inputTokens.toLocaleString())} tokens`);
          console.log(`        📤 Output: ${chalk.green(modelStats.outputTokens.toLocaleString())} tokens`);
          
          if (modelStats.cacheCreationTokens > 0) {
            console.log(`        💾 Cache write: ${chalk.blue(modelStats.cacheCreationTokens.toLocaleString())} tokens`);
          }
          if (modelStats.cacheReadTokens > 0) {
            console.log(`        ⚡ Cache read: ${chalk.blue(modelStats.cacheReadTokens.toLocaleString())} tokens`);
          }
          
          const totalTokens = modelStats.inputTokens + modelStats.outputTokens + 
                            modelStats.cacheCreationTokens + modelStats.cacheReadTokens;
          console.log(`        🎯 Total: ${chalk.yellow.bold(totalTokens.toLocaleString())} tokens`);
          console.log(`        💰 Cost: ${chalk.bold.green('$' + modelStats.cost.toFixed(4))}`);
        }
      }

      // Show total cost as the bottom line
      const fullConfig = configManager.get();
      const sectionSeparator = fullConfig.display?.sectionSeparator || '═';
      const sectionSeparatorWidth = fullConfig.display?.sectionSeparatorWidth || 50;
      console.log('\n' + chalk.gray(sectionSeparator.repeat(sectionSeparatorWidth)));
      
      // Show incremental cost change
      if (incrementalCost > 0) {
        console.log(`${chalk.bold('📈 Cost Added:')} ${chalk.bold.yellow('+$' + incrementalCost.toFixed(4))}`);
      }
      
      console.log(`${chalk.bold('💵 Total Cost:')} ${chalk.bold.green('$' + Number(userStats.totalCost).toFixed(4))}`);
    }

    // Check for pending sync items
    const pendingSync = await this.prisma.messageSyncStatus.count({
      where: { syncedAt: null }
    });
    
    if (pendingSync > 0) {
      console.log(`\n${chalk.yellow('⚠️')}  ${pendingSync} records pending upload. Run ${chalk.bold('roiai cc push')} to sync with remote server.`);
    }
  }
}