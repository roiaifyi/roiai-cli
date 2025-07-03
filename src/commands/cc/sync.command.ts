import { Command } from 'commander';
import chalk from 'chalk';
import { db, prisma } from '../../database';
import { UserService } from '../../services/user.service';
import { SyncService } from '../../services/sync.service';

export const syncCommand = new Command('sync')
  .description('Sync Claude Code raw data to local database')
  .option('-f, --force', 'Force full resync (clear existing data)')
  .option('-p, --path <path>', 'Override raw data path')
  .action(async (options) => {
    try {
      const userService = new UserService();
      const syncService = new SyncService(prisma, userService);
      
      await syncService.sync({
        force: options.force,
        path: options.path,
        quiet: false
      });

    } catch (error) {
      console.error(chalk.red(`\n✖ Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    } finally {
      await db.disconnect();
    }
  });