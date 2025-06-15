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
    if (!path.isAbsolute(this.config.claudeCode.pricingDataPath)) {
      this.config.claudeCode.pricingDataPath = path.resolve(process.cwd(), this.config.claudeCode.pricingDataPath);
    }

    // Check if Claude raw data path exists
    if (!fs.existsSync(this.config.claudeCode.rawDataPath)) {
      throw new Error(`Claude raw data path does not exist: ${this.config.claudeCode.rawDataPath}`);
    }

    // Check if pricing data exists
    if (!fs.existsSync(this.config.claudeCode.pricingDataPath)) {
      console.warn(`Pricing data file not found: ${this.config.claudeCode.pricingDataPath}`);
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

  getSyncConfig() {
    return this.config.sync;
  }

  getWatchConfig() {
    return this.config.watch;
  }
}

export const configManager = new ConfigManager();