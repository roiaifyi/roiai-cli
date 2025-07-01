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
   * Get synced message count
   */
  static async getSyncedMessageCount(prisma: PrismaClient): Promise<number> {
    return await this.getMessageCount(prisma, {
      syncStatus: { syncedAt: { not: null } }
    });
  }

  /**
   * Get message group by with common aggregations
   */
  static async getMessageGroupBy<T extends Record<string, any>>(
    prisma: PrismaClient,
    options: {
      by: (keyof T)[];
      where?: any;
      having?: any;
      orderBy?: any;
      _count?: boolean;
      _sum?: Record<string, boolean>;
      _avg?: Record<string, boolean>;
      _min?: Record<string, boolean>;
      _max?: Record<string, boolean>;
    }
  ) {
    return await prisma.message.groupBy({
      ...options,
      _count: options._count !== false,
    } as any);
  }

  /**
   * Get message aggregates with common fields
   */
  static async getMessageAggregates(
    prisma: PrismaClient,
    where?: any
  ) {
    return await prisma.message.aggregate({
      where,
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cacheCreationTokens: true,
        cacheReadTokens: true,
      },
      _count: true,
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

  /**
   * Batch update sync status
   */
  static async batchUpdateSyncStatus(
    prisma: PrismaClient,
    messageIds: string[],
    update: {
      syncedAt?: Date | null;
      syncId?: string | null;
      syncResponse?: string | null;
      retryCount?: number;
    }
  ) {
    return await prisma.messageSyncStatus.updateMany({
      where: { messageId: { in: messageIds } },
      data: update,
    });
  }

  /**
   * Get messages with related entities
   */
  static async getMessagesWithEntities(
    prisma: PrismaClient,
    where: any,
    options?: {
      include?: {
        user?: boolean;
        project?: boolean;
        session?: boolean;
        machine?: boolean;
        syncStatus?: boolean;
      };
      take?: number;
      skip?: number;
      orderBy?: any;
    }
  ) {
    return await prisma.message.findMany({
      where,
      include: options?.include || {
        user: true,
        project: true,
        session: true,
        machine: true,
        syncStatus: true,
      },
      take: options?.take,
      skip: options?.skip,
      orderBy: options?.orderBy,
    });
  }
}