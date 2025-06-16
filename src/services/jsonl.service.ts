import fs from "fs";
import path from "path";
import readline from "readline";
import crypto from "crypto";
import { JSONLEntry, ProcessingResult, ProcessingProgress, TokenUsageByModel } from "../models/types";
import { prisma } from "../database";
import { PricingService } from "./pricing.service";
import { UserService } from "./user.service";
import { IncrementalAggregationService } from "./incremental-aggregation.service";
import { Decimal } from "@prisma/client/runtime/library";

export class JSONLService {
  private globalMessageIds: Set<string> = new Set();
  private incrementalAggregation: IncrementalAggregationService;
  private useIncrementalAggregation: boolean = true;
  private incrementalChanges: {
    newProjects: string[];
    newSessions: string[];
    newMessages: number;
    totalCostAdded: number;
  } = { newProjects: [], newSessions: [], newMessages: 0, totalCostAdded: 0 };
  private progressCallback?: (progress: ProcessingProgress) => void;

  constructor(
    private pricingService: PricingService,
    private userService: UserService
  ) {
    this.incrementalAggregation = new IncrementalAggregationService();
  }

  setUseIncrementalAggregation(value: boolean) {
    this.useIncrementalAggregation = value;
  }

  getIncrementalChanges() {
    return this.incrementalChanges;
  }

  setProgressCallback(callback: (progress: ProcessingProgress) => void) {
    this.progressCallback = callback;
  }

  async processDirectory(directoryPath: string): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      projectsProcessed: 0,
      sessionsProcessed: 0,
      messagesProcessed: 0,
      errors: [],
      tokenUsageByModel: new Map(),
    };

    // Reset incremental changes tracking
    this.incrementalChanges = { 
      newProjects: [], 
      newSessions: [], 
      newMessages: 0, 
      totalCostAdded: 0 
    };

    // Global message tracking across all sessions
    this.globalMessageIds = new Set<string>();

    // Ensure user and machine exist
    await this.ensureUserAndMachine();

    // Navigate to the projects subdirectory
    const projectsPath = path.join(directoryPath, "projects");

    try {
      // Check if projects directory exists
      const projectsStats = await fs.promises.stat(projectsPath);
      if (!projectsStats.isDirectory()) {
        throw new Error(`Projects path is not a directory: ${projectsPath}`);
      }

      const projectDirs = await fs.promises.readdir(projectsPath);
      const validProjects = projectDirs.filter(dir => !dir.startsWith("."));
      
      // Count total files first for progress tracking
      let totalFiles = 0;
      for (const projectDir of validProjects) {
        const projectPath = path.join(projectsPath, projectDir);
        const stats = await fs.promises.stat(projectPath);
        if (stats.isDirectory()) {
          const files = await fs.promises.readdir(projectPath);
          totalFiles += files.filter(f => f.endsWith(".jsonl")).length;
        }
      }

      let processedProjects = 0;
      let processedFiles = 0;

      for (const projectDir of validProjects) {
        const projectPath = path.join(projectsPath, projectDir);
        const stats = await fs.promises.stat(projectPath);

        if (stats.isDirectory()) {
          if (this.progressCallback) {
            this.progressCallback({
              totalProjects: validProjects.length,
              processedProjects,
              currentProject: projectDir,
              totalFiles,
              processedFiles,
              currentFile: "",
              messagesInCurrentFile: 0,
              processedMessagesInCurrentFile: 0
            });
          }

          const projectResult = await this.processProjectDirectory(
            projectPath, 
            totalFiles, 
            processedFiles,
            validProjects.length,
            processedProjects
          );
          
          result.sessionsProcessed += projectResult.sessionsProcessed;
          result.messagesProcessed += projectResult.messagesProcessed;
          result.errors.push(...projectResult.errors);
          if (projectResult.messagesProcessed > 0 || projectResult.sessionsProcessed > 0) {
            result.projectsProcessed++;
          }
          
          // Merge token usage by model
          this.mergeTokenUsage(result.tokenUsageByModel, projectResult.tokenUsageByModel);
          
          // Update processed files count
          const files = await fs.promises.readdir(projectPath);
          processedFiles += files.filter(f => f.endsWith(".jsonl")).length;
          processedProjects++;
        }
      }
    } catch (error) {
      result.errors.push(`Failed to process directory: ${error}`);
    }

    return result;
  }

  private async ensureUserAndMachine(): Promise<void> {
    const userId = this.userService.getUserId();
    const machineId = this.userService.getClientMachineId();
    const userEmail = this.userService.getUserInfo().email;

    // Ensure user exists
    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: userEmail,
      },
      update: {},
    });

    // Ensure machine exists
    await prisma.machine.upsert({
      where: { id: machineId },
      create: {
        id: machineId,
        userId,
        machineName: machineId,
      },
      update: {},
    });
  }

  private async processProjectDirectory(
    projectPath: string,
    totalFiles?: number,
    currentFileOffset?: number,
    totalProjects?: number,
    currentProjectIndex?: number
  ): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      projectsProcessed: 0,
      sessionsProcessed: 0,
      messagesProcessed: 0,
      errors: [],
      tokenUsageByModel: new Map(),
    };

    // Extract project name from path
    const projectName = path
      .basename(projectPath)
      .replace(/^-Users-[^-]+-/, "");

    // Create or get project
    const project = await this.ensureProject(projectName);

    // Process all JSONL files in the project directory
    const files = await fs.promises.readdir(projectPath);
    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

    let fileIndex = 0;
    for (const file of jsonlFiles) {
      const filePath = path.join(projectPath, file);
      
      if (this.progressCallback && totalFiles !== undefined && currentFileOffset !== undefined) {
        this.progressCallback({
          totalProjects: totalProjects || 1,
          processedProjects: currentProjectIndex || 0,
          currentProject: projectName,
          totalFiles: totalFiles,
          processedFiles: currentFileOffset + fileIndex,
          currentFile: file,
          messagesInCurrentFile: 0,
          processedMessagesInCurrentFile: 0
        });
      }
      
      const fileResult = await this.processJSONLFile(filePath, project.id, projectName);
      result.sessionsProcessed += fileResult.sessionsProcessed;
      result.messagesProcessed += fileResult.messagesProcessed;
      result.errors.push(...fileResult.errors);
      
      // Merge token usage by model
      this.mergeTokenUsage(result.tokenUsageByModel, fileResult.tokenUsageByModel);
      
      fileIndex++;
    }

    return result;
  }

  async ensureProject(projectName: string) {
    const userId = this.userService.getUserId();
    const machineId = this.userService.getClientMachineId();
    const projectId = crypto
      .createHash("sha256")
      .update(`${projectName}:${machineId}`)
      .digest("hex")
      .substring(0, 16);

    // Check if project exists
    const existingProject = await prisma.project.findUnique({
      where: {
        projectName_clientMachineId: {
          projectName,
          clientMachineId: machineId,
        },
      },
    });

    if (!existingProject) {
      // Create new project
      const project = await prisma.project.create({
        data: {
          id: projectId,
          projectName,
          userId,
          clientMachineId: machineId,
        },
      });

      // Update user's project count (only if using incremental aggregation)
      if (this.useIncrementalAggregation) {
        await this.incrementalAggregation.onProjectCreated({ userId, clientMachineId: machineId });
        this.incrementalChanges.newProjects.push(projectName);
      }

      return project;
    } else {
      // Update existing project
      return await prisma.project.update({
        where: {
          projectName_clientMachineId: {
            projectName,
            clientMachineId: machineId,
          },
        },
        data: {},
      });
    }
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

    // Extract session ID from filename
    const sessionId = path.basename(filePath, ".jsonl");

    // Check file status
    const fileStatus = await this.checkFileStatus(filePath, projectId);
    const stats = await fs.promises.stat(filePath);

    // Skip if file hasn't changed
    if (
      fileStatus &&
      fileStatus.lastModified &&
      stats.mtime <= fileStatus.lastModified &&
      fileStatus.checksum
    ) {
      return result;
    }

    // Ensure session exists using filename as sessionId
    const userId = this.userService.getUserId();
    const machineId = this.userService.getClientMachineId();

    // Check if session exists
    const existingSession = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!existingSession) {
      // Create new session
      await prisma.session.create({
        data: {
          id: sessionId,
          projectId,
          userId,
          clientMachineId: machineId,
        },
      });

      // Update aggregates for new session (only if using incremental aggregation)
      if (this.useIncrementalAggregation) {
        await this.incrementalAggregation.onSessionCreated({
          projectId,
          userId,
          clientMachineId: machineId,
        });
        this.incrementalChanges.newSessions.push(sessionId);
      }
    } else {
      // Update existing session
      await prisma.session.update({
        where: { id: sessionId },
        data: {
        },
      });
    }

    // Count total lines first for progress
    // const totalLines = await this.countFileLines(filePath);
    
    // Process file line by line
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let lineNumber = 0;
    const sessionData = new Map<string, any>();
    const messagesToProcess: JSONLEntry[] = [];

    try {
      // First pass: collect all messages
      for await (const line of rl) {
        lineNumber++;

        // Skip already processed lines
        if (fileStatus && lineNumber <= fileStatus.lastProcessedLine) {
          continue;
        }

        try {
          const entry: JSONLEntry = JSON.parse(line);

          // Use filename sessionId if entry doesn't have one
          if (!entry.sessionId) {
            entry.sessionId = sessionId;
          }

          if (entry.type === "summary") {
            sessionData.set(sessionId, {
              summary: entry.summary,
              leafUuid: entry.leafUuid,
            });
          } else if (entry.message) {
            const messageId = entry.message.id || entry.uuid; // Use uuid as fallback

            // Check global deduplication
            if (messageId && this.globalMessageIds.has(messageId)) {
              // Skip duplicate message
            } else if (messageId) {
              this.globalMessageIds.add(messageId);
              messagesToProcess.push(entry);
            }
          }
        } catch (error) {
          result.errors.push(`Line ${lineNumber}: ${error}`);
        }
      }

      // Second pass: process messages in topological order
      const processed = new Set<string>();
      const processing = new Set<string>();

      const processInOrder = async (entry: JSONLEntry): Promise<void> => {
        if (!entry.uuid) return; // Skip entries without UUID
        if (processed.has(entry.uuid)) return;
        if (processing.has(entry.uuid)) {
          console.warn(
            `Circular dependency detected for message ${entry.uuid}`
          );
          return;
        }

        processing.add(entry.uuid);

        // Process this message
        await this.processMessage(entry, projectId, machineId, result.tokenUsageByModel);
        processed.add(entry.uuid);
        processing.delete(entry.uuid);
        result.messagesProcessed++;
      };

      // Process all messages
      for (const entry of messagesToProcess) {
        try {
          await processInOrder(entry);
        } catch (error) {
          result.errors.push(
            `Failed to process message ${entry.uuid}: ${error}`
          );
        }
      }

      // Update file status
      const checksum = await this.calculateFileChecksum(filePath);
      await prisma.fileStatus.upsert({
        where: { filePath },
        create: {
          filePath,
          sessionId, // Add sessionId
          projectId,
          userId: this.userService.getUserId(),
          fileSize: stats.size,
          lastModified: stats.mtime,
          lastProcessedLine: lineNumber,
          lastProcessedAt: new Date(),
          checksum,
        },
        update: {
          sessionId, // Update sessionId
          fileSize: stats.size,
          lastModified: stats.mtime,
          lastProcessedLine: lineNumber,
          lastProcessedAt: new Date(),
          checksum,
        },
      });

      // Always count this session as processed since we created/updated it
      result.sessionsProcessed = 1;
    } catch (error) {
      result.errors.push(`Failed to process file ${filePath}: ${error}`);
    }

    return result;
  }

  private async checkFileStatus(filePath: string, _projectId: string) {
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

  // TODO: Implement line counting for more detailed progress tracking
  // private async countFileLines(filePath: string): Promise<number> {
  //   const fileStream = fs.createReadStream(filePath);
  //   const rl = readline.createInterface({
  //     input: fileStream,
  //     crlfDelay: Infinity,
  //   });

  //   let lineCount = 0;
  //   for await (const _line of rl) {
  //     lineCount++;
  //   }
  //   return lineCount;
  // }

  private async processMessage(entry: JSONLEntry, projectId: string, clientMachineId: string, tokenUsageByModel: Map<string, TokenUsageByModel>) {
    if (!entry.message || !entry.sessionId || !entry.uuid) return;

    const userId = this.userService.getUserId();
    const messageId = entry.message.id || entry.uuid;

    // Skip if message already exists by uuid
    const existingMessage = await prisma.message.findUnique({
      where: { uuid: entry.uuid },
    });

    if (existingMessage) {
      return;
    }

    // Also check if a message with this messageId already exists
    const existingByMessageId = await prisma.message.findFirst({
      where: {
        messageId: messageId,
        sessionId: entry.sessionId,
      },
    });

    if (existingByMessageId) {
      // Skip duplicate message
      return;
    }

    // Calculate costs if it's an assistant message with usage data
    let messageCost = new Decimal(0);
    let pricePerInputToken: Decimal | null = null;
    let pricePerOutputToken: Decimal | null = null;
    let pricePerCacheWriteToken: Decimal | null = null;
    let pricePerCacheReadToken: Decimal | null = null;

    if (
      entry.message.role === "assistant" &&
      entry.message.usage &&
      entry.message.model
    ) {
      if (!this.pricingService.isSyntheticModel(entry.message.model)) {
        const costData = this.pricingService.calculateCost(
          entry.message.usage,
          entry.message.model
        );
        const pricing = this.pricingService.getModelPricing(
          entry.message.model
        );

        messageCost = new Decimal(costData.costs.total);
        pricePerInputToken = new Decimal(pricing.input);
        pricePerOutputToken = new Decimal(pricing.output);
        pricePerCacheWriteToken = new Decimal(pricing.cacheWrite);
        pricePerCacheReadToken = new Decimal(pricing.cacheRead);
      }
    }


    // Create message
    const inputTokens = entry.message.usage?.input_tokens || 0;
    const outputTokens = entry.message.usage?.output_tokens || 0;
    const cacheCreationTokens =
      entry.message.usage?.cache_creation_input_tokens || 0;
    const cacheReadTokens = entry.message.usage?.cache_read_input_tokens || 0;

    await prisma.message.create({
      data: {
        uuid: entry.uuid,
        messageId: entry.message.id || entry.uuid, // Use uuid as fallback if no message ID
        requestId: entry.requestId || null,
        sessionId: entry.sessionId,
        projectId,
        userId,
        clientMachineId,
        timestamp: entry.timestamp ? new Date(entry.timestamp) : null,
        role: entry.message.role || entry.type || "unknown",
        model: entry.message.model || null,
        type: entry.message.type || null,
        inputTokens,
        outputTokens,
        cacheCreationTokens,
        cacheReadTokens,
        pricePerInputToken,
        pricePerOutputToken,
        pricePerCacheWriteToken,
        pricePerCacheReadToken,
        cacheDurationMinutes: 5, // Default from config
        messageCost,
      },
    });

    // Track token usage for this sync
    if (entry.message.model) {
      const model = entry.message.model;
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

    // Update aggregates incrementally (only if using incremental aggregation)
    if (this.useIncrementalAggregation) {
      await this.incrementalAggregation.onMessageCreated({
        sessionId: entry.sessionId,
        projectId,
        userId,
        clientMachineId,
        inputTokens,
        outputTokens,
        cacheCreationTokens,
        cacheReadTokens,
        messageCost,
      });
      this.incrementalChanges.newMessages++;
      this.incrementalChanges.totalCostAdded += Number(messageCost);
    }

    // Create sync status entry for tracking
    await prisma.syncStatus.upsert({
      where: {
        tableName_recordId: {
          tableName: "messages",
          recordId: entry.uuid,
        },
      },
      create: {
        tableName: "messages",
        recordId: entry.uuid,
        operation: "INSERT",
      },
      update: {},
    });
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
        target.set(model, {
          model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheCreationTokens: usage.cacheCreationTokens,
          cacheReadTokens: usage.cacheReadTokens,
        });
      }
    });
  }
}
