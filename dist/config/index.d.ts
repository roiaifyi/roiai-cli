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
    api: {
        baseUrl: string;
        endpoints: {
            login: string;
            push: string;
        };
        uuidNamespace?: string;
    };
    push: {
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
    processing?: {
        batchSizes?: {
            default?: number;
            transaction?: number;
            session?: number;
        };
        timeouts?: {
            transaction?: number;
        };
    };
    machine?: {
        networkInterfacePriority?: string[];
        virtualInterfacePrefixes?: string[];
        machineIdLength?: number;
        machineInfoVersion?: number;
    };
    pricing?: {
        syntheticModels?: string[];
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
    getApiConfig(): {
        baseUrl: string;
        endpoints: {
            login: string;
            push: string;
        };
        uuidNamespace?: string;
    };
}
export declare const configManager: ConfigManager;
export {};
//# sourceMappingURL=index.d.ts.map