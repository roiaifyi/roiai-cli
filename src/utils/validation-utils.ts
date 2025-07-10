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
}