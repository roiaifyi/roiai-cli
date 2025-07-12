/**
 * Utility for standardized console output formatting
 */

import chalk from 'chalk';

export class ConsoleOutput {
  /**
   * Display a warning message with yellow color
   */
  static warning(message: string): void {
    console.log(chalk.yellow(`\n⚠️  ${message}`));
  }

  /**
   * Display an info message with dim color
   */
  static info(message: string): void {
    console.log(chalk.dim(message));
  }
}