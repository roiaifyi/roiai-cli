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
        
        // Check if already logged in
        if (userService.isAuthenticated()) {
          const email = userService.getAuthenticatedEmail();
          spinner.warn(`Already logged in as ${email}. Use 'roiai-cli cc logout' to switch accounts.`);
          return;
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
        
        // Get auth endpoint from config
        const pushConfig = configManager.getPushConfig();
        const authEndpoint = EndpointResolver.getLoginEndpoint(pushConfig.endpoint);
        
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
          
          const { user, apiKey } = data;
          
          // Save authentication info with new format
          await userService.login(user.id.toString(), user.email, apiKey, user.username);
          
          spinner.succeed(`Successfully logged in as ${user.email}`);
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