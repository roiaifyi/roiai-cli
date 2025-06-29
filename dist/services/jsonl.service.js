"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JSONLService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const readline_1 = __importDefault(require("readline"));
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../database");
const batch_processor_1 = require("./batch-processor");
const library_1 = require("@prisma/client/runtime/library");
const client_1 = require("@prisma/client");
const logger_1 = require("../utils/logger");
const config_1 = require("../config");
class JSONLService {
    pricingService;
    userService;
    batchProcessor;
    progressCallback;
    incrementalChanges = { newProjects: [], newSessions: [], newMessages: 0, totalCostAdded: 0 };
    constructor(pricingService, userService, batchSize = 1000) {
        this.pricingService = pricingService;
        this.userService = userService;
        this.batchProcessor = new batch_processor_1.BatchProcessor(batchSize);
    }
    setProgressCallback(callback) {
        this.progressCallback = callback;
    }
    getIncrementalChanges() {
        return this.incrementalChanges;
    }
    async processDirectory(directoryPath) {
        const result = {
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
        const projectsPath = path_1.default.join(directoryPath, "projects");
        try {
            const projectDirs = await fs_1.default.promises.readdir(projectsPath);
            const hiddenPrefix = config_1.configManager.get().processing?.hiddenDirectoryPrefix || '.';
            const validProjects = projectDirs.filter((dir) => !dir.startsWith(hiddenPrefix));
            // Pre-load existing message IDs for efficient duplicate checking
            await this.batchProcessor.loadExistingMessageIds();
            // Process projects sequentially to avoid race conditions with shared batch processor
            for (let i = 0; i < validProjects.length; i++) {
                const projectDir = validProjects[i];
                const projectResult = await this.processProject(path_1.default.join(projectsPath, projectDir), projectDir, i, validProjects.length);
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
                logger_1.logger.debug(`Final flush: ${flushed} messages`);
            }
        }
        catch (error) {
            result.errors.push(`Failed to process directory: ${error}`);
        }
        return result;
    }
    async ensureUserAndMachine() {
        const userId = this.userService.getAnonymousId();
        const machineId = this.userService.getClientMachineId();
        // Ensure user exists
        await database_1.prisma.user.upsert({
            where: { id: userId },
            create: {
                id: userId,
                email: this.userService.getUserInfo()?.auth?.email,
                username: this.userService.getUserInfo()?.auth?.username,
            },
            update: {},
        });
        // Ensure machine exists
        await database_1.prisma.machine.upsert({
            where: { id: machineId },
            create: {
                id: machineId,
                userId,
                machineName: "Unknown",
            },
            update: {},
        });
    }
    async processProject(projectPath, projectName, projectIndex, totalProjects) {
        const result = {
            projectsProcessed: 0,
            sessionsProcessed: 0,
            messagesProcessed: 0,
            errors: [],
            tokenUsageByModel: new Map(),
        };
        try {
            const project = await this.ensureProject(projectName);
            const files = await fs_1.default.promises.readdir(projectPath);
            const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
            // Process files sequentially to avoid database contention
            for (let i = 0; i < jsonlFiles.length; i++) {
                const file = jsonlFiles[i];
                const fileResult = await this.processJSONLFile(path_1.default.join(projectPath, file), project.id, projectName);
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
        }
        catch (error) {
            result.errors.push(`Failed to process project ${projectName}: ${error}`);
        }
        return result;
    }
    async ensureProject(projectName) {
        const userId = this.userService.getAnonymousId();
        const machineId = this.userService.getClientMachineId();
        const projectId = crypto_1.default
            .createHash("sha256")
            .update(`${projectName}:${machineId}`)
            .digest("hex")
            .substring(0, 16);
        // Check if project already exists
        const existingProject = await database_1.prisma.project.findUnique({
            where: {
                projectName_clientMachineId: {
                    projectName,
                    clientMachineId: machineId,
                },
            },
        });
        const isNewProject = !existingProject;
        const project = await database_1.prisma.project.upsert({
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
    async processJSONLFile(filePath, projectId, _projectName) {
        const result = {
            projectsProcessed: 0,
            sessionsProcessed: 0,
            messagesProcessed: 0,
            errors: [],
            tokenUsageByModel: new Map(),
        };
        try {
            // Check file status
            const fileStatus = await this.checkFileStatus(filePath);
            const stats = await fs_1.default.promises.stat(filePath);
            // Skip if file hasn't changed - check both modification time AND file size
            const sizeChanged = fileStatus?.fileSize ? BigInt(stats.size) !== fileStatus.fileSize : true;
            const timeChanged = fileStatus?.lastModified ? stats.mtime > fileStatus.lastModified : true;
            if (fileStatus &&
                fileStatus.lastModified &&
                fileStatus.checksum &&
                !timeChanged &&
                !sizeChanged) {
                logger_1.logger.debug(`Skipping ${path_1.default.basename(filePath)}: no changes detected`);
                return result;
            }
            // Log why we're processing this file
            if (fileStatus) {
                if (sizeChanged) {
                    logger_1.logger.debug(`Processing ${path_1.default.basename(filePath)}: file size changed from ${fileStatus.fileSize} to ${stats.size}`);
                }
                else if (timeChanged) {
                    logger_1.logger.debug(`Processing ${path_1.default.basename(filePath)}: file time changed`);
                }
            }
            const userId = this.userService.getAnonymousId();
            const machineId = this.userService.getClientMachineId();
            // Collect all messages first
            const messages = [];
            const uniqueSessions = new Set();
            const fileStream = fs_1.default.createReadStream(filePath);
            const rl = readline_1.default.createInterface({
                input: fileStream,
                crlfDelay: Infinity,
            });
            for await (const line of rl) {
                if (line.trim()) {
                    try {
                        const entry = JSON.parse(line);
                        // Only process entries that are actual messages, not summaries or other metadata
                        if (entry.uuid && entry.sessionId && entry.message && entry.message.role) {
                            messages.push(entry);
                            uniqueSessions.add(entry.sessionId);
                        }
                    }
                    catch (error) {
                        result.errors.push(`Invalid JSON in ${filePath}: ${error}`);
                    }
                }
            }
            // Ensure all sessions exist
            const newSessions = await this.batchProcessor.ensureSessions(Array.from(uniqueSessions), projectId, userId, machineId);
            this.incrementalChanges.newSessions.push(...Array.from(newSessions));
            // Process messages in batch
            for (const entry of messages) {
                if (!entry.message || !entry.uuid || !entry.message.role)
                    continue;
                const messageId = entry.message.id || entry.uuid;
                // Skip if exists (O(1) check)
                if (this.batchProcessor.messageExists(messageId)) {
                    continue;
                }
                // Calculate costs
                let messageCost = new library_1.Decimal(0);
                let pricePerInputToken = null;
                let pricePerOutputToken = null;
                let pricePerCacheWriteToken = null;
                let pricePerCacheReadToken = null;
                if (entry.message.role === "assistant" &&
                    entry.message.usage &&
                    entry.message.model &&
                    !this.pricingService.isSyntheticModel(entry.message.model)) {
                    const costData = this.pricingService.calculateCost(entry.message.usage, entry.message.model);
                    const pricing = this.pricingService.getModelPricing(entry.message.model);
                    messageCost = new library_1.Decimal(costData.costs.total);
                    pricePerInputToken = new library_1.Decimal(pricing.input);
                    pricePerOutputToken = new library_1.Decimal(pricing.output);
                    pricePerCacheWriteToken = new library_1.Decimal(pricing.cacheWrite);
                    pricePerCacheReadToken = new library_1.Decimal(pricing.cacheRead);
                }
                const inputTokens = entry.message.usage?.input_tokens || 0;
                const outputTokens = entry.message.usage?.output_tokens || 0;
                const cacheCreationTokens = entry.message.usage?.cache_creation_input_tokens || 0;
                const cacheReadTokens = entry.message.usage?.cache_read_input_tokens || 0;
                // Determine the writer type based on message content and role
                const writer = this.determineWriter(entry);
                // Add to batch
                const batchMessage = {
                    id: entry.uuid,
                    messageId,
                    requestId: entry.requestId || null,
                    sessionId: entry.sessionId,
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
                    this.updateTokenUsage(result.tokenUsageByModel, entry.message.model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens);
                }
                // Flush if needed
                if (this.batchProcessor.shouldFlush()) {
                    await this.batchProcessor.flush();
                }
            }
            // Update file status
            const checksum = await this.calculateFileChecksum(filePath);
            await database_1.prisma.fileStatus.upsert({
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
        }
        catch (error) {
            result.errors.push(`Failed to process file ${filePath}: ${error}`);
        }
        return result;
    }
    async checkFileStatus(filePath) {
        return await database_1.prisma.fileStatus.findUnique({
            where: { filePath },
        });
    }
    async calculateFileChecksum(filePath) {
        const hash = crypto_1.default.createHash("sha256");
        const stream = fs_1.default.createReadStream(filePath);
        return new Promise((resolve, reject) => {
            stream.on("data", (data) => hash.update(data));
            stream.on("end", () => resolve(hash.digest("hex")));
            stream.on("error", reject);
        });
    }
    updateTokenUsage(tokenUsageByModel, model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens) {
        const existing = tokenUsageByModel.get(model);
        if (existing) {
            existing.inputTokens += inputTokens;
            existing.outputTokens += outputTokens;
            existing.cacheCreationTokens += cacheCreationTokens;
            existing.cacheReadTokens += cacheReadTokens;
        }
        else {
            tokenUsageByModel.set(model, {
                model,
                inputTokens,
                outputTokens,
                cacheCreationTokens,
                cacheReadTokens,
            });
        }
    }
    mergeTokenUsage(target, source) {
        source.forEach((usage, model) => {
            const existing = target.get(model);
            if (existing) {
                existing.inputTokens += usage.inputTokens;
                existing.outputTokens += usage.outputTokens;
                existing.cacheCreationTokens += usage.cacheCreationTokens;
                existing.cacheReadTokens += usage.cacheReadTokens;
            }
            else {
                target.set(model, { ...usage });
            }
        });
    }
    /**
     * Determine the writer type based on message role and content
     */
    determineWriter(entry) {
        if (!entry.message) {
            return client_1.MessageWriter.agent;
        }
        const role = entry.message.role;
        // Assistant messages are always from the assistant
        if (role === "assistant") {
            return client_1.MessageWriter.assistant;
        }
        // For user messages, check for tool_use_id to distinguish agent vs human
        if (role === "user") {
            if (entry.message.content && Array.isArray(entry.message.content)) {
                const hasToolUseId = entry.message.content.some((content) => content.tool_use_id);
                if (hasToolUseId) {
                    return client_1.MessageWriter.agent; // Tool results are agentic
                }
            }
            // Everything else is human input
            return client_1.MessageWriter.human;
        }
        // Default to agent for any other role
        return client_1.MessageWriter.agent;
    }
}
exports.JSONLService = JSONLService;
//# sourceMappingURL=jsonl.service.js.map