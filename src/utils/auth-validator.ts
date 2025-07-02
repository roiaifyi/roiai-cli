import { Ora } from 'ora';
import chalk from 'chalk';
import { UserService } from '../services/user.service';
import { SpinnerErrorHandler } from './spinner-error-handler';

export class AuthValidator {
  /**
   * Validate user authentication with consistent error handling
   * @returns API token if authenticated, exits process if not
   */
  static async validateAndGetToken(
    userService: UserService,
    spinner: Ora,
    options: {
      loadUserInfo?: boolean;
      customErrorMessage?: string;
    } = {}
  ): Promise<string> {
    const { loadUserInfo = true, customErrorMessage } = options;
    
    // Load user info if requested
    if (loadUserInfo) {
      await userService.loadUserInfo();
    }
    
    // Check authentication
    if (!userService.isAuthenticated()) {
      if (customErrorMessage) {
        spinner.fail(customErrorMessage);
      } else {
        spinner.fail('Authentication required to push data');
        console.log(chalk.yellow('\n🔐 To use the push feature:'));
        console.log(chalk.white('  1. Create a free account at ') + chalk.cyan('https://roiAI.fyi'));
        console.log(chalk.white('  2. Verify your email address'));
        console.log(chalk.white('  3. Login using: ') + chalk.green('roiai cc login'));
        console.log(chalk.dim('\nYour usage data will be securely synced to the roiAI platform'));
      }
      process.exit(1);
    }
    
    // Get API token
    const apiToken = userService.getApiToken();
    if (!apiToken) {
      spinner.fail('No API token found. Please login again.');
      process.exit(1);
    }
    
    return apiToken;
  }

  /**
   * Check authentication without exiting, useful for status commands
   */
  static async checkAuthentication(
    userService: UserService,
    options: {
      loadUserInfo?: boolean;
    } = {}
  ): Promise<{
    isAuthenticated: boolean;
    apiToken?: string;
    email?: string;
  }> {
    const { loadUserInfo = true } = options;
    
    if (loadUserInfo) {
      await userService.loadUserInfo();
    }
    
    const isAuthenticated = userService.isAuthenticated();
    const apiTokenOrNull = isAuthenticated ? userService.getApiToken() : null;
    const emailOrNull = isAuthenticated ? userService.getAuthenticatedEmail() : null;
    
    const result: {
      isAuthenticated: boolean;
      apiToken?: string;
      email?: string;
    } = {
      isAuthenticated
    };
    
    if (apiTokenOrNull !== null) {
      result.apiToken = apiTokenOrNull;
    }
    
    if (emailOrNull !== null) {
      result.email = emailOrNull;
    }
    
    return result;
  }

  /**
   * Display authentication status
   */
  static displayAuthStatus(isAuthenticated: boolean, email?: string): void {
    if (isAuthenticated && email) {
      console.log(`Authentication: ${chalk.green(`Logged in as ${email}`)}`);
    } else {
      console.log(`Authentication: ${chalk.red('Not logged in')}`);
    }
  }

  /**
   * Handle authentication errors during operations
   */
  static handleAuthErrorDuringOperation(
    error: unknown,
    operation: string = 'operation'
  ): void {
    if (SpinnerErrorHandler.isAuthError(error)) {
      console.error(chalk.red(`\n🚫 Authentication failed during ${operation}!`));
      console.log(chalk.yellow('Your API token may have expired or been revoked.'));
      console.log(chalk.yellow('\n📝 To fix this:'));
      console.log(chalk.white('  1. Run: ') + chalk.green('roiai cc login'));
      console.log(chalk.white('  2. Enter your credentials'));
      console.log(chalk.white('  3. Try the push command again'));
      console.log(chalk.dim('\nIf you don\'t have an account yet, create one at ') + chalk.cyan('https://roiAI.fyi'));
      process.exit(1);
    }
  }
}