import { prisma } from '../database';
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

type TransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export class IncrementalAggregationService {
  /**
   * Update aggregates when a new message is created
   * This should be called within the same transaction as message creation
   */
  async onMessageCreated(
    message: {
      sessionId: string;
      projectId: string;
      userId: string;
      inputTokens: number;
      outputTokens: number;
      cacheCreationTokens: number;
      cacheReadTokens: number;
      messageCost: Decimal;
    },
    tx?: TransactionClient
  ): Promise<void> {
    const client = tx || prisma;

    // Update session aggregates
    await client.session.update({
      where: { id: message.sessionId },
      data: {
        totalMessages: { increment: 1 },
        totalCost: { increment: message.messageCost },
        totalInputTokens: { increment: message.inputTokens },
        totalOutputTokens: { increment: message.outputTokens },
        totalCacheCreationTokens: { increment: message.cacheCreationTokens },
        totalCacheReadTokens: { increment: message.cacheReadTokens }
      }
    });

    // Update project aggregates
    await client.project.update({
      where: { id: message.projectId },
      data: {
        totalMessages: { increment: 1 },
        totalCost: { increment: message.messageCost },
        totalInputTokens: { increment: message.inputTokens },
        totalOutputTokens: { increment: message.outputTokens },
        totalCacheCreationTokens: { increment: message.cacheCreationTokens },
        totalCacheReadTokens: { increment: message.cacheReadTokens }
      }
    });

    // Update user aggregates
    await client.user.update({
      where: { id: message.userId },
      data: {
        totalMessages: { increment: 1 },
        totalCost: { increment: message.messageCost },
        totalInputTokens: { increment: message.inputTokens },
        totalOutputTokens: { increment: message.outputTokens },
        totalCacheCreationTokens: { increment: message.cacheCreationTokens },
        totalCacheReadTokens: { increment: message.cacheReadTokens }
      }
    });
  }

  /**
   * Update aggregates when a new session is created
   */
  async onSessionCreated(
    session: {
      projectId: string;
      userId: string;
    },
    tx?: TransactionClient
  ): Promise<void> {
    const client = tx || prisma;

    // Update project session count
    await client.project.update({
      where: { id: session.projectId },
      data: {
        totalSessions: { increment: 1 }
      }
    });

    // Update user session count
    await client.user.update({
      where: { id: session.userId },
      data: {
        totalSessions: { increment: 1 }
      }
    });
  }

  /**
   * Update aggregates when a new project is created
   */
  async onProjectCreated(
    project: {
      userId: string;
    },
    tx?: TransactionClient
  ): Promise<void> {
    const client = tx || prisma;

    // Update user project count
    await client.user.update({
      where: { id: project.userId },
      data: {
        totalProjects: { increment: 1 }
      }
    });
  }

  /**
   * Handle batch message creation with efficient aggregation
   */
  async onBatchMessagesCreated(
    messages: Array<{
      sessionId: string;
      projectId: string;
      userId: string;
      inputTokens: number;
      outputTokens: number;
      cacheCreationTokens: number;
      cacheReadTokens: number;
      messageCost: Decimal;
    }>,
    tx?: TransactionClient
  ): Promise<void> {
    const client = tx || prisma;

    // Group messages by session, project, and user for efficient updates
    const sessionAggregates = new Map<string, any>();
    const projectAggregates = new Map<string, any>();
    const userAggregates = new Map<string, any>();

    // Calculate aggregates
    for (const msg of messages) {
      // Session aggregates
      if (!sessionAggregates.has(msg.sessionId)) {
        sessionAggregates.set(msg.sessionId, {
          totalMessages: 0,
          totalCost: new Decimal(0),
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalCacheCreationTokens: 0,
          totalCacheReadTokens: 0
        });
      }
      const sessionAgg = sessionAggregates.get(msg.sessionId);
      sessionAgg.totalMessages++;
      sessionAgg.totalCost = sessionAgg.totalCost.add(msg.messageCost);
      sessionAgg.totalInputTokens += msg.inputTokens;
      sessionAgg.totalOutputTokens += msg.outputTokens;
      sessionAgg.totalCacheCreationTokens += msg.cacheCreationTokens;
      sessionAgg.totalCacheReadTokens += msg.cacheReadTokens;

      // Project aggregates
      if (!projectAggregates.has(msg.projectId)) {
        projectAggregates.set(msg.projectId, {
          totalMessages: 0,
          totalCost: new Decimal(0),
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalCacheCreationTokens: 0,
          totalCacheReadTokens: 0
        });
      }
      const projectAgg = projectAggregates.get(msg.projectId);
      projectAgg.totalMessages++;
      projectAgg.totalCost = projectAgg.totalCost.add(msg.messageCost);
      projectAgg.totalInputTokens += msg.inputTokens;
      projectAgg.totalOutputTokens += msg.outputTokens;
      projectAgg.totalCacheCreationTokens += msg.cacheCreationTokens;
      projectAgg.totalCacheReadTokens += msg.cacheReadTokens;

      // User aggregates
      if (!userAggregates.has(msg.userId)) {
        userAggregates.set(msg.userId, {
          totalMessages: 0,
          totalCost: new Decimal(0),
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalCacheCreationTokens: 0,
          totalCacheReadTokens: 0
        });
      }
      const userAgg = userAggregates.get(msg.userId);
      userAgg.totalMessages++;
      userAgg.totalCost = userAgg.totalCost.add(msg.messageCost);
      userAgg.totalInputTokens += msg.inputTokens;
      userAgg.totalOutputTokens += msg.outputTokens;
      userAgg.totalCacheCreationTokens += msg.cacheCreationTokens;
      userAgg.totalCacheReadTokens += msg.cacheReadTokens;
    }

    // Update session aggregates
    for (const [sessionId, agg] of sessionAggregates) {
      await client.session.update({
        where: { id: sessionId },
        data: {
          totalMessages: { increment: agg.totalMessages },
          totalCost: { increment: agg.totalCost },
          totalInputTokens: { increment: agg.totalInputTokens },
          totalOutputTokens: { increment: agg.totalOutputTokens },
          totalCacheCreationTokens: { increment: agg.totalCacheCreationTokens },
          totalCacheReadTokens: { increment: agg.totalCacheReadTokens }
        }
      });
    }

    // Update project aggregates
    for (const [projectId, agg] of projectAggregates) {
      await client.project.update({
        where: { id: projectId },
        data: {
          totalMessages: { increment: agg.totalMessages },
          totalCost: { increment: agg.totalCost },
          totalInputTokens: { increment: agg.totalInputTokens },
          totalOutputTokens: { increment: agg.totalOutputTokens },
          totalCacheCreationTokens: { increment: agg.totalCacheCreationTokens },
          totalCacheReadTokens: { increment: agg.totalCacheReadTokens }
        }
      });
    }

    // Update user aggregates
    for (const [userId, agg] of userAggregates) {
      await client.user.update({
        where: { id: userId },
        data: {
          totalMessages: { increment: agg.totalMessages },
          totalCost: { increment: agg.totalCost },
          totalInputTokens: { increment: agg.totalInputTokens },
          totalOutputTokens: { increment: agg.totalOutputTokens },
          totalCacheCreationTokens: { increment: agg.totalCacheCreationTokens },
          totalCacheReadTokens: { increment: agg.totalCacheReadTokens }
        }
      });
    }
  }

  /**
   * Check if we should use incremental or full recalculation
   * Returns true if incremental updates should be used
   */
  async shouldUseIncremental(): Promise<boolean> {
    // Check if aggregates are already populated
    const user = await prisma.user.findFirst({
      select: {
        totalMessages: true,
        totalSessions: true,
        totalProjects: true
      }
    });

    // If no user or aggregates are all zero, we need full recalculation
    if (!user || (user.totalMessages === 0 && user.totalSessions === 0 && user.totalProjects === 0)) {
      return false;
    }

    return true;
  }
}