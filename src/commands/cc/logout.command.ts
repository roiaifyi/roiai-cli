import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { UserService } from '../../services/user.service';
import { createApiClient } from '../../generated/api-client';
import { configManager } from '../../config';
import { COMMAND_STRINGS } from '../../utils/constants';

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
            const apiClient = createApiClient({
              baseUrl: apiConfig.baseUrl,
              headers: {
                Authorization: `${COMMAND_STRINGS.HTTP.BEARER_PREFIX}${apiToken}`,
              },
            });
            
            const response = await apiClient.logout();
            
            if (response.ok) {
              serverLogoutSuccess = true;
              spinner.text = 'API key revoked successfully';
            } else {
              const errorData = response.data as any;
              // Handle structured error response
              const errorMessage = errorData?.success === false && errorData?.error 
                ? `${errorData.error.message} (${errorData.error.code})`
                : errorData?.message || 'Unknown error';
              console.log(chalk.yellow(`\nWarning: Failed to revoke API key on server: ${errorMessage}`));
              console.log(chalk.yellow('You can manually delete the API key in the web interface if needed.'));
            }
          } catch (error) {
            console.log(chalk.yellow(`\nWarning: Could not contact server to revoke API key: ${error instanceof Error ? error.message : 'Unknown error'}`));
            console.log(chalk.yellow('You can manually delete the API key in the web interface if needed.'));
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
        spinner.fail(`Logout failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });
    
  return command;
}