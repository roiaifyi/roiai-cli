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
import { SpinnerUtils } from '../utils/spinner-utils';
import { ProgressDisplay } from '../utils/progress-display';

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
    const spinner = options.quiet ? undefined : ora('Initializing sync process...').start();
    const startTime = Date.now();

    try {
      // Ensure database is initialized
      await db.ensureInitialized();
      
      // Initialize services
      const pricingService = new PricingService();
      const jsonlService = new JSONLService(pricingService, this.userService);

      // Load pricing data
      SpinnerUtils.update(spinner, 'Loading pricing data...');
      await pricingService.loadPricingData();

      // Load user info silently
      await this.userService.loadUserInfo();

      // Get initial cost before sync
      const userStatsServicePreSync = new UserStatsService(this.prisma, this.userService);
      const userStatsBeforeSync = await userStatsServicePreSync.getAggregatedStats();
      const costBeforeSync = userStatsBeforeSync ? Number(userStatsBeforeSync.totalCost) : 0;

      // Handle force flag
      if (options.force) {
        SpinnerUtils.update(spinner, 'Clearing existing data...');
        await db.clearAllData();
        SpinnerUtils.succeed(spinner, 'Existing data cleared');
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
        // Stop spinner temporarily to show messages
        if (spinner) {
          spinner.stop();
        }
        
        const messages = ConfigHelper.getSyncMessages();
        if (options.force) {
          console.log(chalk.blue(messages.forceSync));
        } else {
          console.log(chalk.blue(messages.firstTime));
        }
        console.log(chalk.gray('   Only new or modified files will be processed in subsequent syncs.\n'));
        
        // Restart spinner
        if (spinner) {
          spinner.start('Processing Claude Code data...');
        }
      } else {
        // Start processing
        SpinnerUtils.update(spinner, 'Processing Claude Code data...');
      }
      
      // Set up progress tracking (only if not quiet)
      if (!options.quiet && spinner) {
        let lastProgressUpdate = 0; // Start at 0 to ensure first update shows
        let hasShownProgress = false;
        
        jsonlService.setProgressCallback((progress) => {
          const now = Date.now();
          // Force at least one progress update to show
          if (!hasShownProgress || now - lastProgressUpdate > ConfigHelper.getDisplay().progressUpdateInterval) {
            const fileProgress = progress.totalFiles > 0 
              ? FormatterUtils.calculatePercentage(progress.processedFiles, progress.totalFiles)
              : 0;
            
            // Create animated progress bar
            ProgressDisplay.advanceSpinner();
            const progressBar = ProgressDisplay.generateAnimatedProgressBar(fileProgress);
            
            // Build progress text based on available information
            let progressText = `[${progressBar}] ${fileProgress}%`;
            
            if (progress.totalProjects > 0) {
              progressText += ` | Project ${Math.min(progress.processedProjects + 1, progress.totalProjects)}/${progress.totalProjects}`;
            }
            
            if (progress.totalFiles > 0) {
              progressText += ` | File ${progress.processedFiles}/${progress.totalFiles}`;
            } else if (progress.currentProject) {
              progressText += ` | Scanning ${progress.currentProject}...`;
            }
            
            spinner.text = progressText;
            lastProgressUpdate = now;
            hasShownProgress = true;
          }
        });
      }
      
      const result = await jsonlService.processDirectory(dataPath);
      
      const duration = ((Date.now() - startTime) / 1000);
      SpinnerUtils.succeed(spinner, `Sync completed in ${duration.toFixed(2)}s`);

      // Check if any new data was processed
      const changes = jsonlService.getIncrementalChanges();
      const hasNewData = changes.newMessages > 0 || changes.newProjects.length > 0 || changes.newSessions.length > 0;
      
      if (needsFullRecalc) {
        // Full recalculation needed for initial sync or force flag
        SpinnerUtils.update(spinner, 'Recalculating aggregates...');
        const aggregationService = new AggregationService(this.prisma);
        await aggregationService.recalculateAllAggregates();
        SpinnerUtils.succeed(spinner, 'Aggregates recalculated');
      } else if (hasNewData) {
        // Recalculate aggregates for incremental changes
        SpinnerUtils.update(spinner, 'Updating aggregates...');
        const aggregationService = new AggregationService(this.prisma);
        await aggregationService.recalculateAllAggregates();
        SpinnerUtils.succeed(spinner, 'Aggregates updated');
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
      SpinnerUtils.fail(spinner, 'Sync failed');
      logger.debug('Sync error:', error);
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
      console.log('\n' + chalk.bold('🔄 Incremental Changes:'));
      
      if (changes.newProjects.length > 0) {
        console.log(`   ${chalk.green('+')} New projects: ${chalk.cyan(changes.newProjects.join(', '))}`);
      }
      
      if (changes.newSessions.length > 0) {
        console.log(`   ${chalk.green('+')} New sessions: ${chalk.cyan(changes.newSessions.length)} session(s)`);
        const displayConfig = configManager.get().display;
        const maxSessions = displayConfig?.maxSessionsShown || 5;
        const sessionIdLength = displayConfig?.sessionIdLength || 8;
        if (changes.newSessions.length <= maxSessions) {
          console.log(`     ${chalk.gray(changes.newSessions.map((s: string) => s.substring(0, sessionIdLength) + '...').join(', '))}`);
        }
      }
      
      if (changes.newMessages > 0) {
        console.log(`   ${chalk.green('+')} New messages: ${chalk.cyan(changes.newMessages)}`);
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
      console.log(`   Errors: ${chalk.red(result.errors.length)}`);
      const maxErrors = ConfigHelper.getDisplay().maxErrorsDisplayed;
      if (result.errors.length <= maxErrors) {
        result.errors.forEach((err: string) => console.error(chalk.red(`     - ${err}`)));
      } else {
        console.log(chalk.red(`     (showing first ${maxErrors} of ${result.errors.length} errors)`));
        result.errors.slice(0, maxErrors).forEach((err: string) => console.error(chalk.red(`     - ${err}`)));
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
          console.log(`        💰 Cost: ${chalk.bold.green(FormatterUtils.formatCurrency(modelStats.cost))}`);
        }
      }

      // Show total cost as the bottom line
      const display = ConfigHelper.getDisplay();
      console.log('\n' + chalk.gray(display.sectionSeparator.repeat(display.sectionSeparatorWidth)));
      
      // Show incremental cost change
      if (incrementalCost > 0) {
        console.log(`${chalk.bold('📈 Cost Added:')} ${chalk.bold.yellow('+' + FormatterUtils.formatCurrency(incrementalCost))}`);
      }
      
      console.log(`${chalk.bold('💵 Total Cost:')} ${chalk.bold.green(FormatterUtils.formatCurrency(Number(userStats.totalCost)))}`);
    }
    } catch (error) {
      // Silently skip stats display if there's an error
      logger.debug('Failed to display user stats:', error);
    }

    // Show pending sync status
    if (pendingSync > 0) {
      console.log(`\n${chalk.yellow('⚠️')}  ${pendingSync} records pending upload. Run ${chalk.bold('roiai cc push')} to sync with remote server.`);
    }
  }
}