import chalk from 'chalk';
import Table from 'cli-table3';
import { ConfigHelper } from './config-helper';

export interface TableColumn {
  header: string;
  key: string;
  formatter?: (value: any) => string;
  align?: 'left' | 'center' | 'right';
}

export class DisplayUtils {
  /**
   * Format success message with emoji and color
   */
  static success(message: string): string {
    return chalk.green(`✅ ${message}`);
  }
  
  /**
   * Format error message with emoji and color
   */
  static error(message: string): string {
    return chalk.red(`❌ ${message}`);
  }
  
  /**
   * Format info message with emoji and color
   */
  static info(message: string): string {
    return chalk.cyan(`ℹ️  ${message}`);
  }
  
  /**
   * Format warning message with emoji and color
   */
  static warning(message: string): string {
    return chalk.yellow(`⚠️  ${message}`);
  }

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
   * Format a percentage with optional color
   */
  static formatPercentage(
    value: number,
    options: {
      decimals?: number;
      showSign?: boolean;
      colorThresholds?: {
        good?: number;
        warning?: number;
      };
    } = {}
  ): string {
    const { decimals = 1, showSign = false, colorThresholds } = options;
    
    const formatted = `${showSign && value > 0 ? '+' : ''}${value.toFixed(decimals)}%`;
    
    if (colorThresholds) {
      if (colorThresholds.good !== undefined && value >= colorThresholds.good) {
        return chalk.green(formatted);
      } else if (colorThresholds.warning !== undefined && value >= colorThresholds.warning) {
        return chalk.yellow(formatted);
      } else {
        return chalk.red(formatted);
      }
    }
    
    return formatted;
  }

  /**
   * Format bytes to human-readable format
   */
  static formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = ConfigHelper.getDisplay().bytesBase || 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ConfigHelper.getDisplay().units?.bytes || ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  /**
   * Format duration in milliseconds to human-readable format
   */
  static formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
  }

  /**
   * Create a formatted table
   */
  static createTable(
    data: Record<string, any>[],
    columns: TableColumn[],
    options: {
      showIndex?: boolean;
      compact?: boolean;
    } = {}
  ): string {
    const { showIndex = false, compact = false } = options;
    
    const headers = columns.map(col => col.header);
    if (showIndex) {
      headers.unshift('#');
    }
    
    const table = new Table({
      head: headers,
      style: compact ? { compact: true } : undefined,
      colAligns: columns.map(col => col.align || 'left') as any,
    });
    
    data.forEach((row, index) => {
      const values = columns.map(col => {
        const value = row[col.key];
        return col.formatter ? col.formatter(value) : value?.toString() || '';
      });
      
      if (showIndex) {
        values.unshift((index + 1).toString());
      }
      
      table.push(values);
    });
    
    return table.toString();
  }

  /**
   * Display a separator line
   */
  static separator(width: number = 40, char: string = '━'): string {
    return chalk.gray(char.repeat(width));
  }

  /**
   * Display a section header
   */
  static sectionHeader(title: string, emoji?: string): void {
    console.log(chalk.bold(`\n${emoji ? emoji + ' ' : ''}${title}`));
    console.log(this.separator());
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