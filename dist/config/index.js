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
        // Ensure paths are absolute
        if (!path_1.default.isAbsolute(this.config.claudeCode.rawDataPath)) {
            this.config.claudeCode.rawDataPath = path_1.default.resolve(process.cwd(), this.config.claudeCode.rawDataPath);
        }
        if (!path_1.default.isAbsolute(this.config.claudeCode.pricingDataPath)) {
            this.config.claudeCode.pricingDataPath = path_1.default.resolve(process.cwd(), this.config.claudeCode.pricingDataPath);
        }
        // Check if Claude raw data path exists
        if (!fs_1.default.existsSync(this.config.claudeCode.rawDataPath)) {
            throw new Error(`Claude raw data path does not exist: ${this.config.claudeCode.rawDataPath}`);
        }
        // Check if pricing data exists
        if (!fs_1.default.existsSync(this.config.claudeCode.pricingDataPath)) {
            console.warn(`Pricing data file not found: ${this.config.claudeCode.pricingDataPath}`);
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
    getSyncConfig() {
        return this.config.sync;
    }
    getWatchConfig() {
        return this.config.watch;
    }
}
exports.configManager = new ConfigManager();
//# sourceMappingURL=index.js.map