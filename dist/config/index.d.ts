export interface Config {
    app: {
        dataDir: string;
        machineInfoFilename: string;
    };
    database: {
        path: string;
    };
    user?: {
        infoFilename?: string;
        infoPath?: string;
    };
    claudeCode: {
        rawDataPath: string;
        pricingUrl: string;
        pricingCacheTimeout: number;
        cacheDurationDefault: number;
        batchSize: number;
    };
    push: {
        endpoint: string;
        apiToken?: string;
        batchSize: number;
        maxRetries: number;
        timeout: number;
    };
    watch: {
        pollInterval: number;
        stabilityThreshold: number;
        progressUpdateInterval: number;
        ignored: string[];
    };
    network?: {
        authTimeout: number;
    };
    display?: {
        costPrecision: number;
        speedPrecision: number;
        durationPrecision: number;
        maxErrorsDisplayed: number;
        maxSessionsShown: number;
    };
    logging: {
        level: string;
    };
}
declare class ConfigManager {
    private config;
    constructor();
    private validateConfig;
    get(): Config;
    getClaudeCodeConfig(): {
        rawDataPath: string;
        pricingUrl: string;
        pricingCacheTimeout: number;
        cacheDurationDefault: number;
        batchSize: number;
    };
    getDatabaseConfig(): {
        path: string;
    };
    getPushConfig(): {
        endpoint: string;
        apiToken?: string;
        batchSize: number;
        maxRetries: number;
        timeout: number;
    };
    getWatchConfig(): {
        pollInterval: number;
        stabilityThreshold: number;
        progressUpdateInterval: number;
        ignored: string[];
    };
}
export declare const configManager: ConfigManager;
export {};
//# sourceMappingURL=index.d.ts.map