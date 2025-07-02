/**
 * Utility for formatting API errors with helpful context
 */

import chalk from 'chalk';
import type { ErrorCode, SyncErrorCode } from '../generated/api-client';

export class ErrorFormatter {
  /**
   * Get user-friendly message for error codes
   */
  static getErrorMessage(code: ErrorCode | SyncErrorCode | string): string {
    switch (code) {
      // Authentication errors
      case 'AUTH_001':
        return 'Invalid credentials. Please check your email/username and password.';
      case 'AUTH_002':
        return 'Your session has expired. Please login again.';
      case 'AUTH_003':
        return 'Invalid authentication token. Please login again.';
      case 'AUTH_004':
        return 'You are not authorized to perform this action.';
      
      // Validation errors
      case 'VAL_001':
        return 'Invalid input provided.';
      case 'VAL_002':
        return 'Required field is missing.';
      case 'VAL_003':
        return 'Invalid format provided.';
      
      // Database errors
      case 'DB_001':
        return 'A database error occurred. Please try again.';
      case 'DB_002':
        return 'The requested resource was not found.';
      case 'DB_003':
        return 'This entry already exists.';
      
      // Rate limit errors
      case 'RATE_001':
        return 'You have exceeded the rate limit. Please wait a moment before trying again.';
      
      // Server errors
      case 'SRV_001':
        return 'An internal server error occurred. Please try again later.';
      case 'SRV_002':
        return 'This feature is not yet implemented.';
      
      // Sync errors
      case 'SYNC_001':
        return 'Message validation failed. Check that your data is properly formatted.';
      case 'SYNC_002':
        return 'Failed to process messages. Try reducing the batch size.';
      case 'SYNC_003':
        return 'Machine not found. This might happen if you\'re pushing from a new machine.';
      case 'SYNC_004':
        return 'Project not found. Ensure the project path is correct.';
      case 'SYNC_005':
        return 'Session not found. The session might have been deleted or corrupted.';
      case 'SYNC_006':
        return 'Sync rate limit exceeded. Please wait before syncing again.';
      
      default:
        return `Error: ${code}`;
    }
  }

  /**
   * Get helpful tips for error codes
   */
  static getErrorTip(code: ErrorCode | SyncErrorCode | string): string | null {
    switch (code) {
      // Authentication errors
      case 'AUTH_001':
      case 'AUTH_002':
      case 'AUTH_003':
      case 'AUTH_004':
        return 'Run \'roiai cc login\' to authenticate again.';
      
      // Validation errors
      case 'VAL_001':
      case 'VAL_002':
      case 'VAL_003':
        return 'Check your input and try again.';
      
      // Database errors
      case 'DB_001':
        return 'If this persists, please contact support.';
      case 'DB_003':
        return 'Try using a different identifier.';
      
      // Rate limit errors
      case 'RATE_001':
      case 'SYNC_006':
        return 'Wait a few minutes before trying again, or use a smaller batch size.';
      
      // Server errors
      case 'SRV_001':
        return 'The server is experiencing issues. Please try again later.';
      
      // Sync errors
      case 'SYNC_001':
        return 'Review your data format and try again.';
      case 'SYNC_002':
        return 'Try using the --batch-size option with a smaller value.';
      case 'SYNC_003':
        return 'The server will create the machine on the next successful push.';
      case 'SYNC_004':
        return 'Make sure you\'re in the correct project directory.';
      case 'SYNC_005':
        return 'Try running \'roiai cc sync\' to refresh your local data.';
      
      default:
        return null;
    }
  }

  /**
   * Format error with code and tip
   */
  static formatError(code: string, message: string): string {
    const friendlyMessage = this.getErrorMessage(code);
    const tip = this.getErrorTip(code);
    
    let formatted = friendlyMessage !== `Error: ${code}` 
      ? friendlyMessage 
      : message || friendlyMessage;
    
    if (tip) {
      formatted += `\n${chalk.dim(`💡 ${tip}`)}`;
    }
    
    return formatted;
  }

  /**
   * Format validation errors nicely
   */
  static formatValidationErrors(errors: Record<string, string>): string {
    const errorLines = Object.entries(errors)
      .map(([field, message]) => `  • ${field}: ${message}`)
      .join('\n');
    
    return `Validation errors:\n${errorLines}`;
  }
}