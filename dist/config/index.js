"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configManager = void 0;
const config_1 = __importDefault(require("config"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
class ConfigManager {
    config;
    environment;
    constructor() {
        this.config = config_1.default;
        this.environment = process.env.NODE_ENV || 'default';
        this.validateConfig();
        this.logConfigurationSource();
    }
    validateConfig() {
        // Validate app config
        if (!this.config.app?.dataDir) {
            throw new Error('App data directory is required in configuration');
        }
        if (!this.config.app?.machineInfoFilename) {
            throw new Error('Machine info filename is required in configuration');
        }
        // Handle tilde expansion for raw data path
        if (this.config.claudeCode.rawDataPath.startsWith('~/')) {
            this.config.claudeCode.rawDataPath = path_1.default.join(os_1.default.homedir(), this.config.claudeCode.rawDataPath.slice(2));
        }
        // Ensure paths are absolute
        if (!path_1.default.isAbsolute(this.config.claudeCode.rawDataPath)) {
            this.config.claudeCode.rawDataPath = path_1.default.resolve(process.cwd(), this.config.claudeCode.rawDataPath);
        }
        // Don't check if Claude raw data path exists here - it should be checked at runtime
        // when the sync command is run, not at startup
        // Validate pricing URL
        if (!this.config.claudeCode.pricingUrl) {
            throw new Error('Pricing URL is required in configuration');
        }
        // Validate cache timeout
        if (this.config.claudeCode.pricingCacheTimeout < 0) {
            throw new Error('Pricing cache timeout must be >= 0');
        }
        // Validate API configuration
        if (!this.config.api?.baseUrl) {
            throw new Error('API base URL is required in configuration');
        }
        // Validate that base URL is a valid URL
        try {
            new URL(this.config.api.baseUrl);
        }
        catch (error) {
            throw new Error(`Invalid API base URL: ${this.config.api.baseUrl}`);
        }
    }
    logConfigurationSource() {
        // Only log in development or when explicitly debugging
        if (this.environment === 'development' || process.env.DEBUG_CONFIG) {
            console.log(`Configuration loaded for environment: ${this.environment}`);
            console.log(`API endpoint: ${this.config.api.baseUrl}`);
        }
    }
    get() {
        return this.config;
    }
    getClaudeCodeConfig() {
        return this.config.claudeCode;
    }
    getDatabaseConfig() {
        return this.config.database;
    }
    getPushConfig() {
        return this.config.push;
    }
    getApiConfig() {
        return this.config.api;
    }
    getMachineConfig() {
        return this.config.machine || {};
    }
}
exports.configManager = new ConfigManager();
//# sourceMappingURL=index.js.map