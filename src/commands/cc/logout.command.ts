import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { UserService } from '../../services/user.service';

export function createLogoutCommand(): Command {
  const command = new Command('logout');
  
  command
    .description('Logout from the server (local data remains intact)')
    .action(async () => {
      const spinner = ora('Logging out...').start();
      
      try {
        const userService = new UserService();
        await userService.loadUserInfo();
        
        // Check if logged in
        if (!userService.isAuthenticated()) {
          spinner.warn('Not currently logged in');
          return;
        }
        
        const email = userService.getAuthenticatedEmail();
        
        // Logout
        await userService.logout();
        
        spinner.succeed(`Logged out from ${email}`);
        console.log(chalk.dim('\nContinuing in anonymous mode. Your local data remains intact.'));
        
      } catch (error) {
        spinner.fail(`Logout failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });
    
  return command;
}