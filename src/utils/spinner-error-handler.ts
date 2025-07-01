import { Ora } from 'ora';
import chalk from 'chalk';
import { logger } from './logger';
import { ConfigHelper } from './config-helper';

export class SpinnerErrorHandler {
  /**
   * Extract error message from unknown error type
   */
  static getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }

  /**
   * Handle error with spinner, log it, and optionally exit the process
   */
  static handleError(
    spinner: Ora,
    error: unknown,
    message?: string,
    options: {
      exit?: boolean;
      verbose?: boolean;
      exitCode?: number;
    } = {}
  ): void {
    const { exit = true, verbose = false, exitCode = 1 } = options;
    
    const errorMessage = SpinnerErrorHandler.getErrorMessage(error);
    const finalMessage = message || `Operation failed: ${errorMessage}`;
    
    spinner.fail(finalMessage);
    logger.error(finalMessage, error);
    
    if (verbose && error instanceof Error && error.stack) {
      logger.error(chalk.red('\nError details:'), error.stack);
    }
    
    if (exit) {
      process.exit(exitCode);
    }
  }

  /**
   * Handle authentication errors specifically
   */
  static handleAuthError(spinner: Ora, error?: unknown): void {
    spinner.fail('Authentication failed');
    logger.info(chalk.yellow('\nPlease check your API token and try again.'));
    logger.info(chalk.yellow('You may need to run \'roiai cc login\' to refresh your credentials.'));
    
    if (error) {
      logger.error('Authentication error', error);
    }
    
    process.exit(1);
  }

  /**
   * Handle network errors
   */
  static handleNetworkError(spinner: Ora, error: unknown): void {
    const errorMessage = SpinnerErrorHandler.getErrorMessage(error);
    spinner.fail(`Network error: ${errorMessage}`);
    logger.info(chalk.yellow('\nPlease check your internet connection and try again.'));
    logger.error('Network error', error);
  }

  /**
   * Check if error is an authentication error
   */
  static isAuthError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    
    const authErrorPatterns = ConfigHelper.getErrorPatterns().auth;
    
    return authErrorPatterns.some((pattern: string) => 
      error.message.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Check if error is a network error
   */
  static isNetworkError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    
    const networkErrorPatterns = ConfigHelper.getErrorPatterns().network;
    
    return networkErrorPatterns.some((pattern: string) => 
      error.message.toLowerCase().includes(pattern.toLowerCase())
    );
  }
}