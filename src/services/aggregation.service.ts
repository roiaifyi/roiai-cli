import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import { ConfigHelper } from '../utils/config-helper';

export class AggregationService {
  constructor(private prisma: PrismaClient) {}
  async recalculateAllAggregates(): Promise<void> {
    logger.info('🔄 Recalculating all aggregates...');
    
    // Process aggregates in parallel for better performance
    await Promise.all([
      this.recalculateSessionAggregates(),
      this.recalculateProjectAggregates(),
      this.recalculateMachineAggregates(),
      this.recalculateUserAggregates()
    ]);
    
    logger.info('✅ Aggregates recalculated successfully');
  }

  private async recalculateSessionAggregates(): Promise<void> {
    logger.info('  📊 Recalculating session aggregates...');
    
    // Get aggregated data for all sessions at once
    const sessionAggregates = await this.prisma.message.groupBy({
      by: ['sessionId'],
      _count: {
        _all: true
      },
      _sum: {
        messageCost: true,
        inputTokens: true,
        outputTokens: true,
        cacheCreationTokens: true,
        cacheReadTokens: true
      }
    });

    // Batch update sessions using Promise.all for parallelism
    const BATCH_SIZE = ConfigHelper.getProcessing().aggregationBatchSize;
    for (let i = 0; i < sessionAggregates.length; i += BATCH_SIZE) {
      const batch = sessionAggregates.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(agg =>
          this.prisma.session.update({
            where: { id: agg.sessionId },
            data: {
              totalMessages: BigInt(agg._count._all),
              totalCost: agg._sum.messageCost || new Prisma.Decimal(0),
              totalInputTokens: agg._sum.inputTokens || 0n,
              totalOutputTokens: agg._sum.outputTokens || 0n,
              totalCacheCreationTokens: agg._sum.cacheCreationTokens || 0n,
              totalCacheReadTokens: agg._sum.cacheReadTokens || 0n
            }
          })
        )
      );
    }
  }

  private async recalculateProjectAggregates(): Promise<void> {
    logger.info('  📊 Recalculating project aggregates...');
    
    // Get session counts per project
    const sessionCounts = await this.prisma.session.groupBy({
      by: ['projectId'],
      _count: {
        _all: true
      }
    });

    // Get message aggregates per project
    const projectAggregates = await this.prisma.message.groupBy({
      by: ['projectId'],
      _count: {
        _all: true
      },
      _sum: {
        messageCost: true,
        inputTokens: true,
        outputTokens: true,
        cacheCreationTokens: true,
        cacheReadTokens: true
      }
    });

    // Create a map of session counts
    const sessionCountMap = new Map(
      sessionCounts.map((s: any) => [s.projectId, s._count._all])
    );

    // Batch update projects
    const BATCH_SIZE = ConfigHelper.getProcessing().aggregationBatchSize;
    for (let i = 0; i < projectAggregates.length; i += BATCH_SIZE) {
      const batch = projectAggregates.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(agg =>
          this.prisma.project.update({
            where: { id: agg.projectId },
            data: {
              totalSessions: sessionCountMap.get(agg.projectId) || 0,
              totalMessages: BigInt(agg._count._all),
              totalCost: agg._sum.messageCost || new Prisma.Decimal(0),
              totalInputTokens: agg._sum.inputTokens || 0n,
              totalOutputTokens: agg._sum.outputTokens || 0n,
              totalCacheCreationTokens: agg._sum.cacheCreationTokens || 0n,
              totalCacheReadTokens: agg._sum.cacheReadTokens || 0n
            }
          })
        )
      );
    }
  }

  private async recalculateMachineAggregates(): Promise<void> {
    logger.info('  📊 Recalculating machine aggregates...');
    
    // Get counts
    const projectCounts = await this.prisma.project.groupBy({
      by: ['clientMachineId'],
      _count: { _all: true }
    });

    const sessionCounts = await this.prisma.session.groupBy({
      by: ['clientMachineId'],
      _count: { _all: true }
    });

    // Get message aggregates
    const machineAggregates = await this.prisma.message.groupBy({
      by: ['clientMachineId'],
      _count: {
        _all: true
      },
      _sum: {
        messageCost: true,
        inputTokens: true,
        outputTokens: true,
        cacheCreationTokens: true,
        cacheReadTokens: true
      }
    });

    // Create maps
    const projectCountMap = new Map(
      projectCounts.map((p: any) => [p.clientMachineId, p._count._all])
    );
    const sessionCountMap = new Map(
      sessionCounts.map((s: any) => [s.clientMachineId, s._count._all])
    );

    // Batch update machines
    const BATCH_SIZE = ConfigHelper.getProcessing().aggregationBatchSize;
    for (let i = 0; i < machineAggregates.length; i += BATCH_SIZE) {
      const batch = machineAggregates.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(agg =>
          this.prisma.machine.update({
            where: { id: agg.clientMachineId },
            data: {
              totalProjects: projectCountMap.get(agg.clientMachineId) || 0,
              totalSessions: sessionCountMap.get(agg.clientMachineId) || 0,
              totalMessages: BigInt(agg._count._all),
              totalCost: agg._sum.messageCost || new Prisma.Decimal(0),
              totalInputTokens: agg._sum.inputTokens || 0n,
              totalOutputTokens: agg._sum.outputTokens || 0n,
              totalCacheCreationTokens: agg._sum.cacheCreationTokens || 0n,
              totalCacheReadTokens: agg._sum.cacheReadTokens || 0n
            }
          })
        )
      );
    }
  }

  private async recalculateUserAggregates(): Promise<void> {
    logger.info('  📊 Recalculating user aggregates...');
    
    // Get counts
    const projectCounts = await this.prisma.project.groupBy({
      by: ['userId'],
      _count: { _all: true }
    });

    const sessionCounts = await this.prisma.session.groupBy({
      by: ['userId'],
      _count: { _all: true }
    });

    // Get message aggregates
    const userAggregates = await this.prisma.message.groupBy({
      by: ['userId'],
      _count: {
        _all: true
      },
      _sum: {
        messageCost: true,
        inputTokens: true,
        outputTokens: true,
        cacheCreationTokens: true,
        cacheReadTokens: true
      }
    });

    // Create maps
    const projectCountMap = new Map(
      projectCounts.map((p: any) => [p.userId, p._count._all])
    );
    const sessionCountMap = new Map(
      sessionCounts.map((s: any) => [s.userId, s._count._all])
    );

    // Batch update users
    const BATCH_SIZE = ConfigHelper.getProcessing().aggregationBatchSize;
    for (let i = 0; i < userAggregates.length; i += BATCH_SIZE) {
      const batch = userAggregates.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(agg =>
          this.prisma.user.update({
            where: { id: agg.userId },
            data: {
              totalProjects: projectCountMap.get(agg.userId) || 0,
              totalSessions: sessionCountMap.get(agg.userId) || 0,
              totalMessages: BigInt(agg._count._all),
              totalCost: agg._sum.messageCost || new Prisma.Decimal(0),
              totalInputTokens: agg._sum.inputTokens || 0n,
              totalOutputTokens: agg._sum.outputTokens || 0n,
              totalCacheCreationTokens: agg._sum.cacheCreationTokens || 0n,
              totalCacheReadTokens: agg._sum.cacheReadTokens || 0n
            }
          })
        )
      );
    }
  }

  async verifyAggregates(): Promise<any> {
    logger.info('🔍 Verifying aggregates...');
    
    // Query the verification view created in the migration
    const result = await this.prisma.$queryRaw`
      SELECT 
        u.user_id,
        u.total_messages as stored_messages,
        COUNT(DISTINCT m.id) as actual_messages,
        u.total_sessions as stored_sessions,
        COUNT(DISTINCT s.session_id) as actual_sessions,
        u.total_projects as stored_projects,
        COUNT(DISTINCT p.project_id) as actual_projects,
        u.total_cost as stored_cost,
        COALESCE(SUM(m.message_cost), 0) as actual_cost,
        u.total_input_tokens as stored_input_tokens,
        COALESCE(SUM(m.input_tokens), 0) as actual_input_tokens,
        u.total_output_tokens as stored_output_tokens,
        COALESCE(SUM(m.output_tokens), 0) as actual_output_tokens
      FROM users u
      LEFT JOIN messages m ON u.user_id = m.user_id
      LEFT JOIN sessions s ON u.user_id = s.user_id
      LEFT JOIN projects p ON u.user_id = p.user_id
      GROUP BY u.user_id;
    `;
    
    return result;
  }

  async getUsageByProject() {
    return await this.prisma.project.findMany({
      select: {
        projectName: true,
        totalMessages: true,
        totalCost: true,
        totalInputTokens: true,
        totalOutputTokens: true,
        totalCacheCreationTokens: true,
        totalCacheReadTokens: true
      },
      orderBy: { totalCost: 'desc' }
    }).then(projects => projects.map(p => ({
      projectName: p.projectName,
      messageCount: p.totalMessages,
      totalCost: p.totalCost.toNumber(),
      inputTokens: p.totalInputTokens,
      outputTokens: p.totalOutputTokens,
      cacheCreationInputTokens: p.totalCacheCreationTokens,
      cacheReadInputTokens: p.totalCacheReadTokens
    })));
  }

  async getUsageByUser() {
    return await this.prisma.user.findMany({
      select: {
        email: true,
        totalMessages: true,
        totalCost: true,
        totalInputTokens: true,
        totalOutputTokens: true,
        totalCacheCreationTokens: true,
        totalCacheReadTokens: true
      },
      orderBy: { totalCost: 'desc' }
    }).then(users => users.map(u => ({
      userName: u.email || 'Unknown',
      messageCount: u.totalMessages,
      totalCost: u.totalCost.toNumber(),
      inputTokens: u.totalInputTokens,
      outputTokens: u.totalOutputTokens,
      cacheCreationInputTokens: u.totalCacheCreationTokens,
      cacheReadInputTokens: u.totalCacheReadTokens
    })));
  }

  async getDailyUsage(startDate: Date, endDate: Date) {
    const messages = await this.prisma.message.groupBy({
      by: ['timestamp'],
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate
        }
      },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cacheCreationTokens: true,
        cacheReadTokens: true,
        messageCost: true
      },
      _count: {
        id: true
      }
    });

    return messages.map(day => ({
      date: day.timestamp ? day.timestamp.toISOString().split('T')[0] : 'Unknown',
      messageCount: day._count?.id || 0,
      inputTokens: day._sum?.inputTokens || 0,
      outputTokens: day._sum?.outputTokens || 0,
      cacheCreationInputTokens: day._sum?.cacheCreationTokens || 0,
      cacheReadInputTokens: day._sum?.cacheReadTokens || 0,
      totalCost: day._sum?.messageCost?.toNumber() || 0
    }));
  }

  async getUsageByModel() {
    const models = await this.prisma.message.groupBy({
      by: ['model'],
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cacheCreationTokens: true,
        cacheReadTokens: true,
        messageCost: true
      },
      _count: {
        id: true
      }
    });

    return models.map(m => ({
      model: m.model,
      messageCount: m._count?.id || 0,
      inputTokens: m._sum?.inputTokens || 0,
      outputTokens: m._sum?.outputTokens || 0,
      cacheCreationInputTokens: m._sum?.cacheCreationTokens || 0,
      cacheReadInputTokens: m._sum?.cacheReadTokens || 0,
      totalCost: m._sum?.messageCost?.toNumber() || 0
    }));
  }

  async getTotalUsage() {
    const totals = await this.prisma.message.aggregate({
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cacheCreationTokens: true,
        cacheReadTokens: true,
        messageCost: true
      },
      _count: {
        id: true
      }
    });

    const uniqueCounts = await Promise.all([
      this.prisma.user.count(),
      this.prisma.project.count(),
      this.prisma.session.count()
    ]);

    return {
      totalMessages: totals._count?.id || 0,
      totalInputTokens: totals._sum?.inputTokens || 0,
      totalOutputTokens: totals._sum?.outputTokens || 0,
      totalCacheCreationTokens: totals._sum?.cacheCreationTokens || 0,
      totalCacheReadTokens: totals._sum?.cacheReadTokens || 0,
      totalCost: totals._sum?.messageCost?.toNumber() || 0,
      uniqueUsers: uniqueCounts[0],
      uniqueProjects: uniqueCounts[1],
      uniqueSessions: uniqueCounts[2]
    };
  }
}