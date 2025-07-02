import chalk from 'chalk';
import { ConfigHelper } from './config-helper';

export class ProgressDisplay {
  private static get PROGRESS_BAR_WIDTH() {
    return ConfigHelper.getDisplay().progressBarWidth;
  }
  
  /**
   * Generate a progress bar string
   */
  static generateProgressBar(percent: number, width: number = this.PROGRESS_BAR_WIDTH): string {
    const display = ConfigHelper.getDisplay();
    const filledChar = display.progressBarFilled;
    const emptyChar = display.progressBarEmpty;
    const filled = Math.floor((percent / 100) * width);
    const empty = width - filled;
    return filledChar.repeat(filled) + emptyChar.repeat(empty);
  }

  /**
   * Format progress text with bar
   */
  static formatProgress(
    current: number,
    total: number,
    options: {
      label?: string;
      showPercentage?: boolean;
      showNumbers?: boolean;
      width?: number;
    } = {}
  ): string {
    const {
      label = 'Progress',
      showPercentage = true,
      showNumbers = true,
      width = this.PROGRESS_BAR_WIDTH
    } = options;
    
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    const progressBar = this.generateProgressBar(percent, width);
    
    let output = `[${progressBar}]`;
    
    if (showPercentage) {
      output += ` ${percent}%`;
    }
    
    if (label) {
      output += ` - ${label}`;
    }
    
    if (showNumbers) {
      output += ` (${current.toLocaleString()}/${total.toLocaleString()})`;
    }
    
    return output;
  }

  /**
   * Format batch progress
   */
  static formatBatchProgress(
    batchNumber: number,
    totalBatches: number,
    processedCount: number,
    totalCount: number,
    stats?: {
      pushed?: number;
      failed?: number;
    }
  ): string {
    const percent = totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;
    const progressBar = this.generateProgressBar(percent);
    
    let output = `[${progressBar}] ${percent}% - Batch ${batchNumber}/${totalBatches}`;
    
    if (stats) {
      output += ` (${stats.pushed || 0} pushed`;
      if (stats.failed) {
        output += `, ${stats.failed} failed`;
      }
      output += ')';
    }
    
    return output;
  }

  /**
   * Display statistics in a consistent format
   */
  static displayStats(
    stats: Record<string, number | string>,
    options: {
      title?: string;
      useColors?: boolean;
      compact?: boolean;
    } = {}
  ): void {
    const { title, useColors = true, compact = false } = options;
    
    if (title) {
      console.log(chalk.bold(`\n${title}`));
    }
    
    if (!compact) {
      const display = ConfigHelper.getDisplay();
      const separatorChar = display.separatorChar;
      const separatorWidth = display.separatorDefaultWidth;
      console.log(`  ${chalk.gray(separatorChar.repeat(separatorWidth))}`);
    }
    
    Object.entries(stats).forEach(([key, value]) => {
      const formattedKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
      let formattedValue = typeof value === 'number' ? value.toLocaleString() : value;
      
      if (useColors && typeof value === 'number') {
        if (key.toLowerCase().includes('success') || key.toLowerCase().includes('synced')) {
          formattedValue = chalk.green(formattedValue);
        } else if (key.toLowerCase().includes('fail') || key.toLowerCase().includes('error')) {
          formattedValue = chalk.red(formattedValue);
        } else if (key.toLowerCase().includes('pending') || key.toLowerCase().includes('unsynced')) {
          formattedValue = chalk.yellow(formattedValue);
        }
      }
      
      console.log(`  ${formattedKey}: ${formattedValue}`);
    });
    
    if (!compact) {
      const display = ConfigHelper.getDisplay();
      const separatorChar = display.separatorChar;
      const separatorWidth = display.separatorDefaultWidth;
      console.log(`  ${chalk.gray(separatorChar.repeat(separatorWidth))}`);
    }
  }

  /**
   * Display a compact summary
   */
  static displayCompactSummary(
    summary: {
      label: string;
      value: number | string;
      color?: 'green' | 'red' | 'yellow' | 'blue';
    }[]
  ): void {
    const parts = summary.map(item => {
      let value = typeof item.value === 'number' ? item.value.toLocaleString() : item.value;
      
      if (item.color) {
        value = chalk[item.color](value);
      }
      
      return `${item.label}: ${value}`;
    });
    
    console.log(parts.join(', '));
  }
}