import config from 'config';
import path from 'path';
import os from 'os';

export interface Config {
  app: {
    dataDir: string;              // Base directory for app data (e.g., ~/.roiai)
    machineInfoFilename: string;  // Filename for machine info
    signupUrl?: string;           // URL for account signup
  };
  database: {
    path: string;
  };
  user?: {
    infoFilename?: string;  // Just the filename, stored in app.dataDir
    infoPath?: string;      // Full path (for testing or custom locations)
    anonymousIdPrefix?: string;  // Prefix for anonymous user IDs
  };
  claudeCode: {
    rawDataPath: string;
    pricingUrl: string;
    pricingCacheTimeout: number; // in milliseconds, 0 means no cache
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
    apiToken?: string;  // Optional, now comes from user auth
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
    modelIdMappings?: { [key: string]: string };
    defaultPricing?: any; // Pricing data structure
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

class ConfigManager {
  private config: Config;

  constructor() {
    this.config = config as unknown as Config;
    this.validateConfig();
    this.logConfigurationSource();
  }

  private validateConfig(): void {
    // Validate app config
    if (!this.config.app?.dataDir) {
      throw new Error('App data directory is required in configuration');
    }
    
    if (!this.config.app?.machineInfoFilename) {
      throw new Error('Machine info filename is required in configuration');
    }
    
    // Handle tilde expansion for raw data path
    if (this.config.claudeCode.rawDataPath.startsWith('~/')) {
      this.config.claudeCode.rawDataPath = path.join(os.homedir(), this.config.claudeCode.rawDataPath.slice(2));
    }
    
    // Ensure paths are absolute
    if (!path.isAbsolute(this.config.claudeCode.rawDataPath)) {
      this.config.claudeCode.rawDataPath = path.resolve(process.cwd(), this.config.claudeCode.rawDataPath);
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
    } catch (error) {
      throw new Error(`Invalid API base URL: ${this.config.api.baseUrl}`);
    }
  }

  private logConfigurationSource(): void {
    // Configuration logging removed - no longer needed
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


  getApiConfig() {
    return this.config.api;
  }

  getMachineConfig() {
    return this.config.machine || {};
  }
}

export const configManager = new ConfigManager();