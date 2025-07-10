import { PrismaClient } from '@prisma/client';

/**
 * Helper class for common database query patterns
 */
export class QueryHelper {
  /**
   * Get message count with optional filtering
   */
  static async getMessageCount(
    prisma: PrismaClient,
    where?: {
      userId?: string;
      machineId?: string;
      projectId?: string;
      sessionId?: string;
      syncStatus?: {
        syncedAt?: null | { not: null };
      };
    }
  ): Promise<number> {
    return await prisma.message.count({ where });
  }

  /**
   * Get unsynced message count
   */
  static async getUnsyncedMessageCount(prisma: PrismaClient): Promise<number> {
    return await this.getMessageCount(prisma, {
      syncStatus: { syncedAt: null }
    });
  }

  /**
   * Get retry distribution for sync status
   */
  static async getRetryDistribution(prisma: PrismaClient) {
    return await prisma.messageSyncStatus.groupBy({
      by: ['retryCount'],
      where: { syncedAt: null },
      _count: true,
      orderBy: { retryCount: 'asc' },
    });
  }

}