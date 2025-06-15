export interface JSONLEntry {
    type: string;
    sessionId?: string;
    message?: {
        id: string;
        type?: string;
        role?: string;
        model?: string;
        usage?: {
            input_tokens?: number;
            output_tokens?: number;
            cache_creation_input_tokens?: number;
            cache_read_input_tokens?: number;
            service_tier?: string;
        };
        content?: any[];
    };
    requestId?: string;
    uuid?: string;
    timestamp?: string;
    cwd?: string;
    isSidechain?: boolean;
    userType?: string;
    version?: string;
    summary?: string;
    leafUuid?: string;
}
export interface PricingData {
    metadata?: {
        id: string;
        provider: string;
        providerUrl: string;
        apiEndpoint: string;
        source: string;
        lastUpdated: string;
        version: string;
        description: string;
        currency: string;
        unit: string;
        notes: string;
    };
    models: Array<{
        modelId: string;
        name: string;
        input: number;
        output: number;
        cache?: {
            '5m': {
                write: number;
                read: number;
            };
            '1h': {
                write: number;
                read: number;
            };
        };
        originalRates?: {
            input: string;
            output: string;
            cache5mWrite?: string;
            cache1hWrite?: string;
            cacheRead?: string;
        };
    }>;
}
export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalCost: number;
}
export interface TokenUsageByModel {
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
}
export interface ProcessingResult {
    projectsProcessed: number;
    sessionsProcessed: number;
    messagesProcessed: number;
    errors: string[];
    tokenUsageByModel: Map<string, TokenUsageByModel>;
}
export interface ProcessingProgress {
    totalProjects: number;
    processedProjects: number;
    currentProject: string;
    totalFiles: number;
    processedFiles: number;
    currentFile: string;
    messagesInCurrentFile: number;
    processedMessagesInCurrentFile: number;
}
export interface UserInfo {
    userId: string;
    clientMachineId: string;
    email?: string;
}
//# sourceMappingURL=types.d.ts.map