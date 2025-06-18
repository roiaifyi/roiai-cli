import { PrismaClient } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { 
  PushRequest, 
  PushResponse, 
  PushConfig,
  EntityMaps,
  MessageEntity
} from '../models/types';
import { UserService } from './user.service';

export class PushService {
  private prisma: PrismaClient;
  private httpClient: AxiosInstance;
  private config: PushConfig;
  private authenticatedUserId: string | null = null;
  private anonymousUserId: string | null = null;

  constructor(prisma: PrismaClient, config: PushConfig, userService?: UserService) {
    this.prisma = prisma;
    this.config = config;
    
    if (userService) {
      this.authenticatedUserId = userService.getAuthenticatedUserId();
      this.anonymousUserId = userService.getUserId();
      const apiToken = userService.getApiToken();
      
      this.httpClient = axios.create({
        baseURL: config.endpoint,
        timeout: config.timeout,
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      });
    } else {
      // For testing or backward compatibility
      this.httpClient = axios.create({
        baseURL: config.endpoint,
        timeout: config.timeout,
        headers: {
          'Authorization': `Bearer ${config.apiToken}`,
          'Content-Type': 'application/json'
        }
      });
    }
  }

  async selectUnpushedBatch(batchSize: number): Promise<string[]> {
    const unpushedRecords = await this.prisma.syncStatus.findMany({
      where: {
        tableName: 'messages',
        syncedAt: null,
        retryCount: { lt: this.config.maxRetries }
      },
      orderBy: { localTimestamp: 'asc' },
      take: batchSize,
      select: { recordId: true }
    });

    return unpushedRecords.map(record => record.recordId);
  }

  async loadMessagesWithEntities(messageIds: string[]): Promise<any[]> {
    return await this.prisma.message.findMany({
      where: { uuid: { in: messageIds } },
      include: {
        session: {
          include: {
            project: {
              include: {
                machine: true,
                user: true
              }
            }
          }
        }
      }
    });
  }

  buildPushRequest(messages: any[]): PushRequest {
    const entities: EntityMaps = {
      users: new Map(),
      machines: new Map(),
      projects: new Map(),
      sessions: new Map()
    };

    const messageEntities: MessageEntity[] = [];

    for (const msg of messages) {
      // Replace anonymous userId with authenticated userId if available
      const userId = this.replaceUserId(msg.userId);
      
      // Add user entity
      if (!entities.users.has(userId)) {
        entities.users.set(userId, {
          id: userId,
          email: msg.session?.project?.user?.email,
          username: msg.session?.project?.user?.username
        });
      }

      // Add machine entity
      if (!entities.machines.has(msg.clientMachineId)) {
        entities.machines.set(msg.clientMachineId, {
          id: msg.clientMachineId,
          userId: userId,
          machineName: msg.session?.project?.machine?.machineName
        });
      }

      // Add project entity
      if (!entities.projects.has(msg.projectId)) {
        entities.projects.set(msg.projectId, {
          id: msg.projectId,
          projectName: msg.session?.project?.projectName || '',
          userId: userId,
          clientMachineId: msg.clientMachineId
        });
      }

      // Add session entity
      if (!entities.sessions.has(msg.sessionId)) {
        entities.sessions.set(msg.sessionId, {
          id: msg.sessionId,
          projectId: msg.projectId,
          userId: userId,
          clientMachineId: msg.clientMachineId
        });
      }

      // Build message entity - convert BigInt to number for JSON serialization
      messageEntities.push({
        uuid: msg.uuid,
        messageId: msg.messageId,
        sessionId: msg.sessionId,
        projectId: msg.projectId,
        userId: userId,
        role: msg.role,
        model: msg.model || undefined,
        inputTokens: Number(msg.inputTokens),
        outputTokens: Number(msg.outputTokens),
        cacheCreationTokens: Number(msg.cacheCreationTokens),
        cacheReadTokens: Number(msg.cacheReadTokens),
        messageCost: msg.messageCost.toString(),
        timestamp: msg.timestamp?.toISOString()
      });
    }

    return {
      batchId: uuidv4(),
      timestamp: new Date().toISOString(),
      entities: {
        users: Object.fromEntries(entities.users),
        machines: Object.fromEntries(entities.machines),
        projects: Object.fromEntries(entities.projects),
        sessions: Object.fromEntries(entities.sessions)
      },
      messages: messageEntities,
      metadata: {
        clientVersion: process.env.npm_package_version || '1.0.0',
        totalMessages: messageEntities.length
      }
    };
  }

  async executePush(request: PushRequest): Promise<PushResponse> {
    try {
      const response = await this.httpClient.post('', request);
      return response.data;
    } catch (error) {
      if ((error as any).isAxiosError) {
        const axiosError = error as any;
        if (axiosError.response) {
          // Server responded with error
          throw new Error(`Push failed: ${axiosError.response.status} - ${axiosError.response.data?.message || 'Unknown error'}`);
        } else if (axiosError.request) {
          // Network error
          throw new Error(`Network error: ${axiosError.message}`);
        }
      }
      throw error;
    }
  }

  async processPushResponse(response: PushResponse, messageIds: string[]): Promise<void> {
    const now = new Date();
    const batchId = response.batchId;

    // Create maps for quick lookup
    const persistedSet = new Set(response.results.persisted.messageIds);
    const deduplicatedSet = new Set(response.results.deduplicated.messageIds);
    const failedMap = new Map(
      response.results.failed.details.map(detail => [detail.messageId, detail.error])
    );

    // Update sync status records in a transaction
    await this.prisma.$transaction(async (tx) => {
      for (const messageId of messageIds) {
        if (persistedSet.has(messageId) || deduplicatedSet.has(messageId)) {
          // Mark as successfully synced
          await tx.syncStatus.updateMany({
            where: {
              tableName: 'messages',
              recordId: messageId
            },
            data: {
              syncedAt: now,
              syncBatchId: batchId,
              syncResponse: persistedSet.has(messageId) ? 'persisted' : 'deduplicated'
            }
          });
        } else if (failedMap.has(messageId)) {
          // Increment retry count and store error
          await tx.syncStatus.updateMany({
            where: {
              tableName: 'messages',
              recordId: messageId
            },
            data: {
              retryCount: { increment: 1 },
              syncResponse: failedMap.get(messageId)
            }
          });
        }
      }
    });
  }

  async resetRetryCount(messageIds?: string[]): Promise<number> {
    const result = await this.prisma.syncStatus.updateMany({
      where: {
        tableName: 'messages',
        syncedAt: null,  // Only reset unsynced messages
        ...(messageIds && { recordId: { in: messageIds } })
      },
      data: {
        retryCount: 0,
        syncResponse: null
      }
    });

    return result.count;
  }

  async incrementRetryCountForBatch(messageIds: string[]): Promise<number> {
    const result = await this.prisma.syncStatus.updateMany({
      where: {
        tableName: 'messages',
        recordId: { in: messageIds },
        syncedAt: null
      },
      data: {
        retryCount: { increment: 1 }
      }
    });

    return result.count;
  }

  async countMaxedOutMessages(messageIds: string[]): Promise<number> {
    const count = await this.prisma.syncStatus.count({
      where: {
        tableName: 'messages',
        recordId: { in: messageIds },
        syncedAt: null,
        retryCount: { gte: this.config.maxRetries }
      }
    });

    return count;
  }

  async countEligibleMessages(): Promise<number> {
    const count = await this.prisma.syncStatus.count({
      where: {
        tableName: 'messages',
        syncedAt: null,
        retryCount: { lt: this.config.maxRetries }
      }
    });

    return count;
  }

  private replaceUserId(userId: string): string {
    // If we have an authenticated user ID and the current ID is the anonymous one, replace it
    if (this.authenticatedUserId && this.anonymousUserId && userId === this.anonymousUserId) {
      return this.authenticatedUserId;
    }
    return userId;
  }

  async getPushStatistics() {
    const [total, synced, unsynced, retryDistribution] = await Promise.all([
      this.prisma.syncStatus.count({ where: { tableName: 'messages' } }),
      this.prisma.syncStatus.count({ 
        where: { tableName: 'messages', syncedAt: { not: null } } 
      }),
      this.prisma.syncStatus.count({ 
        where: { tableName: 'messages', syncedAt: null } 
      }),
      this.prisma.syncStatus.groupBy({
        by: ['retryCount'],
        where: { tableName: 'messages', syncedAt: null },
        _count: true
      })
    ]);

    return {
      total,
      synced,
      unsynced,
      retryDistribution: retryDistribution.map(r => ({
        retryCount: r.retryCount,
        count: r._count
      }))
    };
  }
}