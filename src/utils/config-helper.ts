import { configManager } from '../config';

/**
 * Helper class for accessing configuration values with type safety and defaults
 */
export class ConfigHelper {
  /**
   * Get display configuration values
   */
  static getDisplay() {
    const config = configManager.get();
    return {
      progressBarWidth: config.display?.progressBarWidth || 50,
      progressBarFilled: config.display?.progressBar?.filled || '█',
      progressBarEmpty: config.display?.progressBar?.empty || '░',
      sectionSeparator: config.display?.sectionSeparator || '═',
      sectionSeparatorWidth: config.display?.sectionSeparatorWidth || 50,
      separatorChar: config.display?.separator?.char || '━',
      separatorDefaultWidth: config.display?.separator?.defaultWidth || 40,
      maxFailedMessagesShown: config.display?.maxFailedMessagesShown || 5,
      progressUpdateInterval: config.display?.progressUpdateInterval || 100,
      maxErrorsDisplayed: config.display?.maxErrorsDisplayed || 10,
      bytesBase: config.display?.bytesBase || 1024,
      units: config.display?.units || { bytes: ['Bytes', 'KB', 'MB', 'GB', 'TB'] },
    };
  }

  /**
   * Get network configuration values
   */
  static getNetwork() {
    const config = configManager.get();
    return {
      authTimeout: config.network?.authTimeout || 5000,
      defaultMaxRetries: config.network?.defaultMaxRetries || 3,
      defaultHttpsPort: config.network?.defaultHttpsPort || '443',
      backoff: {
        baseDelay: config.network?.backoff?.baseDelay || 1000,
        maxDelay: config.network?.backoff?.maxDelay || 5000,
      },
      httpStatusCodes: config.network?.httpStatusCodes || {
        ok: 200,
        unauthorized: 401,
        forbidden: 403,
        serverErrorThreshold: 500
      },
    };
  }

  /**
   * Get processing configuration values
   */
  static getProcessing() {
    const config = configManager.get();
    return {
      hiddenDirectoryPrefix: config.processing?.hiddenDirectoryPrefix || '.',
      defaultBatchSize: config.processing?.batchSizes?.default || 1000,
      transactionChunkSize: config.processing?.batchSizes?.transaction || 100,
      sessionBatchSize: config.processing?.batchSizes?.session || 10,
      aggregationBatchSize: config.processing?.batchSizes?.aggregation || 100,
      transactionTimeout: config.processing?.timeouts?.transaction || 30000,
      idSubstringLength: config.processing?.idSubstringLength || 16,
    };
  }

  /**
   * Get error handling patterns
   */
  static getErrorPatterns() {
    const config = configManager.get();
    return {
      auth: config.errorHandling?.patterns?.auth || [
        '401',
        'Unauthorized',
        'Invalid API key',
        'Authentication failed',
        'Token expired'
      ],
      network: config.errorHandling?.patterns?.network || [
        'Network error',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ENOTFOUND',
        'fetch failed'
      ],
    };
  }

  /**
   * Get user configuration values
   */
  static getUserConfig() {
    const config = configManager.get();
    return config.user || {};
  }

  /**
   * Get app configuration values
   */
  static getAppConfig() {
    const config = configManager.get();
    return config.app || {};
  }

  /**
   * Get sync messages
   */
  static getSyncMessages() {
    const config = configManager.get();
    return config.messages?.sync || {
      forceSync: 'ℹ️  Force sync requested. This will take longer as all data will be reprocessed.',
      firstTime: 'ℹ️  First time sync detected. This initial sync will take longer, but future syncs will be blazingly fast!'
    };
  }

  /**
   * Get push configuration
   */
  static getPushConfig() {
    const config = configManager.get();
    return {
      batchSize: config.push?.batchSize || 1000,
      maxRetries: config.push?.maxRetries || 5,
      timeout: config.push?.timeout || 30000,
      authRecheckInterval: config.push?.authRecheckInterval || 10,
      retryWarningThreshold: config.push?.retryWarningThreshold || 3,
      recentPushHistoryLimit: config.push?.recentPushHistoryLimit || 10,
      sampleFailedMessagesLimit: config.push?.sampleFailedMessagesLimit || 5,
    };
  }
}