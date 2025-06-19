"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configManager = void 0;
const config_1 = __importDefault(require("config"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
class ConfigManager {
    config;
    constructor() {
        this.config = config_1.default;
        this.validateConfig();
    }
    validateConfig() {
        // Validate app config
        if (!this.config.app?.dataDir) {
            throw new Error('App data directory is required in configuration');
        }
        if (!this.config.app?.machineInfoFilename) {
            throw new Error('Machine info filename is required in configuration');
        }
        // Ensure paths are absolute
        if (!path_1.default.isAbsolute(this.config.claudeCode.rawDataPath)) {
            this.config.claudeCode.rawDataPath = path_1.default.resolve(process.cwd(), this.config.claudeCode.rawDataPath);
        }
        // Check if Claude raw data path exists
        if (!fs_1.default.existsSync(this.config.claudeCode.rawDataPath)) {
            throw new Error(`Claude raw data path does not exist: ${this.config.claudeCode.rawDataPath}`);
        }
        // Validate pricing URL
        if (!this.config.claudeCode.pricingUrl) {
            throw new Error('Pricing URL is required in configuration');
        }
        // Validate cache timeout
        if (this.config.claudeCode.pricingCacheTimeout < 0) {
            throw new Error('Pricing cache timeout must be >= 0');
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
    getWatchConfig() {
        return this.config.watch;
    }
}
exports.configManager = new ConfigManager();
//# sourceMappingURL=index.js.map