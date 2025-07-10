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

  /**
   * Display a link or action with cyan color
   */
  static link(message: string): void {
    console.log(chalk.cyan(message));
  }

  /**
   * Display a success message with green color
   */
  static success(message: string): void {
    console.log(chalk.green(`✓ ${message}`));
  }

  /**
   * Display an error message with red color
   */
  static error(message: string): void {
    console.log(chalk.red(`✗ ${message}`));
  }

  /**
   * Display a section header
   */
  static section(title: string): void {
    console.log(chalk.bold(`\n${title}`));
  }

  /**
   * Display a tip with lightbulb emoji
   */
  static tip(message: string): void {
    console.log(chalk.dim(`💡 ${message}`));
  }

  /**
   * Display results with success and failure counts
   */
  static results(successCount: number, failedCount: number, total: number): void {
    if (successCount > 0) {
      console.log(chalk.green(`✓ ${successCount.toLocaleString()} succeeded`));
    }
    if (failedCount > 0) {
      console.log(chalk.red(`✗ ${failedCount.toLocaleString()} failed`));
    }
    if (successCount === total) {
      console.log(chalk.dim(`\nAll ${total.toLocaleString()} items processed successfully`));
    }
  }

  /**
   * Display a formatted list
   */
  static list(items: string[], indent: number = 2): void {
    const prefix = ' '.repeat(indent);
    items.forEach(item => {
      console.log(`${prefix}• ${item}`);
    });
  }

  /**
   * Display next steps or instructions
   */
  static nextSteps(steps: string[]): void {
    console.log(chalk.bold('\nNext steps:'));
    this.list(steps);
  }

  /**
   * Display a separator line
   */
  static separator(): void {
    console.log(chalk.dim('─'.repeat(50)));
  }
}