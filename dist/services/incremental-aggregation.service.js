"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncrementalAggregationService = void 0;
const database_1 = require("../database");
const library_1 = require("@prisma/client/runtime/library");
class IncrementalAggregationService {
    /**
     * Update aggregates when a new message is created
     * This should be called within the same transaction as message creation
     */
    async onMessageCreated(message, tx) {
        const client = tx || database_1.prisma;
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
        // Update machine aggregates
        await client.machine.update({
            where: { id: message.clientMachineId },
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
    async onSessionCreated(session, tx) {
        const client = tx || database_1.prisma;
        // Update project session count
        await client.project.update({
            where: { id: session.projectId },
            data: {
                totalSessions: { increment: 1 }
            }
        });
        // Update machine session count
        await client.machine.update({
            where: { id: session.clientMachineId },
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
    async onProjectCreated(project, tx) {
        const client = tx || database_1.prisma;
        // Update machine project count
        await client.machine.update({
            where: { id: project.clientMachineId },
            data: {
                totalProjects: { increment: 1 }
            }
        });
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
    async onBatchMessagesCreated(messages, tx) {
        const client = tx || database_1.prisma;
        // Group messages by session, project, and user for efficient updates
        const sessionAggregates = new Map();
        const projectAggregates = new Map();
        const userAggregates = new Map();
        // Calculate aggregates
        for (const msg of messages) {
            // Session aggregates
            if (!sessionAggregates.has(msg.sessionId)) {
                sessionAggregates.set(msg.sessionId, {
                    totalMessages: 0,
                    totalCost: new library_1.Decimal(0),
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
                    totalCost: new library_1.Decimal(0),
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
                    totalCost: new library_1.Decimal(0),
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
    async shouldUseIncremental() {
        // Check if aggregates are already populated
        const user = await database_1.prisma.user.findFirst({
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
exports.IncrementalAggregationService = IncrementalAggregationService;
//# sourceMappingURL=incremental-aggregation.service.js.map