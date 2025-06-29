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
        authRecheckInterval?: number;
    };
    network?: {
        authTimeout: number;
        defaultMaxRetries?: number;
        backoff?: {
            baseDelay?: number;
            maxDelay?: number;
        };
        defaultHttpsPort?: string;
    };
    display?: {
        costPrecision: number;
        speedPrecision: number;
        durationPrecision: number;
        maxErrorsDisplayed: number;
        maxSessionsShown: number;
        progressBarWidth?: number;
        progressBar?: {
            filled?: string;
            empty?: string;
        };
        separator?: {
            char?: string;
            defaultWidth?: number;
        };
        sectionSeparator?: string;
        sectionSeparatorWidth?: number;
        progressUpdateInterval?: number;
        maxFailedMessagesShown?: number;
        units?: {
            bytes?: string[];
        };
        decimals?: {
            bytes?: number;
        };
        duration?: {
            thresholds?: {
                seconds?: number;
                minutes?: number;
                hours?: number;
            };
        };
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
        hiddenDirectoryPrefix?: string;
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
    errorHandling?: {
        patterns?: {
            auth?: string[];
            network?: string[];
        };
    };
    messages?: {
        sync?: {
            firstTime?: string;
            forceSync?: string;
        };
        auth?: {
            invalidToken?: string;
        };
        httpErrors?: {
            [key: string]: string;
        };
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
        authRecheckInterval?: number;
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