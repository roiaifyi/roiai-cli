export interface Config {
    database: {
        path: string;
    };
    user?: {
        infoPath?: string;
    };
    claudeCode: {
        rawDataPath: string;
        pricingDataPath: string;
        cacheDurationDefault: number;
        batchSize: number;
    };
    sync: {
        apiEndpoint: string;
        apiToken: string;
        batchSize: number;
        maxRetries: number;
    };
    watch: {
        pollInterval: number;
        ignored: string[];
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
        pricingDataPath: string;
        cacheDurationDefault: number;
        batchSize: number;
    };
    getDatabaseConfig(): {
        path: string;
    };
    getSyncConfig(): {
        apiEndpoint: string;
        apiToken: string;
        batchSize: number;
        maxRetries: number;
    };
    getWatchConfig(): {
        pollInterval: number;
        ignored: string[];
    };
}
export declare const configManager: ConfigManager;
export {};
//# sourceMappingURL=index.d.ts.map