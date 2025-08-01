import chalk from 'chalk';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

class Logger {
  private level: LogLevel = LogLevel.INFO;

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(...args: any[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.log(chalk.gray('[DEBUG]'), ...args);
    }
  }

  info(...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      console.log(chalk.blue('[INFO]'), ...args);
    }
  }

  warn(...args: any[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(chalk.yellow('[WARN]'), ...args);
    }
  }

  error(...args: any[]): void {
    if (this.level <= LogLevel.ERROR) {
      // Filter out error stack traces unless in debug mode
      const filteredArgs = args.map(arg => {
        if (arg instanceof Error && this.level > LogLevel.DEBUG) {
          return arg.message;
        }
        return arg;
      });
      console.error(chalk.red('[ERROR]'), ...filteredArgs);
    }
  }

  success(...args: any[]): void {
    console.log(chalk.green('✓'), ...args);
  }

  fail(...args: any[]): void {
    console.log(chalk.red('✗'), ...args);
  }
}

export const logger = new Logger();