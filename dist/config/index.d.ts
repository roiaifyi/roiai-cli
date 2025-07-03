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
        anonymousIdPrefix?: string;
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
        retryWarningThreshold?: number;
        recentPushHistoryLimit?: number;
        sampleFailedMessagesLimit?: number;
    };
    network?: {
        authTimeout: number;
        defaultMaxRetries?: number;
        backoff?: {
            baseDelay?: number;
            maxDelay?: number;
        };
        defaultHttpsPort?: string;
        httpStatusCodes?: {
            ok?: number;
            unauthorized?: number;
            forbidden?: number;
            serverErrorThreshold?: number;
        };
    };
    display?: {
        costPrecision: number;
        speedPrecision: number;
        durationPrecision: number;
        maxErrorsDisplayed: number;
        maxSessionsShown: number;
        progressBarWidth?: number;
        sessionIdLength?: number;
        messageIdLength?: number;
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
        bytesBase?: number;
    };
    logging: {
        level: string;
    };
    processing?: {
        batchSizes?: {
            default?: number;
            transaction?: number;
            session?: number;
            aggregation?: number;
        };
        timeouts?: {
            transaction?: number;
        };
        hiddenDirectoryPrefix?: string;
        idSubstringLength?: number;
    };
    machine?: {
        networkInterfacePriority?: string[];
        virtualInterfacePrefixes?: string[];
        machineIdLength?: number;
        machineInfoVersion?: number;
        invalidMacAddress?: string;
    };
    pricing?: {
        syntheticModels?: string[];
        defaultFallbackModel?: string;
        modelIdMappings?: {
            [key: string]: string;
        };
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
            noToken?: string;
            noUserId?: string;
        };
        push?: {
            requiresAuth?: string;
            cannotPushWithoutAuth?: string;
        };
        machine?: {
            noValidInterface?: string;
        };
        httpErrors?: {
            [key: string]: string;
        };
    };
}
declare class ConfigManager {
    private config;
    private environment;
    constructor();
    private validateConfig;
    private logConfigurationSource;
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
        retryWarningThreshold?: number;
        recentPushHistoryLimit?: number;
        sampleFailedMessagesLimit?: number;
    };
    getApiConfig(): {
        baseUrl: string;
        endpoints: {
            login: string;
            push: string;
        };
        uuidNamespace?: string;
    };
    getMachineConfig(): {
        networkInterfacePriority?: string[];
        virtualInterfacePrefixes?: string[];
        machineIdLength?: number;
        machineInfoVersion?: number;
        invalidMacAddress?: string;
    };
}
export declare const configManager: ConfigManager;
export {};
//# sourceMappingURL=index.d.ts.map