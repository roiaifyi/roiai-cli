import { Ora } from 'ora';

/**
 * Utility class for safe spinner operations.
 * Handles undefined spinner instances gracefully to prevent runtime errors.
 * 
 * @example
 * ```typescript
 * const spinner = ora('Processing...').start();
 * SpinnerUtils.update(spinner, 'Still processing...');
 * SpinnerUtils.succeed(spinner, 'Done!');
 * ```
 */
export class SpinnerUtils {
  /**
   * Update spinner text without changing its state
   */
  static update(spinner: Ora | undefined, text: string): void {
    if (spinner) {
      spinner.text = text;
    }
  }

  /**
   * Stop spinner and mark as succeeded with optional text
   */
  static succeed(spinner: Ora | undefined, text?: string): void {
    if (spinner) {
      spinner.succeed(text);
    }
  }

  /**
   * Stop spinner and mark as failed with optional text
   */
  static fail(spinner: Ora | undefined, text?: string): void {
    if (spinner) {
      spinner.fail(text);
    }
  }

  /**
   * Stop spinner and mark as warning with optional text
   */
  static warn(spinner: Ora | undefined, text?: string): void {
    if (spinner) {
      spinner.warn(text);
    }
  }

  /**
   * Stop spinner and mark as info with optional text
   */
  static info(spinner: Ora | undefined, text?: string): void {
    if (spinner) {
      spinner.info(text);
    }
  }

  /**
   * Stop spinner without any status indicator
   */
  static stop(spinner: Ora | undefined): void {
    if (spinner) {
      spinner.stop();
    }
  }

  /**
   * Clear spinner from the terminal
   */
  static clear(spinner: Ora | undefined): void {
    if (spinner) {
      spinner.clear();
    }
  }
}