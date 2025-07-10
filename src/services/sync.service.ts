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
import { ConfigHelper } from '../utils/config-helper';
import { DisplayUtils } from '../utils/display-utils';
import { FormatterUtils } from '../utils/formatter-utils';

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
      // Ensure database is initialized
      await db.ensureInitialized();
      
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
      let dataPath = options.path || configManager.getClaudeCodeConfig().rawDataPath;
      
      // Handle tilde expansion
      const os = await import('os');
      if (dataPath.startsWith('~/')) {
        dataPath = dataPath.replace(/^~/, os.homedir());
      }
      
      // Check if Claude raw data path exists
      const fs = await import('fs');
      if (!fs.existsSync(dataPath)) {
        throw new Error(`Claude Code data directory not found: ${dataPath}\n\nPlease ensure Claude Code Desktop is installed and has been used at least once.`);
      }
      
      // Inform user about sync speed (only if not quiet)
      if (!options.quiet && needsFullRecalc) {
        const messages = ConfigHelper.getSyncMessages();
        if (options.force) {
          logger.info(chalk.blue(messages.forceSync));
        } else {
          logger.info(chalk.blue(messages.firstTime));
        }
        logger.info(chalk.gray('   Only new or modified files will be processed in subsequent syncs.\n'));
      }
      
      // Start processing
      if (spinner) spinner.start('Processing Claude Code data...');
      
      // Set up progress tracking (only if not quiet)
      if (!options.quiet && spinner) {
        let lastProgressUpdate = Date.now();
        jsonlService.setProgressCallback((progress) => {
          const now = Date.now();
          // Update based on configured interval to avoid too frequent updates
          if (now - lastProgressUpdate > ConfigHelper.getDisplay().progressUpdateInterval) {
            const projectProgress = FormatterUtils.calculatePercentage(progress.processedProjects, progress.totalProjects);
            const fileProgress = FormatterUtils.calculatePercentage(progress.processedFiles, progress.totalFiles);
            
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

      // Check for pending sync items before showing results
      let pendingSync = 0;
      try {
        pendingSync = await this.prisma.messageSyncStatus.count({
          where: { syncedAt: null }
        });
      } catch (error) {
        // Silently ignore if we can't count pending items
        logger.debug('Failed to count pending sync items:', error);
      }

      // Show detailed results only if not quiet
      if (!options.quiet) {
        await this.showSyncResults(result, changes, hasNewData, incrementalCost, duration, pendingSync);
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
    duration: number,
    pendingSync: number
  ): Promise<void> {
    // Show incremental changes
    if (hasNewData && (changes.newMessages > 0 || changes.newProjects.length > 0 || changes.newSessions.length > 0)) {
      logger.info('\n' + chalk.bold('🔄 Incremental Changes:'));
      
      if (changes.newProjects.length > 0) {
        logger.info(`   ${chalk.green('+')} New projects: ${chalk.cyan(changes.newProjects.join(', '))}`);
      }
      
      if (changes.newSessions.length > 0) {
        logger.info(`   ${chalk.green('+')} New sessions: ${chalk.cyan(changes.newSessions.length)} session(s)`);
        const displayConfig = configManager.get().display;
        const maxSessions = displayConfig?.maxSessionsShown || 5;
        const sessionIdLength = displayConfig?.sessionIdLength || 8;
        if (changes.newSessions.length <= maxSessions) {
          logger.info(`     ${chalk.gray(changes.newSessions.map((s: string) => s.substring(0, sessionIdLength) + '...').join(', '))}`);
        }
      }
      
      if (changes.newMessages > 0) {
        logger.info(`   ${chalk.green('+')} New messages: ${chalk.cyan(changes.newMessages)}`);
      }
    }

    // Show results
    DisplayUtils.sectionHeader('Sync Results', '📊');
    
    const syncStats = {
      'Projects processed': result.projectsProcessed,
      'Sessions processed': result.sessionsProcessed,
      'Messages processed': result.messagesProcessed,
      'Processing speed': result.messagesProcessed > 0 
        ? `${(result.messagesProcessed / duration).toFixed(1)} messages/sec`
        : '0 messages/sec'
    };
    
    DisplayUtils.displayKeyValue(syncStats, {
      formatters: {
        'Projects processed': (v) => DisplayUtils.formatNumber(v, 'success'),
        'Sessions processed': (v) => DisplayUtils.formatNumber(v, 'success'),
        'Messages processed': (v) => DisplayUtils.formatNumber(v, 'success'),
        'Processing speed': (v) => chalk.cyan(v)
      }
    });
    
    if (result.errors.length > 0) {
      logger.info(`   Errors: ${chalk.red(result.errors.length)}`);
      const maxErrors = ConfigHelper.getDisplay().maxErrorsDisplayed;
      if (result.errors.length <= maxErrors) {
        result.errors.forEach((err: string) => logger.error(chalk.red(`     - ${err}`)));
      } else {
        logger.info(chalk.red(`     (showing first ${maxErrors} of ${result.errors.length} errors)`));
        result.errors.slice(0, maxErrors).forEach((err: string) => logger.error(chalk.red(`     - ${err}`)));
      }
    }

    // Show aggregated user stats
    try {
      const userStatsService = new UserStatsService(this.prisma, this.userService);
      const userStats = await userStatsService.getAggregatedStats();
      if (userStats) {
        DisplayUtils.sectionHeader('User Stats', '👤');
        
        const stats = {
          '📁 Projects': userStats.totalProjects,
          '💬 Sessions': userStats.totalSessions,
          '📝 Messages': userStats.totalMessages
        };
        
        DisplayUtils.displayKeyValue(stats, {
        formatters: {
          '📁 Projects': (v) => chalk.cyan(v),
          '💬 Sessions': (v) => chalk.cyan(v),
          '📝 Messages': (v) => chalk.cyan(v)
        }
      });
      
      // Show message breakdown by writer
      const messageBreakdown = await userStatsService.getMessageBreakdown();
      if (messageBreakdown) {
        logger.info(`\n   ${chalk.bold('💬 Message Breakdown:')}`);
        logger.info(`     👤 Human: ${chalk.green(messageBreakdown.human)} (${messageBreakdown.humanPercentage}%)`);
        logger.info(`     ⚙️  Agent: ${chalk.yellow(messageBreakdown.agent)} (${messageBreakdown.agentPercentage}%)`);
        logger.info(`     🤖 Assistant: ${chalk.blue(messageBreakdown.assistant)} (${messageBreakdown.assistantPercentage}%)`);
        logger.info(`     📊 Total: ${chalk.cyan(messageBreakdown.total)} messages`);
      }
      
      logger.info(`\n   🔤 Input tokens: ${chalk.cyan(userStats.totalInputTokens.toLocaleString())}`);
      logger.info(`   💭 Output tokens: ${chalk.cyan(userStats.totalOutputTokens.toLocaleString())}`);
      logger.info(`   💾 Cache creation tokens: ${chalk.cyan(userStats.totalCacheCreationTokens.toLocaleString())}`);
      logger.info(`   ⚡ Cache read tokens: ${chalk.cyan(userStats.totalCacheReadTokens.toLocaleString())}`);

      // Show detailed user stats by model before total cost
      const userStatsByModel = await userStatsService.getStatsByModel();
      if (userStatsByModel.length > 0) {
        logger.info('\n' + chalk.bold('   🤖 Usage & Cost by Model:'));
        
        for (const modelStats of userStatsByModel) {
          logger.info(`\n      ${chalk.magenta('●')} ${chalk.cyan.bold(modelStats.model)}:`);
          logger.info(`        📊 Messages: ${chalk.white(modelStats.messageCount.toLocaleString())}`);
          logger.info(`        📥 Input: ${chalk.green(modelStats.inputTokens.toLocaleString())} tokens`);
          logger.info(`        📤 Output: ${chalk.green(modelStats.outputTokens.toLocaleString())} tokens`);
          
          if (modelStats.cacheCreationTokens > 0) {
            logger.info(`        💾 Cache write: ${chalk.blue(modelStats.cacheCreationTokens.toLocaleString())} tokens`);
          }
          if (modelStats.cacheReadTokens > 0) {
            logger.info(`        ⚡ Cache read: ${chalk.blue(modelStats.cacheReadTokens.toLocaleString())} tokens`);
          }
          
          const totalTokens = modelStats.inputTokens + modelStats.outputTokens + 
                            modelStats.cacheCreationTokens + modelStats.cacheReadTokens;
          logger.info(`        🎯 Total: ${chalk.yellow.bold(totalTokens.toLocaleString())} tokens`);
          logger.info(`        💰 Cost: ${chalk.bold.green(FormatterUtils.formatCurrency(modelStats.cost))}`);
        }
      }

      // Show total cost as the bottom line
      const display = ConfigHelper.getDisplay();
      logger.info('\n' + chalk.gray(display.sectionSeparator.repeat(display.sectionSeparatorWidth)));
      
      // Show incremental cost change
      if (incrementalCost > 0) {
        logger.info(`${chalk.bold('📈 Cost Added:')} ${chalk.bold.yellow('+' + FormatterUtils.formatCurrency(incrementalCost))}`);
      }
      
      logger.info(`${chalk.bold('💵 Total Cost:')} ${chalk.bold.green(FormatterUtils.formatCurrency(Number(userStats.totalCost)))}`);
    }
    } catch (error) {
      // Silently skip stats display if there's an error
      logger.debug('Failed to display user stats:', error);
    }

    // Show pending sync status
    if (pendingSync > 0) {
      logger.info(`\n${chalk.yellow('⚠️')}  ${pendingSync} records pending upload. Run ${chalk.bold('roiai cc push')} to sync with remote server.`);
    }
  }
}