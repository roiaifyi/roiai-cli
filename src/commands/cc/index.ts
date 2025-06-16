import { Command } from 'commander';
import { syncCommand } from './sync.command';
import { watchCommand } from './watch.command';
import { pushCommand } from './push.command';
import { pushStatusCommand } from './push-status.command';

export const ccCommand = new Command('cc')
  .description('Claude Code usage tracking commands')
  .addCommand(syncCommand)
  .addCommand(watchCommand)
  .addCommand(pushCommand)
  .addCommand(pushStatusCommand);