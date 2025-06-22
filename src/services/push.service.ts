import { PrismaClient } from "@prisma/client";
import { v5 as uuidv5 } from "uuid";
import crypto from "crypto";
import {
  PushRequest,
  PushResponse,
  PushConfig,
  EntityMaps,
  MessageEntity,
} from "../models/push.types";
import { createApiClient } from "../generated/api-client";
import { UserService } from "./user.service";
import { COMMAND_STRINGS } from "../utils/constants";
import { configManager } from "../config";

export class PushService {
  private prisma: PrismaClient;
  private apiClient: ReturnType<typeof createApiClient>;
  private config: PushConfig;
  private authenticatedUserId: string | null = null;

  constructor(
    prisma: PrismaClient,
    config: PushConfig,
    userService: UserService
  ) {
    this.prisma = prisma;
    this.config = config;

    const apiConfig = configManager.getApiConfig();

    if (!userService) {
      throw new Error("PushService requires UserService for authentication");
    }

    const apiToken = userService.getApiToken();
    if (!apiToken) {
      throw new Error("No API token available. Please login first.");
    }

    this.authenticatedUserId = userService.getAuthenticatedUserId();
    if (!this.authenticatedUserId) {
      throw new Error("No authenticated user ID available");
    }

    this.apiClient = createApiClient({
      baseUrl: apiConfig.baseUrl,
      headers: {
        Authorization: `${COMMAND_STRINGS.HTTP.BEARER_PREFIX}${apiToken}`,
      },
    });
  }

  async selectUnpushedBatchWithEntities(batchSize: number): Promise<any[]> {
    return await this.prisma.message.findMany({
      where: {
        syncStatus: {
          syncedAt: null,
          retryCount: { lt: this.config.maxRetries },
        },
      },
      orderBy: { timestamp: "asc" },
      take: batchSize,
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
      machines: new Map(),
      projects: new Map(),
      sessions: new Map(),
    };

    const messageEntities: MessageEntity[] = [];

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

      // Add machine entity with both transformed and local IDs
      if (!entities.machines.has(transformedMachineId)) {
        entities.machines.set(transformedMachineId, {
          id: transformedMachineId,
          userId: authenticatedUserId,
          machineName: msg.session?.project?.machine?.machineName || "",
          localMachineId: msg.clientMachineId,
        });
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
        // IDs (primary and foreign keys)
        id: transformedMessageId,
        messageId: msg.messageId,
        sessionId: transformedSessionId,
        projectId: transformedProjectId,
        machineId: transformedMachineId,
        userId: authenticatedUserId,

        // Message metadata
        timestamp: msg.timestamp?.toISOString(),
        role: msg.role,
        model: msg.model || undefined,
        writer: msg.writer,

        // Token counts
        inputTokens: Number(msg.inputTokens),
        outputTokens: Number(msg.outputTokens),
        cacheCreationTokens: Number(msg.cacheCreationTokens),
        cacheReadTokens: Number(msg.cacheReadTokens),

        // Pricing information
        pricePerInputToken: msg.pricePerInputToken
          ? Number(msg.pricePerInputToken)
          : 0,
        pricePerOutputToken: msg.pricePerOutputToken
          ? Number(msg.pricePerOutputToken)
          : 0,
        pricePerCacheWriteToken: msg.pricePerCacheWriteToken
          ? Number(msg.pricePerCacheWriteToken)
          : 0,
        pricePerCacheReadToken: msg.pricePerCacheReadToken
          ? Number(msg.pricePerCacheReadToken)
          : 0,
        cacheDurationMinutes: msg.cacheDurationMinutes || 0,

        // Cost total
        messageCost: Number(msg.messageCost),
      });
    }

    return {
      messages: messageEntities,
      entities: {
        machines: Object.fromEntries(entities.machines),
        projects: Object.fromEntries(entities.projects),
        sessions: Object.fromEntries(entities.sessions),
      },
    };
  }

  async executePush(request: PushRequest): Promise<PushResponse> {
    try {
      const response = await this.apiClient.upsyncData(request);
      if (!response.ok) {
        // Handle error responses
        const errorData = response.data as any;
        throw new Error(
          `Push failed: ${response.status} - ${
            errorData?.message || "Unknown error"
          }`
        );
      }
      return response.data as PushResponse;
    } catch (error) {
      if (error instanceof Error) {
        // Re-throw with more context if needed
        if (error.message.includes("fetch")) {
          throw new Error(`Network error: ${error.message}`);
        }
      }
      throw error;
    }
  }

  async processPushResponse(
    response: PushResponse
  ): Promise<void> {
    const now = new Date();

    // Update sync status records in a transaction using bulk operations
    await this.prisma.$transaction(async (tx) => {
      // Use response message IDs directly
      const persistedIds = response.results.persisted.messageIds;
      const deduplicatedIds = response.results.deduplicated.messageIds;

      // Build failed messages map
      const failedMap = new Map<string, { code: string; error: string }>();
      response.results.failed.details.forEach((failure) => {
        failedMap.set(failure.messageId, {
          code: failure.code,
          error: failure.error,
        });
      });

      // Bulk update persisted messages
      if (persistedIds.length > 0) {
        await tx.messageSyncStatus.updateMany({
          where: { messageId: { in: persistedIds } },
          data: {
            syncedAt: now,
            syncResponse: "persisted",
          },
        });
      }

      // Bulk update deduplicated messages
      if (deduplicatedIds.length > 0) {
        await tx.messageSyncStatus.updateMany({
          where: { messageId: { in: deduplicatedIds } },
          data: {
            syncedAt: now,
            syncResponse: "deduplicated",
          },
        });
      }

      // For failed messages, we need to increment retry count and set different error messages
      // Since updateMany doesn't support different values per record, we'll batch by error message
      const failedByError = new Map<string, string[]>();
      for (const [messageId, failure] of failedMap) {
        const errorMsg = `failed: ${failure.code} - ${failure.error}`;
        if (!failedByError.has(errorMsg)) {
          failedByError.set(errorMsg, []);
        }
        failedByError.get(errorMsg)!.push(messageId);
      }

      // Update failed messages grouped by error message
      for (const [errorMsg, msgIds] of failedByError) {
        await tx.messageSyncStatus.updateMany({
          where: { messageId: { in: msgIds } },
          data: {
            retryCount: { increment: 1 },
            syncResponse: errorMsg,
          },
        });
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
    // Count messages that have sync status with retries < max and not synced
    const count = await this.prisma.message.count({
      where: {
        syncStatus: {
          syncedAt: null,
          retryCount: { lt: this.config.maxRetries },
        },
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
          syncStatus: { syncedAt: null },
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
