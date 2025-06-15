import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
type TransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;
export declare class IncrementalAggregationService {
    /**
     * Update aggregates when a new message is created
     * This should be called within the same transaction as message creation
     */
    onMessageCreated(message: {
        sessionId: string;
        projectId: string;
        userId: string;
        inputTokens: number;
        outputTokens: number;
        cacheCreationTokens: number;
        cacheReadTokens: number;
        messageCost: Decimal;
    }, tx?: TransactionClient): Promise<void>;
    /**
     * Update aggregates when a new session is created
     */
    onSessionCreated(session: {
        projectId: string;
        userId: string;
    }, tx?: TransactionClient): Promise<void>;
    /**
     * Update aggregates when a new project is created
     */
    onProjectCreated(project: {
        userId: string;
    }, tx?: TransactionClient): Promise<void>;
    /**
     * Handle batch message creation with efficient aggregation
     */
    onBatchMessagesCreated(messages: Array<{
        sessionId: string;
        projectId: string;
        userId: string;
        inputTokens: number;
        outputTokens: number;
        cacheCreationTokens: number;
        cacheReadTokens: number;
        messageCost: Decimal;
    }>, tx?: TransactionClient): Promise<void>;
    /**
     * Check if we should use incremental or full recalculation
     * Returns true if incremental updates should be used
     */
    shouldUseIncremental(): Promise<boolean>;
}
export {};
//# sourceMappingURL=incremental-aggregation.service.d.ts.map