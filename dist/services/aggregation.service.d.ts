import { PrismaClient } from '@prisma/client';
export declare class AggregationService {
    private prisma;
    constructor(prisma: PrismaClient);
    recalculateAllAggregates(): Promise<void>;
    private recalculateSessionAggregates;
    private recalculateProjectAggregates;
    private recalculateUserAggregates;
    verifyAggregates(): Promise<any>;
    getUsageByProject(): Promise<{
        projectName: string;
        messageCount: number;
        totalCost: number;
        inputTokens: bigint;
        outputTokens: bigint;
        cacheCreationInputTokens: bigint;
        cacheReadInputTokens: bigint;
    }[]>;
    getUsageByUser(): Promise<{
        userName: string;
        messageCount: number;
        totalCost: number;
        inputTokens: bigint;
        outputTokens: bigint;
        cacheCreationInputTokens: bigint;
        cacheReadInputTokens: bigint;
    }[]>;
    getDailyUsage(startDate: Date, endDate: Date): Promise<{
        date: string;
        messageCount: number;
        inputTokens: number;
        outputTokens: number;
        cacheCreationInputTokens: number;
        cacheReadInputTokens: number;
        totalCost: number;
    }[]>;
    getUsageByModel(): Promise<{
        model: string | null;
        messageCount: number;
        inputTokens: number;
        outputTokens: number;
        cacheCreationInputTokens: number;
        cacheReadInputTokens: number;
        totalCost: number;
    }[]>;
    getTotalUsage(): Promise<{
        totalMessages: number;
        totalInputTokens: number;
        totalOutputTokens: number;
        totalCacheCreationTokens: number;
        totalCacheReadTokens: number;
        totalCost: number;
        uniqueUsers: number;
        uniqueProjects: number;
        uniqueSessions: number;
    }>;
}
//# sourceMappingURL=aggregation.service.d.ts.map