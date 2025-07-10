import chalk from 'chalk';

export class DisplayUtils {
  /**
   * Format a number with color based on its context
   */
  static formatNumber(
    value: number,
    context?: 'success' | 'error' | 'warning' | 'info'
  ): string {
    const formatted = value.toLocaleString();
    
    switch (context) {
      case 'success':
        return chalk.green(formatted);
      case 'error':
        return chalk.red(formatted);
      case 'warning':
        return chalk.yellow(formatted);
      case 'info':
        return chalk.blue(formatted);
      default:
        return formatted;
    }
  }

  /**
   * Display a section header
   */
  static sectionHeader(title: string, emoji?: string): void {
    console.log(chalk.bold(`\n${emoji ? emoji + ' ' : ''}${title}`));
    console.log(chalk.gray('━'.repeat(40)));
  }

  /**
   * Display key-value pairs in a consistent format
   */
  static displayKeyValue(
    data: Record<string, any>,
    options: {
      indent?: number;
      colorKeys?: boolean;
      formatters?: Record<string, (value: any) => string>;
    } = {}
  ): void {
    const { indent = 2, colorKeys = false, formatters = {} } = options;
    const indentStr = ' '.repeat(indent);
    
    Object.entries(data).forEach(([key, value]) => {
      const formattedKey = colorKeys ? chalk.gray(key + ':') : key + ':';
      const formattedValue = formatters[key] ? formatters[key](value) : value;
      console.log(`${indentStr}${formattedKey} ${formattedValue}`);
    });
  }
}