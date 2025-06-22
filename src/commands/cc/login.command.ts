import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import prompts from 'prompts';
import axios from 'axios';
import os from 'os';
import { UserService } from '../../services/user.service';
import { MachineService } from '../../services/machine.service';
import { configManager } from '../../config';
import { EndpointResolver } from '../../utils/endpoint-resolver';
import { createApiClient } from '../../generated/api-client';
import { COMMAND_STRINGS } from '../../utils/constants';

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
        let oldApiToken: string | null = null;
        let oldEmail: string | null = null;
        if (userService.isAuthenticated()) {
          oldApiToken = userService.getApiToken();
          oldEmail = userService.getAuthenticatedEmail();
          spinner.text = `Currently logged in as ${oldEmail}. Proceeding with new login...`;
        }
        
        spinner.stop();
        
        // Get credentials
        let email: string = '';
        let password: string = '';
        let token: string | undefined = options.token;
        
        if (!token) {
          // Prompt for email/password
          email = options.email || '';
          password = options.password || '';
          
          if (!email) {
            const response = await prompts({
              type: 'text',
              name: 'email',
              message: 'Email:',
              validate: (value: string) => value.includes('@') || 'Please enter a valid email'
            });
            email = response.email;
            if (!email) {
              console.log(chalk.red('Login cancelled'));
              return;
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
              console.log(chalk.red('Login cancelled'));
              return;
            }
          }
        }
        
        spinner.start('Authenticating...');
        
        // Get auth endpoint
        const authEndpoint = EndpointResolver.getLoginEndpoint();
        
        // Load machine info
        const machineService = new MachineService();
        const machineInfo = await machineService.loadMachineInfo();
        
        try {
          // Build request payload
          const payload: any = {
            machine_info: {
              machine_id: machineInfo.machineId,
              machine_name: machineInfo.osInfo.hostname,
              platform: machineInfo.osInfo.platform,
              hostname: machineInfo.osInfo.hostname,
              os_version: `${os.type()} ${os.release()}`
            }
          };
          
          if (token) {
            payload.token = token;
          } else {
            payload.email = email;
            payload.password = password;
          }
          
          // Authenticate with server
          const response = await axios.post(authEndpoint, payload, {
            headers: {
              'Content-Type': 'application/json',
            },
            timeout: configManager.get().network?.authTimeout || 5000
          });
          
          const { success, data } = response.data;
          
          if (!success || !data) {
            throw new Error('Invalid server response');
          }
          
          // Extract user and API key from response
          const { user, api_key } = data;
          
          if (!user || !api_key) {
            throw new Error('Invalid server response format');
          }
          
          // If there was a previous login, revoke the old API key
          if (oldApiToken) {
            try {
              spinner.text = 'Revoking previous API key...';
              
              const apiConfig = configManager.getApiConfig();
              const apiClient = createApiClient({
                baseUrl: apiConfig.baseUrl,
                headers: {
                  Authorization: `${COMMAND_STRINGS.HTTP.BEARER_PREFIX}${oldApiToken}`,
                },
              });
              
              const logoutResponse = await apiClient.logout();
              
              if (!logoutResponse.ok) {
                // Log warning but don't fail the login
                console.log(chalk.yellow(`\nWarning: Could not revoke previous API key for ${oldEmail}`));
              }
            } catch (error) {
              // Silently handle logout errors - don't interrupt the login flow
              console.log(chalk.yellow(`\nWarning: Could not revoke previous API key: ${error instanceof Error ? error.message : 'Unknown error'}`));
            }
            
            // Clear local credentials before saving new ones
            await userService.logout();
          }
          
          // Save new authentication info
          await userService.login(user.id, user.email, api_key, user.username);
          
          if (oldEmail && oldEmail !== user.email) {
            spinner.succeed(`Successfully switched from ${oldEmail} to ${user.email}`);
          } else {
            spinner.succeed(`Successfully logged in as ${user.email}`);
          }
          console.log(chalk.dim('\nYou can now use \'roiai-cli cc push\' to sync your usage data.'));
          
        } catch (error) {
          if (axios.isAxiosError(error)) {
            if (error.response?.status === 401) {
              spinner.fail('Invalid credentials');
            } else if (error.response?.status === 404) {
              spinner.fail('Authentication endpoint not found. Please check your server configuration.');
            } else if (error.code === 'ECONNREFUSED') {
              spinner.fail(`Cannot connect to server at ${authEndpoint}`);
            } else {
              spinner.fail(`Authentication failed: ${error.response?.data?.message || error.message}`);
            }
          } else {
            spinner.fail(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
          process.exit(1);
        }
        
      } catch (error) {
        spinner.fail(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });
    
  return command;
}