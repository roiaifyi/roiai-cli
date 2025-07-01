/**
 * Common validation utilities to reduce code duplication
 */
export class ValidationUtils {
  /**
   * Validates that a value is not null or undefined
   * @param value The value to validate
   * @param errorMessage The error message to throw if validation fails
   * @throws Error if value is null or undefined
   */
  static requireNonNull<T>(value: T | null | undefined, errorMessage: string): T {
    if (value === null || value === undefined) {
      throw new Error(errorMessage);
    }
    return value;
  }

  /**
   * Validates that a string is not empty or whitespace
   * @param value The string to validate
   * @param errorMessage The error message to throw if validation fails
   * @throws Error if string is empty or whitespace
   */
  static requireNonEmpty(value: string | null | undefined, errorMessage: string): string {
    const nonNullValue = this.requireNonNull(value, errorMessage);
    if (nonNullValue.trim().length === 0) {
      throw new Error(errorMessage);
    }
    return nonNullValue;
  }

  /**
   * Validates that a number is positive
   * @param value The number to validate
   * @param errorMessage The error message to throw if validation fails
   * @throws Error if number is not positive
   */
  static requirePositive(value: number, errorMessage: string): number {
    if (value <= 0) {
      throw new Error(errorMessage);
    }
    return value;
  }

  /**
   * Validates that an array is not empty
   * @param array The array to validate
   * @param errorMessage The error message to throw if validation fails
   * @throws Error if array is empty
   */
  static requireNonEmptyArray<T>(array: T[] | null | undefined, errorMessage: string): T[] {
    const nonNullArray = this.requireNonNull(array, errorMessage);
    if (nonNullArray.length === 0) {
      throw new Error(errorMessage);
    }
    return nonNullArray;
  }
}