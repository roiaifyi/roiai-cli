import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import prompts from 'prompts';
import axios from 'axios';
import { UserService } from '../../services/user.service';
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
        
        // Get push endpoint from config
        const pushConfig = configManager.getPushConfig();
        const authEndpoint = pushConfig.endpoint.replace('/v1/usage/push', '/v1/auth/login');
        
        try {
          // Authenticate with server
          const response = await axios.post(authEndpoint, 
            token ? { token } : { email, password },
            {
              headers: {
                'Content-Type': 'application/json',
              },
              timeout: 5000
            }
          );
          
          const { userId, email: userEmail, apiToken } = response.data;
          
          // Save authentication info
          await userService.login(userId, userEmail, apiToken);
          
          spinner.succeed(`Successfully logged in as ${userEmail}`);
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