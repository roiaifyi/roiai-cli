import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { UserService } from '../../services/user.service';
import { SpinnerErrorHandler } from '../../utils/spinner-error-handler';
import { createApiClient } from '../../api/typed-client';
import { configManager } from '../../config';

export function createLogoutCommand(): Command {
  const command = new Command('logout');
  
  command
    .description('Logout from the server (revokes API key and clears local credentials)')
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
        const apiToken = userService.getApiToken();
        
        // First, try to revoke the API key on the server
        let serverLogoutSuccess = false;
        if (apiToken) {
          try {
            spinner.text = 'Revoking API key on server...';
            
            const apiConfig = configManager.getApiConfig();
            const apiClient = createApiClient(apiConfig.baseUrl, apiToken);
            
            await apiClient.cliLogout();
            
            // Typed response should be SuccessResponse if it worked
            serverLogoutSuccess = true;
            spinner.text = 'API key revoked successfully';
          } catch (error: any) {
            // Handle typed errors
            let errorMessage = SpinnerErrorHandler.getErrorMessage(error);
            
            if (error.code) {
              switch (error.code) {
                case 'AUTH_004':
                  errorMessage = 'API key is invalid or already revoked';
                  break;
                case 'NETWORK_ERROR':
                  errorMessage = 'Could not contact server';
                  break;
              }
            }
            
            console.log(chalk.yellow(`\n⚠️  Warning: Failed to revoke API key on server: ${errorMessage}`));
            console.log(chalk.yellow('   You can manually delete the API key in the web interface if needed.'));
          }
        }
        
        // Always clear local credentials
        spinner.text = 'Clearing local credentials...';
        await userService.logout();
        
        if (serverLogoutSuccess) {
          spinner.succeed(`Logged out from ${email} (API key revoked)`);
        } else {
          spinner.succeed(`Logged out from ${email} (local credentials cleared)`);
        }
        
        console.log(chalk.dim('\nContinuing in anonymous mode. Your local data remains intact.'));
        
      } catch (error) {
        spinner.fail(`Logout failed: ${SpinnerErrorHandler.getErrorMessage(error)}`);
        process.exit(1);
      }
    });
    
  return command;
}