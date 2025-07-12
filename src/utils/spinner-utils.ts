import { Ora } from 'ora';

export class SpinnerUtils {
  static update(spinner: Ora | undefined, text: string): void {
    if (spinner) {
      spinner.text = text;
    }
  }

  static succeed(spinner: Ora | undefined, text?: string): void {
    if (spinner) {
      spinner.succeed(text);
    }
  }

  static fail(spinner: Ora | undefined, text?: string): void {
    if (spinner) {
      spinner.fail(text);
    }
  }

  static warn(spinner: Ora | undefined, text?: string): void {
    if (spinner) {
      spinner.warn(text);
    }
  }

  static info(spinner: Ora | undefined, text?: string): void {
    if (spinner) {
      spinner.info(text);
    }
  }

  static stop(spinner: Ora | undefined): void {
    if (spinner) {
      spinner.stop();
    }
  }

  static clear(spinner: Ora | undefined): void {
    if (spinner) {
      spinner.clear();
    }
  }
}