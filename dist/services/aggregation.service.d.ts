import { PrismaClient } from '@prisma/client';
export declare class AggregationService {
    private prisma;
    constructor(prisma: PrismaClient);
    recalculateAllAggregates(): Promise<void>;
    private recalculateSessionAggregates;
    private recalculateProjectAggregates;
    private recalculateMachineAggregates;
    private recalculateUserAggregates;
    verifyAggregates(): Promise<any>;
    getUsageByProject(): Promise<{
        projectName: string;
        messageCount: bigint;
        totalCost: number;
        inputTokens: bigint;
        outputTokens: bigint;
        cacheCreationInputTokens: bigint;
        cacheReadInputTokens: bigint;
    }[]>;
    getUsageByUser(): Promise<{
        userName: string;
        messageCount: bigint;
        totalCost: number;
        inputTokens: bigint;
        outputTokens: bigint;
        cacheCreationInputTokens: bigint;
        cacheReadInputTokens: bigint;
    }[]>;
    getDailyUsage(startDate: Date, endDate: Date): Promise<{
        date: string;
        messageCount: number;
        inputTokens: number | bigint;
        outputTokens: number | bigint;
        cacheCreationInputTokens: number | bigint;
        cacheReadInputTokens: number | bigint;
        totalCost: number;
    }[]>;
    getUsageByModel(): Promise<{
        model: string | null;
        messageCount: number;
        inputTokens: number | bigint;
        outputTokens: number | bigint;
        cacheCreationInputTokens: number | bigint;
        cacheReadInputTokens: number | bigint;
        totalCost: number;
    }[]>;
    getTotalUsage(): Promise<{
        totalMessages: number;
        totalInputTokens: number | bigint;
        totalOutputTokens: number | bigint;
        totalCacheCreationTokens: number | bigint;
        totalCacheReadTokens: number | bigint;
        totalCost: number;
        uniqueUsers: number;
        uniqueProjects: number;
        uniqueSessions: number;
    }>;
}
//# sourceMappingURL=aggregation.service.d.ts.map