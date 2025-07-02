import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import prompts from 'prompts';
import os from 'os';
import { UserService } from '../../services/user.service';
import { MachineService } from '../../services/machine.service';
import { SpinnerErrorHandler } from '../../utils/spinner-error-handler';
import { createApiClient, CliLoginRequest } from '../../api/typed-client';
import { configManager } from '../../config';

export function createLoginCommand(): Command {
  const command = new Command('login');
  
  command
    .description('Login to push usage data to the server')
    .option('-e, --email <email>', 'Email address')
    .option('-p, --password <password>', 'Password')
    .option('-t, --token <token>', 'API token (alternative to email/password)')
    .action(async (options) => {
      const spinner = ora('Initializing login...').start();
      
      try {
        const userService = new UserService();
        await userService.loadUserInfo();
        
        // Store current credentials if already logged in (for potential logout)
        const oldApiToken = userService.getApiToken();
        const oldEmail = userService.getAuthenticatedEmail();
        
        // If already logged in with same account and not forcing re-login, just show status
        if (userService.isAuthenticated() && oldEmail && !options.token && !options.email && !options.password) {
          spinner.info(`Already logged in as ${oldEmail}`);
          console.log(chalk.dim('\nYou can use \'roiai cc push\' to sync your usage data.'));
          console.log(chalk.dim('To switch accounts, use \'roiai cc logout\' first or provide credentials.'));
          return;
        }
        
        spinner.stop();
        
        // Get credentials
        let email: string | undefined;
        let username: string | undefined;
        let password: string = '';
        let token: string | undefined = options.token;
        
        if (!token) {
          // Prompt for email/username and password
          const emailOrUsername = options.email || '';
          password = options.password || '';
          
          if (!emailOrUsername) {
            const response = await prompts({
              type: 'text',
              name: 'emailOrUsername',
              message: 'Email or Username:',
              validate: (value: string) => value.length > 0 || 'Please enter your email or username'
            });
            const input = response.emailOrUsername;
            if (!input) {
              console.error(chalk.red('Login cancelled'));
              return;
            }
            // Determine if it's email or username
            if (input.includes('@')) {
              email = input;
            } else {
              username = input;
            }
          } else {
            // Determine if it's email or username
            if (emailOrUsername.includes('@')) {
              email = emailOrUsername;
            } else {
              username = emailOrUsername;
            }
          }
          
          if (!password) {
            const response = await prompts({
              type: 'password',
              name: 'password',
              message: 'Password:'
            });
            password = response.password;
            if (!password) {
              console.error(chalk.red('Login cancelled'));
              return;
            }
          }
        }
        
        spinner.start('Authenticating...');
        
        // Load machine info
        const machineService = new MachineService();
        const machineInfo = await machineService.loadMachineInfo();
        
        try {
          // Create typed API client
          const apiConfig = configManager.getApiConfig();
          const apiClient = createApiClient(apiConfig.baseUrl);
          
          // Build typed login request
          const loginRequest: CliLoginRequest = {
            machine_info: {
              machine_id: machineInfo.machineId,
              machine_name: machineInfo.osInfo.hostname,
              platform: machineInfo.osInfo.platform,
              hostname: machineInfo.osInfo.hostname,
              os_version: `${os.type()} ${os.release()}`
            },
            password: '' // Will be set below
          };
          
          if (token) {
            // Token-based authentication
            // The API requires either email or username even for token auth
            // Use a placeholder email for token-based auth
            loginRequest.password = token;
            loginRequest.email = 'token@auth.local';
          } else {
            // Email/username + password authentication
            loginRequest.password = password;
            if (email) {
              loginRequest.email = email;
            }
            if (username) {
              loginRequest.username = username;
            }
          }
          
          // Authenticate with server using typed client
          spinner.text = 'Authenticating with server...';
          const loginResponse = await apiClient.cliLogin(loginRequest);
          
          // Extract user and API key from typed response
          const { user, api_key } = loginResponse;
          
          if (!user || !api_key) {
            throw new Error('Invalid server response format');
          }
          
          // If there was a previous login, revoke the old API key
          if (oldApiToken) {
            try {
              spinner.text = 'Revoking previous API key...';
              
              const revokeApiClient = createApiClient(apiConfig.baseUrl, oldApiToken);
              await revokeApiClient.cliLogout();
              // If we get here, logout succeeded
            } catch (error) {
              // Silently handle logout errors - don't interrupt the login flow
              console.log(chalk.yellow(`\n⚠️  Warning: Could not revoke previous API key: ${SpinnerErrorHandler.getErrorMessage(error)}`));
            }
            
            // Clear local credentials before saving new ones
            await userService.logout();
          }
          
          // Save new authentication info
          await userService.login(user.id, user.email || '', api_key, user.username);
          
          if (oldEmail && oldEmail !== user.email) {
            spinner.succeed(`Successfully switched from ${oldEmail} to ${user.email}`);
          } else {
            spinner.succeed(`Successfully logged in as ${user.email}`);
          }
          console.log(chalk.dim('\nYou can now use \'roiai cc push\' to sync your usage data.'));
          
        } catch (error: any) {
          // Handle typed errors
          const apiConfig = configManager.getApiConfig();
          if (error.code) {
            switch (error.code) {
              case 'AUTH_001':
                spinner.fail('Invalid credentials. Please check your email/username and password.');
                console.log(chalk.cyan('\nDon\'t have an account? Create one at https://roiAI.fyi'));
                process.exit(1);
                break;
              case 'VAL_001':
              case 'VAL_002':
                let validationMsg = 'Invalid input';
                if (error.errors) {
                  const errorDetails = Object.entries(error.errors)
                    .map(([field, msg]) => `${field}: ${msg}`)
                    .join(', ');
                  validationMsg = `Validation error: ${errorDetails}`;
                }
                SpinnerErrorHandler.handleError(spinner, error, validationMsg);
                break;
              case 'NETWORK_ERROR':
                SpinnerErrorHandler.handleError(spinner, error, `Cannot connect to server at ${apiConfig.baseUrl}`);
                break;
              default:
                spinner.fail(`Login failed: ${error.message}`);
                // Show account creation hint for auth-related errors
                if (error.message && error.message.toLowerCase().includes('email not verified')) {
                  console.log(chalk.yellow('\nPlease check your email to verify your account.'));
                  console.log(chalk.cyan('Need a new account? Create one at https://roiAI.fyi'));
                } else {
                  console.log(chalk.cyan('\nDon\'t have an account? Create one at https://roiAI.fyi'));
                }
                process.exit(1);
            }
          } else if (error.statusCode === 404) {
            SpinnerErrorHandler.handleError(spinner, error, 'Authentication endpoint not found. Please check your server configuration.');
          } else {
            spinner.fail('Login failed');
            console.log(chalk.cyan('\nDon\'t have an account? Create one at https://roiAI.fyi'));
            process.exit(1);
          }
        }
        
      } catch (error) {
        spinner.fail('Login failed');
        console.log(chalk.cyan('\nDon\'t have an account? Create one at https://roiAI.fyi'));
        process.exit(1);
      }
    });
    
  return command;
}