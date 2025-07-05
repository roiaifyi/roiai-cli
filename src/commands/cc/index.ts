import { Command } from 'commander';
import { syncCommand } from './sync.command';
import { pushCommand } from './push.command';
import { pushStatusCommand } from './push-status.command';
import { createLoginCommand } from './login.command';
import { createLogoutCommand } from './logout.command';

export const ccCommand = new Command('cc')
  .description('Claude Code analytics commands - track usage, costs, and sync across machines')
  .option('--api-url <url>', 'Override API server URL (default: https://api.roiai.fyi)')
  .addCommand(syncCommand)
  .addCommand(pushCommand)
  .addCommand(pushStatusCommand)
  .addCommand(createLoginCommand())
  .addCommand(createLogoutCommand());