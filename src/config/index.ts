import config from 'config';
import path from 'path';
import fs from 'fs';

export interface Config {
  database: {
    path: string;
  };
  user?: {
    infoPath?: string;
  };
  claudeCode: {
    rawDataPath: string;
    pricingUrl: string;
    pricingCacheTimeout: number; // in milliseconds, 0 means no cache
    cacheDurationDefault: number;
    batchSize: number;
  };
  push: {
    endpoint: string;
    apiToken?: string;  // Optional, now comes from user auth
    batchSize: number;
    maxRetries: number;
    timeout: number;
  };
  watch: {
    pollInterval: number;
    ignored: string[];
  };
  logging: {
    level: string;
  };
}

class ConfigManager {
  private config: Config;

  constructor() {
    this.config = config as unknown as Config;
    this.validateConfig();
  }

  private validateConfig(): void {
    // Ensure paths are absolute
    if (!path.isAbsolute(this.config.claudeCode.rawDataPath)) {
      this.config.claudeCode.rawDataPath = path.resolve(process.cwd(), this.config.claudeCode.rawDataPath);
    }

    // Check if Claude raw data path exists
    if (!fs.existsSync(this.config.claudeCode.rawDataPath)) {
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

  get(): Config {
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

export const configManager = new ConfigManager();