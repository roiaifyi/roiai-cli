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
import { ApiUrlResolver } from '../../utils/api-url-resolver';
import { AuthValidator } from '../../utils/auth-validator';

export function createLoginCommand(): Command {
  const command = new Command('login');
  
  const signupUrl = configManager.get().app.signupUrl || 'https://roiAI.fyi';
  const signupDomain = signupUrl.replace(/^https?:\/\//, '').toLowerCase();
  
  command
    .description(`Login to your roiAI account (create free account at ${signupDomain})`)
    .option('-e, --email <email>', 'Email address')
    .option('-p, --password <password>', 'Password')
    .option('-t, --token <token>', 'API token (alternative to email/password)')
    .option('-v, --verbose', 'Show detailed error information')
    .action(async (options) => {
      const spinner = ora('Initializing login...').start();
      
      try {
        const userService = new UserService();
        const authStatus = await AuthValidator.checkAuthentication(userService);
        
        // Store current credentials if already logged in (for potential logout)
        const oldApiToken = authStatus.apiToken;
        const oldEmail = authStatus.email;
        
        // If already logged in, show current status but continue to allow re-login
        if (authStatus.isAuthenticated && oldEmail && !options.token && !options.email && !options.password) {
          spinner.info(`Currently logged in as ${oldEmail}`);
          console.log(chalk.dim('Proceeding to login with new credentials...\n'));
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
          // Create typed API client with URL override support
          const apiUrl = ApiUrlResolver.getApiUrl(command);
          const apiClient = createApiClient(apiUrl);
          
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
            loginRequest.password = token;
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
              
              const revokeApiClient = createApiClient(apiUrl, oldApiToken);
              await revokeApiClient.cliLogout();
              // If we get here, logout succeeded
            } catch (error) {
              // Silently handle logout errors - don't interrupt the login flow
              if (options.verbose) {
                console.log(chalk.yellow(`\n⚠️  Note: Could not revoke previous API key: ${SpinnerErrorHandler.getErrorMessage(error)}`));
              }
              // The old key might already be invalid or the server might be unreachable
              // This is not critical as we're replacing it anyway
            }
            
            // Clear local credentials before saving new ones
            await userService.logout();
          }
          
          // Save new authentication info using the full user info from server
          await userService.login(user.id, user.email || '', api_key, user.username);
          
          // Display appropriate success message using server response data
          const displayName = user.email || user.username || user.id;
          if (oldEmail && oldEmail !== displayName) {
            spinner.succeed(`Successfully switched from ${oldEmail} to ${displayName}`);
          } else if (oldEmail === displayName) {
            spinner.succeed(`Successfully re-authenticated as ${displayName}`);
          } else {
            spinner.succeed(`Successfully logged in as ${displayName}`);
          }
          console.log(chalk.dim('\nYou can now use \'roiai cc push\' to sync your usage data.'));
          
        } catch (error: any) {
          // Handle typed errors
          const apiConfig = configManager.getApiConfig();
          if (error.code) {
            switch (error.code) {
              case 'AUTH_001':
                spinner.fail('Invalid credentials. Please check your email/username and password.');
                const signupUrl = configManager.get().app.signupUrl || 'https://roiAI.fyi';
                console.log(chalk.cyan(`\nDon't have an account? Create one at ${signupUrl}`));
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
                  const signupUrl2 = configManager.get().app.signupUrl || 'https://roiAI.fyi';
                  console.log(chalk.cyan(`Need a new account? Create one at ${signupUrl2}`));
                } else {
                  const signupUrl = configManager.get().app.signupUrl || 'https://roiAI.fyi';
                console.log(chalk.cyan(`\nDon't have an account? Create one at ${signupUrl}`));
                }
                process.exit(1);
            }
          } else if (error.statusCode === 404) {
            SpinnerErrorHandler.handleError(spinner, error, 'Authentication endpoint not found. Please check your server configuration.');
          } else {
            spinner.fail('Login failed');
            const signupUrl3 = configManager.get().app.signupUrl || 'https://roiAI.fyi';
            console.log(chalk.cyan(`\nDon't have an account? Create one at ${signupUrl3}`));
            process.exit(1);
          }
        }
        
      } catch (error) {
        // Log the actual error for debugging
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        spinner.fail(`Login failed: ${errorMessage}`);
        
        // Show more details in verbose mode
        if (options.verbose && error instanceof Error) {
          console.error(chalk.dim('\nError details:'), error);
        }
        
        const signupUrl4 = configManager.get().app.signupUrl || 'https://roiAI.fyi';
        console.log(chalk.cyan(`\nDon't have an account? Create one at ${signupUrl4}`));
        process.exit(1);
      }
    });
    
  return command;
}