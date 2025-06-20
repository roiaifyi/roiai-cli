import { Command } from 'commander';
import chokidar from 'chokidar';
import path from 'path';
import chalk from 'chalk';
import { configManager } from '../../config';
import { db } from '../../database';
import { PricingService } from '../../services/pricing.service';
import { UserService } from '../../services/user.service';
import { JSONLService } from '../../services/jsonl.service';
import { logger } from '../../utils/logger';

export const watchCommand = new Command('watch')
  .description('Watch Claude Code raw data directory for changes and auto-sync')
  .option('-p, --path <path>', 'Override raw data path to watch')
  .option('-i, --interval <ms>', 'Polling interval in milliseconds', '5000')
  .action(async (options) => {
    try {
      // Initialize services
      const pricingService = new PricingService();
      const userService = new UserService();
      const jsonlService = new JSONLService(pricingService, userService);

      // Load initial data
      logger.info('Loading pricing data...');
      await pricingService.loadPricingData();

      logger.info('Loading user information...');
      await userService.loadUserInfo();
      const userInfo = userService.getUserInfo();
      const userId = userService.getUserId();
      logger.success(`Logged in as: ${userId} (Machine: ${userInfo.clientMachineId})`);

      // Get watch path
      const watchPath = options.path || configManager.getClaudeCodeConfig().rawDataPath;
      const watchConfig = configManager.getWatchConfig();
      
      const watchPattern = path.join(watchPath, 'projects', '**/*.jsonl');
      logger.info(`Watching directory: ${chalk.cyan(watchPath)}`);
      logger.info(`Watch pattern: ${chalk.cyan(watchPattern)}`);
      logger.info('Press Ctrl+C to stop watching\n');

      // Set up file watcher - watch for JSONL files in projects subdirectory
      const watcher = chokidar.watch(watchPattern, {
        ignored: watchConfig.ignored,
        persistent: true,
        usePolling: true,
        interval: parseInt(options.interval),
        awaitWriteFinish: {
          stabilityThreshold: watchConfig.stabilityThreshold,
          pollInterval: watchConfig.progressUpdateInterval
        },
        ignoreInitial: true  // Don't fire 'add' events for existing files
      });

      // Track processing to avoid duplicates
      const processingQueue = new Set<string>();

      const processFile = async (filePath: string) => {
        if (processingQueue.has(filePath)) {
          return;
        }

        processingQueue.add(filePath);

        try {
          // Extract project ID from file path
          const relativePath = path.relative(path.join(watchPath, 'projects'), filePath);
          const projectDir = relativePath.split(path.sep)[0];
          
          const projectName = projectDir.replace(/^-Users-[^-]+-/, '');
          const project = await jsonlService.ensureProject(projectName);

          logger.info(`Processing ${chalk.yellow(path.basename(filePath))}...`);
          const result = await jsonlService.processJSONLFile(filePath, project.id);

          if (result.messagesProcessed > 0) {
            logger.success(
              `Processed ${chalk.green(result.messagesProcessed)} messages`
            );
          }

          if (result.errors.length > 0) {
            result.errors.forEach(err => logger.error(err));
          }
        } catch (error) {
          logger.error(`Failed to process ${filePath}:`, error);
        } finally {
          processingQueue.delete(filePath);
        }
      };

      // Watch events
      watcher
        .on('add', async (filePath) => {
          logger.info(`File detected (add): ${chalk.yellow(filePath)}`);
          await processFile(filePath);
        })
        .on('change', async (filePath) => {
          logger.info(`File detected (change): ${chalk.yellow(filePath)}`);
          await processFile(filePath);
        })
        .on('error', (error) => {
          logger.error('Watcher error:', error);
        })
        .on('ready', () => {
          logger.success('Initial scan complete. Watching for changes...');
          const watched = watcher.getWatched();
          logger.debug(`Watching ${Object.keys(watched).length} directories`);
        });

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        logger.info('\nStopping file watcher...');
        await watcher.close();
        await db.disconnect();
        logger.success('Watch mode stopped');
        process.exit(0);
      });

      // Keep the process running
      await new Promise(() => {});

    } catch (error) {
      logger.error('Watch error:', error);
      await db.disconnect();
      process.exit(1);
    }
  });