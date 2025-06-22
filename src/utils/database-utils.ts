import { PrismaClient } from '@prisma/client';
import { v5 as uuidv5 } from 'uuid';

export class DatabaseUtils {
  private static readonly UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
  
  /**
   * Upsert a user with consistent UUID generation
   */
  static async upsertUser(
    prisma: PrismaClient,
    userId: string,
    email?: string,
    username?: string
  ) {
    const uuid = uuidv5(userId, this.UUID_NAMESPACE);
    
    return prisma.user.upsert({
      where: { id: uuid },
      update: {
        email: email || undefined,
        username: username || undefined,
      },
      create: {
        id: uuid,
        email: email || null,
        username: username || null,
      },
    });
  }

  /**
   * Upsert a machine record
   */
  static async upsertMachine(
    prisma: PrismaClient,
    machineId: string,
    userId: string,
    machineName?: string,
    osInfo?: string
  ) {
    return prisma.machine.upsert({
      where: { id: machineId },
      update: {
        machineName: machineName || undefined,
        osInfo: osInfo || undefined,
      },
      create: {
        id: machineId,
        userId: userId,
        machineName: machineName || null,
        osInfo: osInfo || null,
      },
    });
  }

  /**
   * Get user ID as UUID, handling both UUID and non-UUID formats
   */
  static getUserUuid(userId: string): string {
    // Check if already a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(userId)) {
      return userId;
    }
    
    // Convert to UUID using namespace
    return uuidv5(userId, this.UUID_NAMESPACE);
  }

  /**
   * Batch update with retry logic
   */
  static async batchUpdateWithRetry<T>(
    operation: () => Promise<T>,
    fallbackOperation: () => Promise<T>,
    onError?: (error: unknown) => void
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (onError) {
        onError(error);
      }
      return await fallbackOperation();
    }
  }

  /**
   * Check if error is a unique constraint violation
   */
  static isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Error && 
           error.message.includes('Unique constraint failed');
  }

  /**
   * Check if error is a foreign key constraint violation
   */
  static isForeignKeyConstraintError(error: unknown): boolean {
    return error instanceof Error && 
           error.message.includes('Foreign key constraint failed');
  }
}