import { Ora } from 'ora';
import chalk from 'chalk';
import { UserService } from '../services/user.service';
import { SpinnerErrorHandler } from './spinner-error-handler';
import { logger } from './logger';

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
      const message = customErrorMessage || 'Please login first using \'roiai cc login\' to push data';
      spinner.fail(message);
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
      logger.info(`Authentication: ${chalk.green(`Logged in as ${email}`)}`);
    } else {
      logger.info(`Authentication: ${chalk.red('Not logged in')}`);
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
      logger.error(chalk.red(`\n🚫 Authentication failed during ${operation}!`));
      logger.info(chalk.yellow('Your API token may have expired or been revoked.'));
      logger.info(chalk.yellow('Please run \'roiai cc login\' to refresh your credentials and try again.'));
      process.exit(1);
    }
  }
}