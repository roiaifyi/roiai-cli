import { Ora } from 'ora';
import { COMMAND_STRINGS } from './constants';
import { logger } from './logger';

export class ErrorHandler {
  static handleCommandError(error: unknown, spinner?: Ora, exitCode: number = 1): never {
    const message = error instanceof Error ? error.message : COMMAND_STRINGS.MESSAGES.UNKNOWN_ERROR;
    
    if (spinner) {
      spinner.fail(`${COMMAND_STRINGS.MESSAGES.OPERATION_FAILED}: ${message}`);
    } else {
      logger.error(`${COMMAND_STRINGS.MESSAGES.OPERATION_FAILED}: ${message}`);
    }
    
    process.exit(exitCode);
  }

  static handleAsyncError(error: unknown, context: string = 'Operation'): never {
    const message = error instanceof Error ? error.message : COMMAND_STRINGS.MESSAGES.UNKNOWN_ERROR;
    logger.error(`${context} failed: ${message}`);
    process.exit(1);
  }

  static createAuthenticationError(): Error {
    return new Error(COMMAND_STRINGS.MESSAGES.LOGIN_REQUIRED);
  }

  static createNetworkError(originalError?: unknown): Error {
    const originalMessage = originalError instanceof Error ? originalError.message : '';
    return new Error(`${COMMAND_STRINGS.MESSAGES.NETWORK_ERROR}: ${originalMessage}`);
  }
}