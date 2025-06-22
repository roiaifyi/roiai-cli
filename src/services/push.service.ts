import { PrismaClient } from "@prisma/client";
import axios, { AxiosInstance } from "axios";
import { v5 as uuidv5 } from "uuid";
import crypto from "crypto";
import {
  PushRequest,
  PushResponse,
  PushConfig,
  EntityMaps,
  MessageEntity,
} from "../models/push.types";
import { UserService } from "./user.service";
import { version } from "../../package.json";
import { COMMAND_STRINGS } from "../utils/constants";
import { EndpointResolver } from "../utils/endpoint-resolver";

export class PushService {
  private prisma: PrismaClient;
  private httpClient: AxiosInstance;
  private config: PushConfig;
  private authenticatedUserId: string | null = null;

  constructor(
    prisma: PrismaClient,
    config: PushConfig,
    userService?: UserService
  ) {
    this.prisma = prisma;
    this.config = config;

    if (userService) {
      this.authenticatedUserId = userService.getAuthenticatedUserId();
      const apiToken = userService.getApiToken();

      // Get push endpoint
      const endpoint = EndpointResolver.getPushEndpoint();

      this.httpClient = axios.create({
        baseURL: endpoint,
        timeout: config.timeout,
        headers: {
          Authorization: `${COMMAND_STRINGS.HTTP.BEARER_PREFIX}${apiToken}`,
          "Content-Type": "application/json",
        },
      });
    } else {
      // For testing or backward compatibility
      const endpoint = EndpointResolver.getPushEndpoint();
      this.httpClient = axios.create({
        baseURL: endpoint,
        timeout: config.timeout,
        headers: {
          Authorization: `${COMMAND_STRINGS.HTTP.BEARER_PREFIX}${config.apiToken}`,
          "Content-Type": "application/json",
        },
      });
    }
  }

  async selectUnpushedBatch(batchSize: number): Promise<string[]> {
    // Find messages without sync status or with failed sync
    const messages = await this.prisma.message.findMany({
      where: {
        OR: [
          { syncStatus: null },
          {
            syncStatus: {
              syncedAt: null,
              retryCount: { lt: this.config.maxRetries },
            },
          },
        ],
      },
      orderBy: { timestamp: "asc" },
      take: batchSize,
      select: { messageId: true },
    });

    return messages.map((msg) => msg.messageId);
  }

  async loadMessagesWithEntities(messageIds: string[]): Promise<any[]> {
    return await this.prisma.message.findMany({
      where: { messageId: { in: messageIds } },
      include: {
        session: {
          include: {
            project: {
              include: {
                machine: true,
                user: true,
              },
            },
          },
        },
      },
    });
  }

  buildPushRequest(messages: any[]): PushRequest {
    const entities: EntityMaps = {
      users: new Map(),
      machines: new Map(),
      projects: new Map(),
      sessions: new Map(),
    };

    const messageEntities: MessageEntity[] = [];
    const modelCounts: Record<string, number> = {};
    const roleCounts: Record<string, number> = {};

    // Get authenticated user ID for namespace
    const authenticatedUserId = this.authenticatedUserId;
    if (!authenticatedUserId) {
      throw new Error("Cannot push without authentication");
    }

    for (const msg of messages) {
      // Use authenticated user ID directly, transform other IDs
      const transformedMachineId = this.transformIdForUser(
        msg.clientMachineId,
        authenticatedUserId
      );
      const transformedProjectId = this.transformIdForUser(
        msg.projectId,
        authenticatedUserId
      );
      const transformedSessionId = this.transformIdForUser(
        msg.sessionId,
        authenticatedUserId
      );
      const transformedMessageId = this.transformIdForUser(
        msg.id,
        authenticatedUserId
      );

      // Add user entity
      if (!entities.users.has(authenticatedUserId)) {
        entities.users.set(authenticatedUserId, {
          id: authenticatedUserId,
          email: msg.session?.project?.user?.email,
          username: msg.session?.project?.user?.username,
        });
      }

      // Add machine entity with both transformed and local IDs
      if (!entities.machines.has(transformedMachineId)) {
        entities.machines.set(transformedMachineId, {
          id: transformedMachineId,
          userId: authenticatedUserId,
          machineName: msg.session?.project?.machine?.machineName,
          localMachineId: msg.clientMachineId,
        } as any);
      }

      // Add project entity
      if (!entities.projects.has(transformedProjectId)) {
        entities.projects.set(transformedProjectId, {
          id: transformedProjectId,
          projectName: msg.session?.project?.projectName || "",
          userId: authenticatedUserId,
          clientMachineId: transformedMachineId,
        });
      }

      // Add session entity
      if (!entities.sessions.has(transformedSessionId)) {
        entities.sessions.set(transformedSessionId, {
          id: transformedSessionId,
          projectId: transformedProjectId,
          userId: authenticatedUserId,
          clientMachineId: transformedMachineId,
        });
      }

      // Build message entity with transformed IDs
      messageEntities.push({
        id: transformedMessageId,
        originalMessageId: msg.messageId,
        sessionId: transformedSessionId,
        projectId: transformedProjectId,
        userId: authenticatedUserId,
        role: msg.role,
        model: msg.model || undefined,
        inputTokens: Number(msg.inputTokens),
        outputTokens: Number(msg.outputTokens),
        cacheCreationTokens: Number(msg.cacheCreationTokens),
        cacheReadTokens: Number(msg.cacheReadTokens),
        messageCost: Number(msg.messageCost),
        pricePerInputToken: msg.pricePerInputToken ? Number(msg.pricePerInputToken) : 0,
        pricePerOutputToken: msg.pricePerOutputToken ? Number(msg.pricePerOutputToken) : 0,
        pricePerCacheWriteToken: msg.pricePerCacheWriteToken ? Number(msg.pricePerCacheWriteToken) : 0,
        pricePerCacheReadToken: msg.pricePerCacheReadToken ? Number(msg.pricePerCacheReadToken) : 0,
        cacheDurationMinutes: msg.cacheDurationMinutes || 0,
        writer: msg.writer,
        timestamp: msg.timestamp?.toISOString(),
      } as any);

      // Track counts
      const model = msg.model || "unknown";
      modelCounts[model] = (modelCounts[model] || 0) + 1;
      roleCounts[msg.role] = (roleCounts[msg.role] || 0) + 1;
    }

    return {
      messages: messageEntities,
      metadata: {
        entities: {
          users: Object.fromEntries(entities.users),
          machines: Object.fromEntries(entities.machines),
          projects: Object.fromEntries(entities.projects),
          sessions: Object.fromEntries(entities.sessions),
        },
        batch_info: {
          batch_id: `batch_${Date.now()}`,
          timestamp: new Date().toISOString(),
          client_version: version,
          total_messages: messageEntities.length,
          message_counts: {
            by_model: modelCounts,
            by_role: roleCounts,
          },
        },
      },
    } as any;
  }

  async executePush(request: PushRequest): Promise<PushResponse> {
    try {
      const response = await this.httpClient.post("", request);
      return response.data;
    } catch (error) {
      if ((error as any).isAxiosError) {
        const axiosError = error as any;
        if (axiosError.response) {
          // Server responded with error
          throw new Error(
            `Push failed: ${axiosError.response.status} - ${
              axiosError.response.data?.message || "Unknown error"
            }`
          );
        } else if (axiosError.request) {
          // Network error - add more debug info
          const baseURL = this.httpClient?.defaults?.baseURL || "unknown";
          throw new Error(
            `Network error: ${axiosError.message} (baseURL: ${baseURL}, code: ${axiosError.code})`
          );
        }
      }
      throw error;
    }
  }

  async processPushResponse(
    response: any,
    messageIds: string[]
  ): Promise<void> {
    const now = new Date();

    // Handle the spec response format
    if (!response.success) {
      throw new Error(response.error?.message || "Push failed");
    }

    const { data } = response;
    const processed = data.processed || 0;
    const failed = data.failed || 0;

    // Update sync status records in a transaction
    await this.prisma.$transaction(async (tx) => {
      if (processed > 0) {
        // Mark successful messages as synced
        const successCount = Math.min(processed, messageIds.length);
        for (let i = 0; i < successCount; i++) {
          // Create or update sync status
          await tx.messageSyncStatus.upsert({
            where: { messageId: messageIds[i] },
            update: {
              syncedAt: now,
              syncResponse: "persisted",
            },
            create: {
              messageId: messageIds[i],
              syncedAt: now,
              syncResponse: "persisted",
            },
          });
        }
      }

      if (failed > 0) {
        // Mark remaining messages as failed
        const startIndex = processed;
        for (let i = startIndex; i < messageIds.length; i++) {
          await tx.messageSyncStatus.upsert({
            where: { messageId: messageIds[i] },
            update: {
              retryCount: { increment: 1 },
              syncResponse: "failed",
            },
            create: {
              messageId: messageIds[i],
              retryCount: 1,
              syncResponse: "failed",
            },
          });
        }
      }
    });
  }

  async resetRetryCount(messageIds?: string[]): Promise<number> {
    const result = await this.prisma.messageSyncStatus.updateMany({
      where: {
        syncedAt: null, // Only reset unsynced messages
        ...(messageIds && { messageId: { in: messageIds } }),
      },
      data: {
        retryCount: 0,
        syncResponse: null,
      },
    });

    return result.count;
  }

  async incrementRetryCountForBatch(messageIds: string[]): Promise<number> {
    const result = await this.prisma.messageSyncStatus.updateMany({
      where: {
        messageId: { in: messageIds },
        syncedAt: null,
      },
      data: {
        retryCount: { increment: 1 },
      },
    });

    return result.count;
  }

  async countMaxedOutMessages(messageIds: string[]): Promise<number> {
    const count = await this.prisma.messageSyncStatus.count({
      where: {
        messageId: { in: messageIds },
        syncedAt: null,
        retryCount: { gte: this.config.maxRetries },
      },
    });

    return count;
  }

  async countEligibleMessages(): Promise<number> {
    // Count messages that either have no sync status or have sync status with retries < max
    const count = await this.prisma.message.count({
      where: {
        OR: [
          { syncStatus: null },
          {
            syncStatus: {
              syncedAt: null,
              retryCount: { lt: this.config.maxRetries },
            },
          },
        ],
      },
    });

    return count;
  }

  private transformIdForUser(localId: string, userNamespace: string): string {
    // Use UUID v5 to deterministically generate unique IDs per user
    // This ensures machine/project/session/message IDs are unique per authenticated user
    try {
      // Use a fixed namespace UUID and combine with user ID to create namespace
      const NAMESPACE_UUID = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"; // Standard UUID namespace
      const userSpecificNamespace = uuidv5(userNamespace, NAMESPACE_UUID);
      return uuidv5(localId, userSpecificNamespace);
    } catch (error) {
      // If transformation fails, use a hash-based approach as fallback
      const hash = crypto
        .createHash("sha256")
        .update(`${userNamespace}:${localId}`)
        .digest("hex");
      // Format as UUID v4
      return [
        hash.substring(0, 8),
        hash.substring(8, 12),
        "4" + hash.substring(13, 16),
        ((parseInt(hash.substring(16, 18), 16) & 0x3f) | 0x80).toString(16) +
          hash.substring(18, 20),
        hash.substring(20, 32),
      ].join("-");
    }
  }

  async getPushStatistics() {
    const [total, synced, unsynced, retryDistribution] = await Promise.all([
      this.prisma.message.count(),
      this.prisma.messageSyncStatus.count({
        where: { syncedAt: { not: null } },
      }),
      this.prisma.message.count({
        where: {
          OR: [{ syncStatus: null }, { syncStatus: { syncedAt: null } }],
        },
      }),
      this.prisma.messageSyncStatus.groupBy({
        by: ["retryCount"],
        where: { syncedAt: null },
        _count: true,
      }),
    ]);

    return {
      total,
      synced,
      unsynced,
      retryDistribution: retryDistribution.map((r) => ({
        retryCount: r.retryCount,
        count: r._count,
      })),
    };
  }
}
