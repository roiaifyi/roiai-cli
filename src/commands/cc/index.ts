import { Command } from 'commander';
import { syncCommand } from './sync.command';
import { pushCommand } from './push.command';
import { pushStatusCommand } from './push-status.command';
import { createLoginCommand } from './login.command';
import { createLogoutCommand } from './logout.command';

export const ccCommand = new Command('cc')
  .description('Claude Code usage tracking commands')
  .helpOption(false)
  .addHelpText('after', '\nRun \'roiai cc --help\' for more information on Claude Code commands.')
  .addCommand(syncCommand)
  .addCommand(pushCommand)
  .addCommand(pushStatusCommand)
  .addCommand(createLoginCommand())
  .addCommand(createLogoutCommand());