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
      logger.success(`Logged in as: ${userInfo.userId} (Machine: ${userInfo.clientMachineId})`);

      // Get watch path
      const watchPath = options.path || configManager.getClaudeCodeConfig().rawDataPath;
      const watchConfig = configManager.getWatchConfig();
      
      logger.info(`Watching directory: ${chalk.cyan(watchPath)}`);
      logger.info('Press Ctrl+C to stop watching\n');

      // Set up file watcher
      const watcher = chokidar.watch(path.join(watchPath, '**/*.jsonl'), {
        ignored: watchConfig.ignored,
        persistent: true,
        usePolling: true,
        interval: parseInt(options.interval),
        awaitWriteFinish: {
          stabilityThreshold: 2000,
          pollInterval: 100
        }
      });

      // Track processing to avoid duplicates
      const processingQueue = new Set<string>();
      let isProcessing = false;

      const processFile = async (filePath: string) => {
        if (processingQueue.has(filePath) || isProcessing) {
          return;
        }

        processingQueue.add(filePath);
        isProcessing = true;

        try {
          // Extract project ID from file path
          const relativePath = path.relative(watchPath, filePath);
          const projectDir = relativePath.split(path.sep)[0];
          
          const projectName = projectDir.replace(/^-Users-[^-]+-/, '');
          const project = await jsonlService['ensureProject'](projectName);

          logger.info(`Processing ${chalk.yellow(path.basename(filePath))}...`);
          const result = await jsonlService.processJSONLFile(filePath, project.id);

          if (result.messagesProcessed > 0) {
            logger.success(
              `Processed ${chalk.green(result.messagesProcessed)} messages` +
              (result.duplicatesSkipped > 0 ? ` (${chalk.yellow(result.duplicatesSkipped)} duplicates skipped)` : '')
            );
          }

          if (result.errors.length > 0) {
            result.errors.forEach(err => logger.error(err));
          }
        } catch (error) {
          logger.error(`Failed to process ${filePath}:`, error);
        } finally {
          processingQueue.delete(filePath);
          isProcessing = false;
        }
      };

      // Watch events
      watcher
        .on('add', async (filePath) => {
          logger.debug(`File added: ${filePath}`);
          await processFile(filePath);
        })
        .on('change', async (filePath) => {
          logger.debug(`File changed: ${filePath}`);
          await processFile(filePath);
        })
        .on('error', (error) => {
          logger.error('Watcher error:', error);
        })
        .on('ready', () => {
          logger.success('Initial scan complete. Watching for changes...');
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