"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AggregationService = void 0;
const library_1 = require("@prisma/client/runtime/library");
const logger_1 = require("../utils/logger");
class AggregationService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async recalculateAllAggregates() {
        logger_1.logger.info('🔄 Recalculating all aggregates...');
        // Start a transaction to ensure consistency
        await this.prisma.$transaction(async (tx) => {
            // 1. Recalculate Session aggregates
            await this.recalculateSessionAggregates(tx);
            // 2. Recalculate Project aggregates
            await this.recalculateProjectAggregates(tx);
            // 3. Recalculate Machine aggregates
            await this.recalculateMachineAggregates(tx);
            // 4. Recalculate User aggregates
            await this.recalculateUserAggregates(tx);
        });
        logger_1.logger.info('✅ Aggregates recalculated successfully');
    }
    async recalculateSessionAggregates(tx) {
        logger_1.logger.info('  📊 Recalculating session aggregates...');
        const sessions = await tx.session.findMany({
            include: {
                messages: true
            }
        });
        for (const session of sessions) {
            const aggregates = session.messages.reduce((acc, msg) => {
                acc.totalMessages++;
                acc.totalCost = acc.totalCost.add(new library_1.Decimal(msg.messageCost));
                acc.totalInputTokens += msg.inputTokens;
                acc.totalOutputTokens += msg.outputTokens;
                acc.totalCacheCreationTokens += msg.cacheCreationTokens;
                acc.totalCacheReadTokens += msg.cacheReadTokens;
                return acc;
            }, {
                totalMessages: 0n,
                totalCost: new library_1.Decimal(0),
                totalInputTokens: 0n,
                totalOutputTokens: 0n,
                totalCacheCreationTokens: 0n,
                totalCacheReadTokens: 0n
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
    async recalculateProjectAggregates(tx) {
        logger_1.logger.info('  📊 Recalculating project aggregates...');
        const projects = await tx.project.findMany({
            include: {
                sessions: true,
                messages: true
            }
        });
        for (const project of projects) {
            const messageAggregates = project.messages.reduce((acc, msg) => {
                acc.totalMessages++;
                acc.totalCost = acc.totalCost.add(new library_1.Decimal(msg.messageCost));
                acc.totalInputTokens += msg.inputTokens;
                acc.totalOutputTokens += msg.outputTokens;
                acc.totalCacheCreationTokens += msg.cacheCreationTokens;
                acc.totalCacheReadTokens += msg.cacheReadTokens;
                return acc;
            }, {
                totalMessages: 0n,
                totalCost: new library_1.Decimal(0),
                totalInputTokens: 0n,
                totalOutputTokens: 0n,
                totalCacheCreationTokens: 0n,
                totalCacheReadTokens: 0n
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
    async recalculateMachineAggregates(tx) {
        logger_1.logger.info('  📊 Recalculating machine aggregates...');
        const machines = await tx.machine.findMany({
            include: {
                projects: true,
                sessions: true
            }
        });
        for (const machine of machines) {
            // Get all messages for this machine
            const messages = await tx.message.findMany({
                where: { session: { clientMachineId: machine.id } }
            });
            const messageAggregates = messages.reduce((acc, msg) => {
                acc.totalMessages++;
                acc.totalCost = acc.totalCost.add(new library_1.Decimal(msg.messageCost));
                acc.totalInputTokens += msg.inputTokens;
                acc.totalOutputTokens += msg.outputTokens;
                acc.totalCacheCreationTokens += msg.cacheCreationTokens;
                acc.totalCacheReadTokens += msg.cacheReadTokens;
                return acc;
            }, {
                totalMessages: 0n,
                totalCost: new library_1.Decimal(0),
                totalInputTokens: 0n,
                totalOutputTokens: 0n,
                totalCacheCreationTokens: 0n,
                totalCacheReadTokens: 0n
            });
            await tx.machine.update({
                where: { id: machine.id },
                data: {
                    totalProjects: machine.projects.length,
                    totalSessions: machine.sessions.length,
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
    async recalculateUserAggregates(tx) {
        logger_1.logger.info('  📊 Recalculating user aggregates...');
        const users = await tx.user.findMany({
            include: {
                projects: true,
                sessions: true,
                messages: true
            }
        });
        for (const user of users) {
            const messageAggregates = user.messages.reduce((acc, msg) => {
                acc.totalMessages++;
                acc.totalCost = acc.totalCost.add(new library_1.Decimal(msg.messageCost));
                acc.totalInputTokens += msg.inputTokens;
                acc.totalOutputTokens += msg.outputTokens;
                acc.totalCacheCreationTokens += msg.cacheCreationTokens;
                acc.totalCacheReadTokens += msg.cacheReadTokens;
                return acc;
            }, {
                totalMessages: 0n,
                totalCost: new library_1.Decimal(0),
                totalInputTokens: 0n,
                totalOutputTokens: 0n,
                totalCacheCreationTokens: 0n,
                totalCacheReadTokens: 0n
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
    async verifyAggregates() {
        logger_1.logger.info('🔍 Verifying aggregates...');
        // Query the verification view created in the migration
        const result = await this.prisma.$queryRaw `
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
    async getDailyUsage(startDate, endDate) {
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
                uuid: true
            }
        });
        return messages.map(day => ({
            date: day.timestamp ? day.timestamp.toISOString().split('T')[0] : 'Unknown',
            messageCount: day._count.uuid,
            inputTokens: day._sum.inputTokens || 0,
            outputTokens: day._sum.outputTokens || 0,
            cacheCreationInputTokens: day._sum.cacheCreationTokens || 0,
            cacheReadInputTokens: day._sum.cacheReadTokens || 0,
            totalCost: day._sum.messageCost?.toNumber() || 0
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
                uuid: true
            }
        });
        return models.map(m => ({
            model: m.model,
            messageCount: m._count.uuid,
            inputTokens: m._sum.inputTokens || 0,
            outputTokens: m._sum.outputTokens || 0,
            cacheCreationInputTokens: m._sum.cacheCreationTokens || 0,
            cacheReadInputTokens: m._sum.cacheReadTokens || 0,
            totalCost: m._sum.messageCost?.toNumber() || 0
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
                uuid: true
            }
        });
        const uniqueCounts = await Promise.all([
            this.prisma.user.count(),
            this.prisma.project.count(),
            this.prisma.session.count()
        ]);
        return {
            totalMessages: totals._count?.uuid || 0,
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
exports.AggregationService = AggregationService;
//# sourceMappingURL=aggregation.service.js.map