/**
 * Common formatting utilities to reduce code duplication
 */
export class FormatterUtils {
  /**
   * Formats a percentage with configurable decimal places
   * @param value The numerator
   * @param total The denominator
   * @param decimals Number of decimal places (default: 1)
   * @returns Formatted percentage string without % symbol
   */
  static formatPercentage(value: number, total: number, decimals: number = 1): string {
    if (total === 0) return '0';
    return ((value / total) * 100).toFixed(decimals);
  }

  /**
   * Formats a currency value
   * @param value The value to format
   * @param decimals Number of decimal places (default: 4)
   * @param symbol Currency symbol (default: '$')
   * @returns Formatted currency string
   */
  static formatCurrency(value: number, decimals: number = 4, symbol: string = '$'): string {
    return `${symbol}${value.toFixed(decimals)}`;
  }

  /**
   * Formats a duration in seconds
   * @param seconds The duration in seconds
   * @param decimals Number of decimal places (default: 2)
   * @returns Formatted duration string
   */
  static formatSeconds(seconds: number, decimals: number = 2): string {
    return `${seconds.toFixed(decimals)}s`;
  }

  /**
   * Extracts error message from unknown error type
   * @param error The error object
   * @returns Error message string
   */
  static getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error';
  }

  /**
   * Formats a number with thousands separator
   * @param value The number to format
   * @returns Formatted number string
   */
  static formatNumber(value: number): string {
    return value.toLocaleString();
  }
}