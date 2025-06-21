import { Prisma } from '@prisma/client';
import { prisma } from '../database';
import { logger } from '../utils/logger';

export interface BatchMessage {
  id: string;
  messageId: string;
  requestId?: string | null;
  sessionId: string;
  projectId: string;
  userId: string;
  clientMachineId: string;
  timestamp: Date | null;
  role: string;
  model: string | null;
  type: string | null;
  inputTokens: bigint;
  outputTokens: bigint;
  cacheCreationTokens: bigint;
  cacheReadTokens: bigint;
  pricePerInputToken: Prisma.Decimal | null;
  pricePerOutputToken: Prisma.Decimal | null;
  pricePerCacheWriteToken: Prisma.Decimal | null;
  pricePerCacheReadToken: Prisma.Decimal | null;
  cacheDurationMinutes: number;
  messageCost: Prisma.Decimal;
}

export class BatchProcessor {
  private messageBuffer: BatchMessage[] = [];
  private syncStatusBuffer: { messageId: string }[] = [];
  private existingMessageIds: Set<string> = new Set();
  private readonly batchSize: number = 1000;

  constructor(batchSize?: number) {
    if (batchSize) {
      this.batchSize = batchSize;
    }
  }

  /**
   * Load existing message IDs for efficient duplicate checking
   */
  async loadExistingMessageIds(projectId?: string): Promise<void> {
    const where = projectId ? { projectId } : {};
    const existingMessages = await prisma.message.findMany({
      where,
      select: { messageId: true }
    });
    
    this.existingMessageIds = new Set(existingMessages.map(m => m.messageId));
    logger.info(`Loaded ${this.existingMessageIds.size} existing message IDs`);
  }

  /**
   * Check if a message already exists (O(1) lookup)
   */
  messageExists(messageId: string): boolean {
    return this.existingMessageIds.has(messageId);
  }

  /**
   * Add a message to the buffer
   */
  addMessage(message: BatchMessage): void {
    if (!this.messageExists(message.messageId)) {
      this.messageBuffer.push(message);
      this.syncStatusBuffer.push({ messageId: message.messageId });
      this.existingMessageIds.add(message.messageId); // Prevent duplicates in current batch
    }
  }

  /**
   * Flush the buffer and insert all messages
   */
  async flush(): Promise<number> {
    if (this.messageBuffer.length === 0) {
      return 0;
    }

    const totalMessages = this.messageBuffer.length;
    let successfullyInserted = 0;
    
    try {
      // Process messages in smaller chunks to reduce transaction contention
      const CHUNK_SIZE = 100;
      
      for (let i = 0; i < this.messageBuffer.length; i += CHUNK_SIZE) {
        const messageChunk = this.messageBuffer.slice(i, i + CHUNK_SIZE);
        const syncStatusChunk = this.syncStatusBuffer.slice(i, i + CHUNK_SIZE);
        
        try {
          await prisma.$transaction(async (tx) => {
            // Insert messages chunk
            await tx.message.createMany({
              data: messageChunk
            });
            
            // Verify messages were inserted and create sync statuses
            const messageIds = messageChunk.map(m => m.messageId);
            const insertedMessages = await tx.message.findMany({
              where: { messageId: { in: messageIds } },
              select: { messageId: true }
            });
            
            const insertedMessageIds = new Set(insertedMessages.map(m => m.messageId));
            
            // Get existing sync statuses to avoid duplicates
            const existingSyncStatuses = await tx.messageSyncStatus.findMany({
              where: { messageId: { in: messageIds } },
              select: { messageId: true }
            });
            
            const existingSyncMessageIds = new Set(existingSyncStatuses.map(s => s.messageId));
            
            // Create sync statuses only for messages that exist and don't have sync status
            const validSyncStatuses = syncStatusChunk.filter(s => 
              insertedMessageIds.has(s.messageId) && !existingSyncMessageIds.has(s.messageId)
            );
            
            if (validSyncStatuses.length > 0) {
              await tx.messageSyncStatus.createMany({
                data: validSyncStatuses
              });
            }
            
            successfullyInserted += insertedMessageIds.size;
          }, {
            timeout: 30000 // 30 second timeout
          });
        } catch (chunkError: any) {
          logger.debug(`Chunk ${i}-${i + CHUNK_SIZE} failed, processing individually: ${chunkError.code}`);
          
          // If chunk fails, process messages individually to maximize success
          for (let j = 0; j < messageChunk.length; j++) {
            const message = messageChunk[j];
            const syncStatus = syncStatusChunk[j];
            
            try {
              await prisma.$transaction(async (tx) => {
                // Check if message already exists
                const existing = await tx.message.findUnique({
                  where: { messageId: message.messageId }
                });
                
                if (!existing) {
                  await tx.message.create({ data: message });
                }
                
                // Check if sync status already exists
                const existingSync = await tx.messageSyncStatus.findUnique({
                  where: { messageId: syncStatus.messageId }
                });
                
                if (!existingSync) {
                  await tx.messageSyncStatus.create({ data: syncStatus });
                }
                
                successfullyInserted++;
              });
            } catch (individualError: any) {
              // Log but don't fail the entire batch
              logger.debug(`Individual message ${message.messageId} failed: ${individualError.code}`);
            }
          }
        }
      }
      
      logger.debug(`Batch processed ${totalMessages} messages, ${successfullyInserted} successful`);
      
    } catch (error) {
      logger.error(`Batch processing failed: ${error}`);
    } finally {
      // Always clear buffers to prevent stuck state
      this.messageBuffer = [];
      this.syncStatusBuffer = [];
    }
    
    return successfullyInserted;
  }

  /**
   * Check if buffer needs flushing
   */
  shouldFlush(): boolean {
    return this.messageBuffer.length >= this.batchSize;
  }

  /**
   * Get current buffer size
   */
  getBufferSize(): number {
    return this.messageBuffer.length;
  }

  /**
   * Batch check and create sessions with robust concurrency handling
   */
  async ensureSessions(sessionIds: string[], projectId: string, userId: string, clientMachineId: string): Promise<Set<string>> {
    const createdSessions = new Set<string>();
    
    // Process sessions in small batches to reduce contention
    const BATCH_SIZE = 10;
    for (let i = 0; i < sessionIds.length; i += BATCH_SIZE) {
      const batch = sessionIds.slice(i, i + BATCH_SIZE);
      
      // Check which sessions exist in this batch
      const existingSessions = await prisma.session.findMany({
        where: { id: { in: batch } },
        select: { id: true }
      });
      
      const existingIds = new Set(existingSessions.map(s => s.id));
      const newSessions = batch.filter(id => !existingIds.has(id));
      
      // Create new sessions with individual error handling
      for (const sessionId of newSessions) {
        try {
          await prisma.session.create({
            data: {
              id: sessionId,
              projectId,
              userId,
              clientMachineId
            }
          });
          createdSessions.add(sessionId);
        } catch (error: any) {
          if (error.code === 'P2002') {
            // Session created by concurrent process - that's fine
            logger.debug(`Session ${sessionId} already exists (concurrent creation)`);
          } else {
            logger.error(`Failed to create session ${sessionId}: ${error}`);
            // Don't throw - continue processing other sessions
          }
        }
      }
    }
    
    return createdSessions;
  }

  /**
   * Calculate and update aggregates efficiently
   */
  async updateAggregatesForProject(projectId: string): Promise<void> {
    await prisma.$executeRaw`
      UPDATE sessions s
      SET 
        total_messages = subq.message_count,
        total_cost = subq.total_cost,
        total_input_tokens = subq.input_tokens,
        total_output_tokens = subq.output_tokens,
        total_cache_creation_tokens = subq.cache_creation_tokens,
        total_cache_read_tokens = subq.cache_read_tokens
      FROM (
        SELECT 
          session_id,
          COUNT(*) as message_count,
          SUM(message_cost) as total_cost,
          SUM(input_tokens) as input_tokens,
          SUM(output_tokens) as output_tokens,
          SUM(cache_creation_tokens) as cache_creation_tokens,
          SUM(cache_read_tokens) as cache_read_tokens
        FROM messages
        WHERE project_id = ${projectId}
        GROUP BY session_id
      ) subq
      WHERE s.session_id = subq.session_id
    `;

    // Update project aggregates
    await prisma.$executeRaw`
      UPDATE projects p
      SET 
        total_sessions = (SELECT COUNT(*) FROM sessions WHERE project_id = ${projectId}),
        total_messages = subq.message_count,
        total_cost = subq.total_cost,
        total_input_tokens = subq.input_tokens,
        total_output_tokens = subq.output_tokens,
        total_cache_creation_tokens = subq.cache_creation_tokens,
        total_cache_read_tokens = subq.cache_read_tokens
      FROM (
        SELECT 
          COUNT(*) as message_count,
          SUM(message_cost) as total_cost,
          SUM(input_tokens) as input_tokens,
          SUM(output_tokens) as output_tokens,
          SUM(cache_creation_tokens) as cache_creation_tokens,
          SUM(cache_read_tokens) as cache_read_tokens
        FROM messages
        WHERE project_id = ${projectId}
      ) subq
      WHERE p.project_id = ${projectId}
    `;
  }
}