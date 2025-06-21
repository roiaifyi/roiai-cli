import fs from "fs";
import path from "path";
import readline from "readline";
import crypto from "crypto";
import {
  JSONLEntry,
  ProcessingResult,
  ProcessingProgress,
  TokenUsageByModel,
} from "../models/types";
import { prisma } from "../database";
import { PricingService } from "./pricing.service";
import { UserService } from "./user.service";
import { BatchProcessor, BatchMessage } from "./batch-processor";
import { Decimal } from "@prisma/client/runtime/library";
import { MessageWriter } from "@prisma/client";
import { logger } from "../utils/logger";

export class JSONLService {
  private batchProcessor: BatchProcessor;
  private progressCallback?: (progress: ProcessingProgress) => void;
  private incrementalChanges: {
    newProjects: string[];
    newSessions: string[];
    newMessages: number;
    totalCostAdded: number;
  } = { newProjects: [], newSessions: [], newMessages: 0, totalCostAdded: 0 };

  constructor(
    private pricingService: PricingService,
    private userService: UserService,
    batchSize: number = 1000
  ) {
    this.batchProcessor = new BatchProcessor(batchSize);
  }

  setProgressCallback(callback: (progress: ProcessingProgress) => void) {
    this.progressCallback = callback;
  }

  getIncrementalChanges() {
    return this.incrementalChanges;
  }

  async processDirectory(directoryPath: string): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      projectsProcessed: 0,
      sessionsProcessed: 0,
      messagesProcessed: 0,
      errors: [],
      tokenUsageByModel: new Map(),
    };

    // Reset tracking
    this.incrementalChanges = {
      newProjects: [],
      newSessions: [],
      newMessages: 0,
      totalCostAdded: 0,
    };

    // Ensure user and machine exist
    await this.ensureUserAndMachine();

    const projectsPath = path.join(directoryPath, "projects");

    try {
      const projectDirs = await fs.promises.readdir(projectsPath);
      const validProjects = projectDirs.filter((dir) => !dir.startsWith("."));

      // Pre-load existing message IDs for efficient duplicate checking
      await this.batchProcessor.loadExistingMessageIds();

      // Process projects sequentially to avoid race conditions with shared batch processor
      for (let i = 0; i < validProjects.length; i++) {
        const projectDir = validProjects[i];
        const projectResult = await this.processProject(
          path.join(projectsPath, projectDir),
          projectDir,
          i,
          validProjects.length
        );

        // Merge results - only count as processed if there was actual work done
        if (projectResult.sessionsProcessed > 0 || projectResult.messagesProcessed > 0 || projectResult.errors.length > 0) {
          result.projectsProcessed++;
        }
        result.sessionsProcessed += projectResult.sessionsProcessed;
        result.messagesProcessed += projectResult.messagesProcessed;
        result.errors.push(...projectResult.errors);
        this.mergeTokenUsage(result.tokenUsageByModel, projectResult.tokenUsageByModel);
      }

      // Final flush of any remaining messages
      const flushed = await this.batchProcessor.flush();
      if (flushed > 0) {
        logger.debug(`Final flush: ${flushed} messages`);
      }

    } catch (error) {
      result.errors.push(`Failed to process directory: ${error}`);
    }

    return result;
  }

  private async ensureUserAndMachine(): Promise<void> {
    const userId = this.userService.getAnonymousId();
    const machineId = this.userService.getClientMachineId();

    // Ensure user exists
    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: this.userService.getUserInfo()?.auth?.email,
        username: this.userService.getUserInfo()?.auth?.username,
      },
      update: {},
    });

    // Ensure machine exists
    await prisma.machine.upsert({
      where: { id: machineId },
      create: {
        id: machineId,
        userId,
        machineName: "Unknown",
      },
      update: {},
    });
  }

  private async processProject(
    projectPath: string,
    projectName: string,
    projectIndex: number,
    totalProjects: number
  ): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      projectsProcessed: 0,
      sessionsProcessed: 0,
      messagesProcessed: 0,
      errors: [],
      tokenUsageByModel: new Map(),
    };

    try {
      const project = await this.ensureProject(projectName);
      const files = await fs.promises.readdir(projectPath);
      const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

      // Process files sequentially to avoid database contention
      for (let i = 0; i < jsonlFiles.length; i++) {
        const file = jsonlFiles[i];
        const fileResult = await this.processJSONLFile(
          path.join(projectPath, file),
          project.id,
          projectName
        );

        // Merge results
        result.sessionsProcessed += fileResult.sessionsProcessed;
        result.messagesProcessed += fileResult.messagesProcessed;
        result.errors.push(...fileResult.errors);
        this.mergeTokenUsage(result.tokenUsageByModel, fileResult.tokenUsageByModel);

        // Update progress
        if (this.progressCallback) {
          this.progressCallback({
            totalProjects,
            processedProjects: projectIndex,
            currentProject: projectName,
            totalFiles: jsonlFiles.length,
            processedFiles: i + 1,
            currentFile: file,
            messagesInCurrentFile: 0,
            processedMessagesInCurrentFile: 0,
          });
        }
      }

    } catch (error) {
      result.errors.push(`Failed to process project ${projectName}: ${error}`);
    }

    return result;
  }

  async ensureProject(projectName: string) {
    const userId = this.userService.getAnonymousId();
    const machineId = this.userService.getClientMachineId();
    const projectId = crypto
      .createHash("sha256")
      .update(`${projectName}:${machineId}`)
      .digest("hex")
      .substring(0, 16);

    // Check if project already exists
    const existingProject = await prisma.project.findUnique({
      where: {
        projectName_clientMachineId: {
          projectName,
          clientMachineId: machineId,
        },
      },
    });

    const isNewProject = !existingProject;

    const project = await prisma.project.upsert({
      where: {
        projectName_clientMachineId: {
          projectName,
          clientMachineId: machineId,
        },
      },
      create: {
        id: projectId,
        projectName,
        userId,
        clientMachineId: machineId,
      },
      update: {},
    });

    // Only track as new if it was actually created
    if (isNewProject && !this.incrementalChanges.newProjects.includes(projectName)) {
      this.incrementalChanges.newProjects.push(projectName);
    }

    return project;
  }

  async processJSONLFile(
    filePath: string,
    projectId: string,
    _projectName?: string
  ): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      projectsProcessed: 0,
      sessionsProcessed: 0,
      messagesProcessed: 0,
      errors: [],
      tokenUsageByModel: new Map(),
    };

    try {
      // Check file status
      const fileStatus = await this.checkFileStatus(filePath);
      const stats = await fs.promises.stat(filePath);

      // Skip if file hasn't changed - check both modification time AND file size
      const sizeChanged = fileStatus?.fileSize ? BigInt(stats.size) !== fileStatus.fileSize : true;
      const timeChanged = fileStatus?.lastModified ? stats.mtime > fileStatus.lastModified : true;
      
      if (
        fileStatus &&
        fileStatus.lastModified &&
        fileStatus.checksum &&
        !timeChanged &&
        !sizeChanged
      ) {
        logger.debug(`Skipping ${path.basename(filePath)}: no changes detected`);
        return result;
      }
      
      // Log why we're processing this file
      if (fileStatus) {
        if (sizeChanged) {
          logger.debug(`Processing ${path.basename(filePath)}: file size changed from ${fileStatus.fileSize} to ${stats.size}`);
        } else if (timeChanged) {
          logger.debug(`Processing ${path.basename(filePath)}: file time changed`);
        }
      }

      const userId = this.userService.getAnonymousId();
      const machineId = this.userService.getClientMachineId();

      // Collect all messages first
      const messages: JSONLEntry[] = [];
      const uniqueSessions = new Set<string>();

      const fileStream = fs.createReadStream(filePath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        if (line.trim()) {
          try {
            const entry: JSONLEntry = JSON.parse(line);
            
            // Only process entries that are actual messages, not summaries or other metadata
            if (entry.uuid && entry.sessionId && entry.message && entry.message.role) {
              messages.push(entry);
              uniqueSessions.add(entry.sessionId);
            }
          } catch (error) {
            result.errors.push(`Invalid JSON in ${filePath}: ${error}`);
          }
        }
      }

      // Ensure all sessions exist
      const newSessions = await this.batchProcessor.ensureSessions(
        Array.from(uniqueSessions),
        projectId,
        userId,
        machineId
      );
      
      this.incrementalChanges.newSessions.push(...Array.from(newSessions));

      // Process messages in batch
      for (const entry of messages) {
        if (!entry.message || !entry.uuid || !entry.message.role) continue;

        const messageId = entry.message.id || entry.uuid;
        
        // Skip if exists (O(1) check)
        if (this.batchProcessor.messageExists(messageId)) {
          continue;
        }

        // Calculate costs
        let messageCost = new Decimal(0);
        let pricePerInputToken: Decimal | null = null;
        let pricePerOutputToken: Decimal | null = null;
        let pricePerCacheWriteToken: Decimal | null = null;
        let pricePerCacheReadToken: Decimal | null = null;

        if (
          entry.message.role === "assistant" &&
          entry.message.usage &&
          entry.message.model &&
          !this.pricingService.isSyntheticModel(entry.message.model)
        ) {
          const costData = this.pricingService.calculateCost(
            entry.message.usage,
            entry.message.model
          );
          const pricing = this.pricingService.getModelPricing(entry.message.model);

          messageCost = new Decimal(costData.costs.total);
          pricePerInputToken = new Decimal(pricing.input);
          pricePerOutputToken = new Decimal(pricing.output);
          pricePerCacheWriteToken = new Decimal(pricing.cacheWrite);
          pricePerCacheReadToken = new Decimal(pricing.cacheRead);
        }

        const inputTokens = entry.message.usage?.input_tokens || 0;
        const outputTokens = entry.message.usage?.output_tokens || 0;
        const cacheCreationTokens = entry.message.usage?.cache_creation_input_tokens || 0;
        const cacheReadTokens = entry.message.usage?.cache_read_input_tokens || 0;

        // Determine the writer type based on message content and role
        const writer = this.determineWriter(entry);

        // Add to batch
        const batchMessage: BatchMessage = {
          id: entry.uuid,
          messageId,
          requestId: entry.requestId || null,
          sessionId: entry.sessionId!,
          projectId,
          userId,
          clientMachineId: machineId,
          timestamp: entry.timestamp ? new Date(entry.timestamp) : null,
          role: entry.message.role,
          model: entry.message.model || null,
          type: entry.message.type || null,
          inputTokens: BigInt(inputTokens),
          outputTokens: BigInt(outputTokens),
          cacheCreationTokens: BigInt(cacheCreationTokens),
          cacheReadTokens: BigInt(cacheReadTokens),
          pricePerInputToken,
          pricePerOutputToken,
          pricePerCacheWriteToken,
          pricePerCacheReadToken,
          cacheDurationMinutes: 5,
          messageCost,
          writer,
        };

        this.batchProcessor.addMessage(batchMessage);
        result.messagesProcessed++;
        this.incrementalChanges.newMessages++;
        this.incrementalChanges.totalCostAdded += Number(messageCost);

        // Update token usage tracking
        if (entry.message.model) {
          this.updateTokenUsage(
            result.tokenUsageByModel,
            entry.message.model,
            inputTokens,
            outputTokens,
            cacheCreationTokens,
            cacheReadTokens
          );
        }

        // Flush if needed
        if (this.batchProcessor.shouldFlush()) {
          await this.batchProcessor.flush();
        }
      }

      // Update file status
      const checksum = await this.calculateFileChecksum(filePath);
      await prisma.fileStatus.upsert({
        where: { filePath },
        create: {
          filePath,
          projectId,
          userId,
          fileSize: BigInt(stats.size),
          lastModified: stats.mtime,
          lastProcessedLine: messages.length,
          lastProcessedAt: new Date(),
          checksum,
        },
        update: {
          fileSize: BigInt(stats.size),
          lastModified: stats.mtime,
          lastProcessedLine: messages.length,
          lastProcessedAt: new Date(),
          checksum,
        },
      });

      result.sessionsProcessed = uniqueSessions.size;

    } catch (error) {
      result.errors.push(`Failed to process file ${filePath}: ${error}`);
    }

    return result;
  }

  private async checkFileStatus(filePath: string) {
    return await prisma.fileStatus.findUnique({
      where: { filePath },
    });
  }

  private async calculateFileChecksum(filePath: string): Promise<string> {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    return new Promise((resolve, reject) => {
      stream.on("data", (data) => hash.update(data));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", reject);
    });
  }

  private updateTokenUsage(
    tokenUsageByModel: Map<string, TokenUsageByModel>,
    model: string,
    inputTokens: number,
    outputTokens: number,
    cacheCreationTokens: number,
    cacheReadTokens: number
  ): void {
    const existing = tokenUsageByModel.get(model);
    if (existing) {
      existing.inputTokens += inputTokens;
      existing.outputTokens += outputTokens;
      existing.cacheCreationTokens += cacheCreationTokens;
      existing.cacheReadTokens += cacheReadTokens;
    } else {
      tokenUsageByModel.set(model, {
        model,
        inputTokens,
        outputTokens,
        cacheCreationTokens,
        cacheReadTokens,
      });
    }
  }

  private mergeTokenUsage(
    target: Map<string, TokenUsageByModel>,
    source: Map<string, TokenUsageByModel>
  ): void {
    source.forEach((usage, model) => {
      const existing = target.get(model);
      if (existing) {
        existing.inputTokens += usage.inputTokens;
        existing.outputTokens += usage.outputTokens;
        existing.cacheCreationTokens += usage.cacheCreationTokens;
        existing.cacheReadTokens += usage.cacheReadTokens;
      } else {
        target.set(model, { ...usage });
      }
    });
  }

  /**
   * Determine the writer type based on message role and content
   */
  private determineWriter(entry: JSONLEntry): MessageWriter {
    if (!entry.message) {
      return MessageWriter.agent;
    }

    const role = entry.message.role;

    // Assistant messages are always from the assistant
    if (role === "assistant") {
      return MessageWriter.assistant;
    }

    // For user messages, determine if it's human or agent
    if (role === "user") {
      // Check for tool result content (agent)
      if (entry.message.content && Array.isArray(entry.message.content)) {
        const hasToolResults = entry.message.content.some((content: any) => 
          content.type === "tool_result" || content.tool_use_id
        );
        if (hasToolResults) {
          return MessageWriter.agent; // Tool results are agentic
        }
      }

      // Check for system continuation messages (agent)
      const textContent = this.extractTextContent(entry);
      if (textContent) {
        // System continuation messages are typically very long and start with specific patterns
        if (textContent.length > 1000 && 
            (textContent.startsWith("This session is being continued") ||
             textContent.startsWith("Analysis:") ||
             textContent.includes("Recent commits:") ||
             textContent.includes("Summary:"))) {
          return MessageWriter.agent; // System continuation messages are agentic
        }

        // Tool operation messages typically start with action descriptions
        if (textContent.startsWith("I see the issue") ||
            textContent.startsWith("Now let me") ||
            textContent.startsWith("Let me") ||
            textContent.startsWith("Great!") ||
            textContent.startsWith("Perfect!") ||
            textContent.startsWith("Excellent!")) {
          return MessageWriter.agent; // These are Claude's internal reasoning
        }
      }

      // Everything else is likely human input
      return MessageWriter.human;
    }

    // Default to agent for any other role
    return MessageWriter.agent;
  }

  /**
   * Extract text content from message content array
   */
  private extractTextContent(entry: JSONLEntry): string | null {
    if (!entry.message || !entry.message.content || !Array.isArray(entry.message.content)) {
      return null;
    }

    const textContent = entry.message.content.find((content: any) => 
      content.type === "text"
    );

    return textContent?.text || null;
  }
}