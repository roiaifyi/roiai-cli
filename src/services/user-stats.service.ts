import { PrismaClient } from '@prisma/client';
import { UserService } from './user.service';

export interface ModelStats {
  model: string;
  messageCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
}

export interface MessageBreakdown {
  human: number;
  humanPercentage: string;
  agent: number;
  agentPercentage: string;
  assistant: number;
  assistantPercentage: string;
  total: number;
}

export class UserStatsService {
  constructor(
    private prisma: PrismaClient,
    private userService: UserService
  ) {}

  /**
   * Get aggregated user statistics
   */
  async getAggregatedStats() {
    const userId = this.userService.getAnonymousId();
    
    const user = await this.prisma.user.findUnique({
      where: { id: userId }
    });
    
    return user;
  }

  /**
   * Get user statistics grouped by model
   */
  async getStatsByModel(): Promise<ModelStats[]> {
    const userId = this.userService.getAnonymousId();
    
    // Get aggregated stats by model from messages
    const modelStats = await this.prisma.message.groupBy({
      by: ['model'],
      where: {
        userId: userId,
        model: { not: null }  // Only include messages with a model
      },
      _count: {
        id: true
      },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cacheCreationTokens: true,
        cacheReadTokens: true,
        messageCost: true
      }
    });

    // Transform and filter out models with zero usage
    const result = modelStats
      .filter(stats => {
        const totalTokens = Number(stats._sum.inputTokens || 0) + 
                           Number(stats._sum.outputTokens || 0) + 
                           Number(stats._sum.cacheCreationTokens || 0) + 
                           Number(stats._sum.cacheReadTokens || 0);
        return totalTokens > 0;
      })
      .map(stats => ({
        model: stats.model!,
        messageCount: stats._count?.id || 0,
        inputTokens: Number(stats._sum.inputTokens || 0),
        outputTokens: Number(stats._sum.outputTokens || 0),
        cacheCreationTokens: Number(stats._sum.cacheCreationTokens || 0),
        cacheReadTokens: Number(stats._sum.cacheReadTokens || 0),
        cost: Number(stats._sum.messageCost || 0)
      }))
      .sort((a, b) => b.cost - a.cost); // Sort by cost descending

    return result;
  }

  /**
   * Get message breakdown by writer type
   */
  async getMessageBreakdown(): Promise<MessageBreakdown | null> {
    const userId = this.userService.getAnonymousId();
    
    // Get message breakdown by writer type
    const breakdown = await this.prisma.message.groupBy({
      by: ['writer'],
      where: {
        userId: userId
      },
      _count: {
        id: true
      }
    });
    
    let human = 0;
    let agent = 0;
    let assistant = 0;
    
    breakdown.forEach(item => {
      const count = item._count.id;
      switch (item.writer) {
        case 'human':
          human = count;
          break;
        case 'agent':
          agent = count;
          break;
        case 'assistant':
          assistant = count;
          break;
      }
    });
    
    const total = human + agent + assistant;
    
    if (total === 0) {
      return null;
    }
    
    return {
      human,
      humanPercentage: ((human / total) * 100).toFixed(1),
      agent,
      agentPercentage: ((agent / total) * 100).toFixed(1),
      assistant,
      assistantPercentage: ((assistant / total) * 100).toFixed(1),
      total
    };
  }
}