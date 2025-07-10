/**
 * Centralized error code handling for database and API errors
 */
export class ErrorCodeHandler {
  /**
   * Check if error is a Prisma unique constraint violation
   */
  static isUniqueConstraintError(error: any): boolean {
    return error?.code === 'P2002';
  }

  /**
   * Check if error is a Prisma record not found error
   */
  static isRecordNotFoundError(error: any): boolean {
    return error?.code === 'P2025';
  }

  /**
   * Check if error is a Prisma foreign key constraint error
   */
  static isForeignKeyError(error: any): boolean {
    return error?.code === 'P2003';
  }

  /**
   * Check if error is a database connection error
   */
  static isDatabaseConnectionError(error: any): boolean {
    return error?.code === 'P1001' || error?.code === 'P1002';
  }

  /**
   * Get user-friendly message for Prisma errors
   */
  static getPrismaErrorMessage(error: any): string {
    switch (error?.code) {
      case 'P2002':
        return 'This record already exists (unique constraint violation)';
      case 'P2025':
        return 'Record not found';
      case 'P2003':
        return 'Referenced record does not exist';
      case 'P1001':
        return 'Cannot connect to the database';
      case 'P1002':
        return 'Database connection timed out';
      default:
        return error?.message || 'Database operation failed';
    }
  }

  /**
   * Check if error is an authentication error
   */
  static isAuthError(error: any): boolean {
    return error?.code?.startsWith('AUTH_') || 
           error?.statusCode === 401 || 
           error?.statusCode === 403;
  }

  /**
   * Check if error is a validation error
   */
  static isValidationError(error: any): boolean {
    return error?.code?.startsWith('VAL_') || 
           error?.statusCode === 400;
  }

  /**
   * Check if error is a network error
   */
  static isNetworkError(error: any): boolean {
    return error?.code === 'NETWORK_ERROR' ||
           error?.code === 'ECONNREFUSED' ||
           error?.code === 'ETIMEDOUT' ||
           error?.code === 'ENOTFOUND';
  }
}