import { prisma } from '../database';
import { Decimal } from '@prisma/client/runtime/library';

export class AggregationService {
  async recalculateAllAggregates(): Promise<void> {
    console.log('🔄 Recalculating all aggregates...');
    
    // Start a transaction to ensure consistency
    await prisma.$transaction(async (tx) => {
      // 1. Recalculate Session aggregates
      await this.recalculateSessionAggregates(tx);
      
      // 2. Recalculate Project aggregates
      await this.recalculateProjectAggregates(tx);
      
      // 3. Recalculate User aggregates
      await this.recalculateUserAggregates(tx);
    });
    
    console.log('✅ Aggregates recalculated successfully');
  }

  private async recalculateSessionAggregates(tx: any): Promise<void> {
    console.log('  📊 Recalculating session aggregates...');
    
    const sessions = await tx.session.findMany({
      include: {
        messages: true
      }
    });

    for (const session of sessions) {
      const aggregates = session.messages.reduce((acc: any, msg: any) => {
        acc.totalMessages++;
        acc.totalCost = acc.totalCost.add(new Decimal(msg.messageCost));
        acc.totalInputTokens += msg.inputTokens;
        acc.totalOutputTokens += msg.outputTokens;
        acc.totalCacheCreationTokens += msg.cacheCreationTokens;
        acc.totalCacheReadTokens += msg.cacheReadTokens;
        return acc;
      }, {
        totalMessages: 0,
        totalCost: new Decimal(0),
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheCreationTokens: 0,
        totalCacheReadTokens: 0
      });

      await tx.session.update({
        where: { id: session.id },
        data: {
          totalMessages: aggregates.totalMessages,
          totalCost: aggregates.totalCost,
          totalInputTokens: aggregates.totalInputTokens,
          totalOutputTokens: aggregates.totalOutputTokens,
          totalCacheCreationTokens: aggregates.totalCacheCreationTokens,
          totalCacheReadTokens: aggregates.totalCacheReadTokens
        }
      });
    }
  }

  private async recalculateProjectAggregates(tx: any): Promise<void> {
    console.log('  📊 Recalculating project aggregates...');
    
    const projects = await tx.project.findMany({
      include: {
        sessions: true,
        messages: true
      }
    });

    for (const project of projects) {
      const messageAggregates = project.messages.reduce((acc: any, msg: any) => {
        acc.totalMessages++;
        acc.totalCost = acc.totalCost.add(new Decimal(msg.messageCost));
        acc.totalInputTokens += msg.inputTokens;
        acc.totalOutputTokens += msg.outputTokens;
        acc.totalCacheCreationTokens += msg.cacheCreationTokens;
        acc.totalCacheReadTokens += msg.cacheReadTokens;
        return acc;
      }, {
        totalMessages: 0,
        totalCost: new Decimal(0),
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheCreationTokens: 0,
        totalCacheReadTokens: 0
      });

      await tx.project.update({
        where: { id: project.id },
        data: {
          totalSessions: project.sessions.length,
          totalMessages: messageAggregates.totalMessages,
          totalCost: messageAggregates.totalCost,
          totalInputTokens: messageAggregates.totalInputTokens,
          totalOutputTokens: messageAggregates.totalOutputTokens,
          totalCacheCreationTokens: messageAggregates.totalCacheCreationTokens,
          totalCacheReadTokens: messageAggregates.totalCacheReadTokens
        }
      });
    }
  }

  private async recalculateUserAggregates(tx: any): Promise<void> {
    console.log('  📊 Recalculating user aggregates...');
    
    const users = await tx.user.findMany({
      include: {
        projects: true,
        sessions: true,
        messages: true
      }
    });

    for (const user of users) {
      const messageAggregates = user.messages.reduce((acc: any, msg: any) => {
        acc.totalMessages++;
        acc.totalCost = acc.totalCost.add(new Decimal(msg.messageCost));
        acc.totalInputTokens += msg.inputTokens;
        acc.totalOutputTokens += msg.outputTokens;
        acc.totalCacheCreationTokens += msg.cacheCreationTokens;
        acc.totalCacheReadTokens += msg.cacheReadTokens;
        return acc;
      }, {
        totalMessages: 0,
        totalCost: new Decimal(0),
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheCreationTokens: 0,
        totalCacheReadTokens: 0
      });

      await tx.user.update({
        where: { id: user.id },
        data: {
          totalProjects: user.projects.length,
          totalSessions: user.sessions.length,
          totalMessages: messageAggregates.totalMessages,
          totalCost: messageAggregates.totalCost,
          totalInputTokens: messageAggregates.totalInputTokens,
          totalOutputTokens: messageAggregates.totalOutputTokens,
          totalCacheCreationTokens: messageAggregates.totalCacheCreationTokens,
          totalCacheReadTokens: messageAggregates.totalCacheReadTokens
        }
      });
    }
  }

  async verifyAggregates(): Promise<any> {
    console.log('🔍 Verifying aggregates...');
    
    // Query the verification view created in the migration
    const result = await prisma.$queryRaw`
      SELECT 
        u.user_id,
        u.total_messages as stored_messages,
        COUNT(DISTINCT m.uuid) as actual_messages,
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
}