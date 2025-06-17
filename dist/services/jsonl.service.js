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
const incremental_aggregation_service_1 = require("./incremental-aggregation.service");
const library_1 = require("@prisma/client/runtime/library");
class JSONLService {
    pricingService;
    userService;
    globalMessageIds = new Set();
    incrementalAggregation;
    useIncrementalAggregation = true;
    incrementalChanges = { newProjects: [], newSessions: [], newMessages: 0, totalCostAdded: 0 };
    progressCallback;
    constructor(pricingService, userService) {
        this.pricingService = pricingService;
        this.userService = userService;
        this.incrementalAggregation = new incremental_aggregation_service_1.IncrementalAggregationService();
    }
    setUseIncrementalAggregation(value) {
        this.useIncrementalAggregation = value;
    }
    getIncrementalChanges() {
        return this.incrementalChanges;
    }
    setProgressCallback(callback) {
        this.progressCallback = callback;
    }
    async processDirectory(directoryPath) {
        const result = {
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
        this.globalMessageIds = new Set();
        // Ensure user and machine exist
        await this.ensureUserAndMachine();
        // Navigate to the projects subdirectory
        const projectsPath = path_1.default.join(directoryPath, "projects");
        try {
            // Check if projects directory exists
            const projectsStats = await fs_1.default.promises.stat(projectsPath);
            if (!projectsStats.isDirectory()) {
                throw new Error(`Projects path is not a directory: ${projectsPath}`);
            }
            const projectDirs = await fs_1.default.promises.readdir(projectsPath);
            const validProjects = projectDirs.filter(dir => !dir.startsWith("."));
            // Count total files first for progress tracking
            let totalFiles = 0;
            for (const projectDir of validProjects) {
                const projectPath = path_1.default.join(projectsPath, projectDir);
                const stats = await fs_1.default.promises.stat(projectPath);
                if (stats.isDirectory()) {
                    const files = await fs_1.default.promises.readdir(projectPath);
                    totalFiles += files.filter(f => f.endsWith(".jsonl")).length;
                }
            }
            let processedProjects = 0;
            let processedFiles = 0;
            for (const projectDir of validProjects) {
                const projectPath = path_1.default.join(projectsPath, projectDir);
                const stats = await fs_1.default.promises.stat(projectPath);
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
                    const projectResult = await this.processProjectDirectory(projectPath, totalFiles, processedFiles, validProjects.length, processedProjects);
                    result.sessionsProcessed += projectResult.sessionsProcessed;
                    result.messagesProcessed += projectResult.messagesProcessed;
                    result.errors.push(...projectResult.errors);
                    if (projectResult.messagesProcessed > 0 || projectResult.sessionsProcessed > 0) {
                        result.projectsProcessed++;
                    }
                    // Merge token usage by model
                    this.mergeTokenUsage(result.tokenUsageByModel, projectResult.tokenUsageByModel);
                    // Update processed files count
                    const files = await fs_1.default.promises.readdir(projectPath);
                    processedFiles += files.filter(f => f.endsWith(".jsonl")).length;
                    processedProjects++;
                }
            }
        }
        catch (error) {
            result.errors.push(`Failed to process directory: ${error}`);
        }
        return result;
    }
    async ensureUserAndMachine() {
        const userId = this.userService.getUserId();
        const machineId = this.userService.getClientMachineId();
        const userEmail = this.userService.getUserInfo().email;
        // Ensure user exists
        await database_1.prisma.user.upsert({
            where: { id: userId },
            create: {
                id: userId,
                email: userEmail,
            },
            update: {},
        });
        // Ensure machine exists
        await database_1.prisma.machine.upsert({
            where: { id: machineId },
            create: {
                id: machineId,
                userId,
                machineName: machineId,
            },
            update: {},
        });
    }
    async processProjectDirectory(projectPath, totalFiles, currentFileOffset, totalProjects, currentProjectIndex) {
        const result = {
            projectsProcessed: 0,
            sessionsProcessed: 0,
            messagesProcessed: 0,
            errors: [],
            tokenUsageByModel: new Map(),
        };
        // Extract project name from path
        const projectName = path_1.default
            .basename(projectPath)
            .replace(/^-Users-[^-]+-/, "");
        // Create or get project
        const project = await this.ensureProject(projectName);
        // Process all JSONL files in the project directory
        const files = await fs_1.default.promises.readdir(projectPath);
        const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
        let fileIndex = 0;
        for (const file of jsonlFiles) {
            const filePath = path_1.default.join(projectPath, file);
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
    async ensureProject(projectName) {
        const userId = this.userService.getUserId();
        const machineId = this.userService.getClientMachineId();
        const projectId = crypto_1.default
            .createHash("sha256")
            .update(`${projectName}:${machineId}`)
            .digest("hex")
            .substring(0, 16);
        // Check if project exists
        const existingProject = await database_1.prisma.project.findUnique({
            where: {
                projectName_clientMachineId: {
                    projectName,
                    clientMachineId: machineId,
                },
            },
        });
        if (!existingProject) {
            // Create new project
            const project = await database_1.prisma.project.create({
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
        }
        else {
            // Update existing project
            return await database_1.prisma.project.update({
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
    async processJSONLFile(filePath, projectId, _projectName) {
        const result = {
            projectsProcessed: 0,
            sessionsProcessed: 0,
            messagesProcessed: 0,
            errors: [],
            tokenUsageByModel: new Map(),
        };
        // Extract session ID from filename
        const sessionId = path_1.default.basename(filePath, ".jsonl");
        // Check file status
        const fileStatus = await this.checkFileStatus(filePath, projectId);
        const stats = await fs_1.default.promises.stat(filePath);
        // Skip if file hasn't changed
        if (fileStatus &&
            fileStatus.lastModified &&
            stats.mtime <= fileStatus.lastModified &&
            fileStatus.checksum) {
            return result;
        }
        const machineId = this.userService.getClientMachineId();
        // Track sessions we've created/seen in this file
        const sessionsInFile = new Set();
        // Count total lines first for progress
        // const totalLines = await this.countFileLines(filePath);
        // Process file line by line
        const fileStream = fs_1.default.createReadStream(filePath);
        const rl = readline_1.default.createInterface({
            input: fileStream,
            crlfDelay: Infinity,
        });
        let lineNumber = 0;
        const sessionData = new Map();
        const messagesToProcess = [];
        try {
            // First pass: collect all messages
            for await (const line of rl) {
                lineNumber++;
                // Skip already processed lines
                if (fileStatus && lineNumber <= fileStatus.lastProcessedLine) {
                    continue;
                }
                try {
                    const entry = JSON.parse(line);
                    // Use filename sessionId if entry doesn't have one
                    if (!entry.sessionId) {
                        entry.sessionId = sessionId;
                    }
                    // Track session ID
                    if (entry.sessionId) {
                        sessionsInFile.add(entry.sessionId);
                    }
                    if (entry.type === "summary") {
                        sessionData.set(entry.sessionId || sessionId, {
                            summary: entry.summary,
                            leafUuid: entry.leafUuid,
                        });
                    }
                    else if (entry.message) {
                        const messageId = entry.message.id || entry.uuid; // Use uuid as fallback
                        // Check global deduplication
                        if (messageId && this.globalMessageIds.has(messageId)) {
                            // Skip duplicate message
                        }
                        else if (messageId) {
                            this.globalMessageIds.add(messageId);
                            messagesToProcess.push(entry);
                        }
                    }
                }
                catch (error) {
                    result.errors.push(`Line ${lineNumber}: ${error}`);
                }
            }
            // Second pass: process messages in topological order
            const processed = new Set();
            const processing = new Set();
            const processInOrder = async (entry) => {
                if (!entry.uuid)
                    return; // Skip entries without UUID
                if (processed.has(entry.uuid))
                    return;
                if (processing.has(entry.uuid)) {
                    console.warn(`Circular dependency detected for message ${entry.uuid}`);
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
                }
                catch (error) {
                    result.errors.push(`Failed to process message ${entry.uuid}: ${error}`);
                }
            }
            // Update file status
            const checksum = await this.calculateFileChecksum(filePath);
            await database_1.prisma.fileStatus.upsert({
                where: { filePath },
                create: {
                    filePath,
                    sessionId: sessionId, // Use filename sessionId for file tracking
                    projectId,
                    userId: this.userService.getUserId(),
                    fileSize: stats.size,
                    lastModified: stats.mtime,
                    lastProcessedLine: lineNumber,
                    lastProcessedAt: new Date(),
                    checksum,
                },
                update: {
                    sessionId: sessionId, // Use filename sessionId for file tracking
                    fileSize: stats.size,
                    lastModified: stats.mtime,
                    lastProcessedLine: lineNumber,
                    lastProcessedAt: new Date(),
                    checksum,
                },
            });
            // Count unique sessions processed in this file
            result.sessionsProcessed = sessionsInFile.size;
        }
        catch (error) {
            result.errors.push(`Failed to process file ${filePath}: ${error}`);
        }
        return result;
    }
    async checkFileStatus(filePath, _projectId) {
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
    async processMessage(entry, projectId, clientMachineId, tokenUsageByModel) {
        if (!entry.message || !entry.sessionId || !entry.uuid)
            return;
        const userId = this.userService.getUserId();
        const messageId = entry.message.id || entry.uuid;
        // Skip if message already exists by uuid
        const existingMessage = await database_1.prisma.message.findUnique({
            where: { uuid: entry.uuid },
        });
        if (existingMessage) {
            return;
        }
        // Also check if a message with this messageId already exists
        const existingByMessageId = await database_1.prisma.message.findFirst({
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
        let messageCost = new library_1.Decimal(0);
        let pricePerInputToken = null;
        let pricePerOutputToken = null;
        let pricePerCacheWriteToken = null;
        let pricePerCacheReadToken = null;
        if (entry.message.role === "assistant" &&
            entry.message.usage &&
            entry.message.model) {
            if (!this.pricingService.isSyntheticModel(entry.message.model)) {
                const costData = this.pricingService.calculateCost(entry.message.usage, entry.message.model);
                const pricing = this.pricingService.getModelPricing(entry.message.model);
                messageCost = new library_1.Decimal(costData.costs.total);
                pricePerInputToken = new library_1.Decimal(pricing.input);
                pricePerOutputToken = new library_1.Decimal(pricing.output);
                pricePerCacheWriteToken = new library_1.Decimal(pricing.cacheWrite);
                pricePerCacheReadToken = new library_1.Decimal(pricing.cacheRead);
            }
        }
        // Ensure session exists before creating message
        const existingSession = await database_1.prisma.session.findUnique({
            where: { id: entry.sessionId },
        });
        if (!existingSession) {
            // Create new session
            await database_1.prisma.session.create({
                data: {
                    id: entry.sessionId,
                    projectId,
                    userId,
                    clientMachineId,
                },
            });
            // Update aggregates for new session (only if using incremental aggregation)
            if (this.useIncrementalAggregation) {
                await this.incrementalAggregation.onSessionCreated({
                    projectId,
                    userId,
                    clientMachineId,
                });
                this.incrementalChanges.newSessions.push(entry.sessionId);
            }
        }
        // Create message
        const inputTokens = entry.message.usage?.input_tokens || 0;
        const outputTokens = entry.message.usage?.output_tokens || 0;
        const cacheCreationTokens = entry.message.usage?.cache_creation_input_tokens || 0;
        const cacheReadTokens = entry.message.usage?.cache_read_input_tokens || 0;
        await database_1.prisma.message.create({
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
        await database_1.prisma.syncStatus.upsert({
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
exports.JSONLService = JSONLService;
//# sourceMappingURL=jsonl.service.js.map