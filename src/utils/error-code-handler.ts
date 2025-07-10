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
}