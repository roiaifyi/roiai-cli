import { PricingData } from "../models/types";
import { configManager } from "../config";
import { logger } from "../utils/logger";

export interface PricingCache {
  data: PricingData | null;
  lastFetchTime: number;
}

export class PricingService {
  private cache: PricingCache = {
    data: null,
    lastFetchTime: 0
  };
  private modelMapping: Map<string, string> = new Map();
  private fetchPromise: Promise<void> | null = null;

  constructor() {
    this.initializeModelMapping();
  }

  private initializeModelMapping(): void {
    // Map various model IDs to their base pricing categories
    const config = configManager.get();
    const modelIdMappings = config.pricing?.modelIdMappings || {};

    for (const [variant, base] of Object.entries(modelIdMappings)) {
      this.modelMapping.set(variant, base as string);
    }
  }

  async loadPricingData(): Promise<void> {
    // In test environment, always use default pricing
    if (process.env.NODE_ENV === 'test') {
      this.cache.data = this.getDefaultPricing();
      this.cache.lastFetchTime = Date.now();
      logger.debug('Using default pricing data for tests');
      return;
    }
    
    const config = configManager.getClaudeCodeConfig();
    const cacheTimeout = config.pricingCacheTimeout;
    
    // Check if cache is valid
    if (this.isCacheValid(cacheTimeout)) {
      logger.debug('Using cached pricing data');
      return;
    }

    // If already fetching, wait for that to complete
    if (this.fetchPromise) {
      await this.fetchPromise;
      return;
    }

    // Start fetching
    this.fetchPromise = this.fetchFromUrl(config.pricingUrl);
    
    try {
      await this.fetchPromise;
    } finally {
      this.fetchPromise = null;
    }
  }

  private isCacheValid(cacheTimeout: number): boolean {
    // If timeout is 0, never use cache
    if (cacheTimeout === 0) {
      return false;
    }
    
    // Check if we have data and it's within the timeout
    return this.cache.data !== null && 
           (Date.now() - this.cache.lastFetchTime) < cacheTimeout;
  }

  private async fetchFromUrl(url: string): Promise<void> {
    logger.debug(`Fetching pricing data from: ${url}`);
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      this.cache.data = this.normalizePricingData(data);
      this.cache.lastFetchTime = Date.now();
      
      logger.debug('✓ Loaded pricing data from remote source');
    } catch (error) {
      logger.debug('Failed to fetch pricing data:', error);
      
      // If we have cached data, use it even if expired
      if (this.cache.data) {
        logger.debug('Using expired cache due to fetch failure');
      } else {
        // No cache available, use defaults
        this.cache.data = this.getDefaultPricing();
        logger.debug('Using default pricing data');
      }
    }
  }

  private normalizePricingData(data: any): PricingData {
    // Handle the format from ai-models-pricing repository
    const normalized: PricingData = {
      metadata: data.metadata,
      models: data.models.map((model: any) => ({
        modelId: model.modelId,
        name: model.name,
        input: model.input,
        output: model.output,
        cache: model.cache,
        originalRates: model.originalRates
      }))
    };

    return normalized;
  }

  private getDefaultPricing(): PricingData {
    const config = configManager.get();
    const defaultPricing = config.pricing?.defaultPricing;
    
    if (!defaultPricing) {
      // Fallback if configuration is missing
      throw new Error('Default pricing configuration not found');
    }
    
    // Add lastUpdated timestamp dynamically
    return {
      ...defaultPricing,
      metadata: {
        ...defaultPricing.metadata,
        lastUpdated: new Date().toISOString()
      }
    };
  }

  getModelPricing(modelId: string): any {
    if (!this.cache.data) {
      this.cache.data = this.getDefaultPricing();
    }

    // Check if it's a mapped model
    const mappedModel = this.modelMapping.get(modelId) || modelId;

    // Find in pricing data
    const pricing = this.cache.data.models.find(
      (m) => m.modelId === mappedModel
    );

    if (!pricing) {
      logger.debug(`Unknown model: ${modelId}, using claude-sonnet-3.5 pricing`);
      // Default to Sonnet 3.5
      const defaultPricing = this.cache.data.models.find(
        (m) => m.modelId === "claude-sonnet-3.5"
      );

      if (!defaultPricing) {
        // Return a safe default if even Sonnet 3.5 is not found
        return {
          input: 0.000003,
          output: 0.000015,
          cacheWrite: 0.00000375,
          cacheRead: 0.0000003,
        };
      }

      return this.formatPricingResponse(defaultPricing);
    }

    return this.formatPricingResponse(pricing);
  }

  private formatPricingResponse(pricing: any): any {
    const cacheDuration = configManager.getClaudeCodeConfig().cacheDurationDefault === 60 ? '1h' : '5m';
    
    let cacheRates;
    if (pricing.cache && pricing.cache[cacheDuration]) {
      cacheRates = pricing.cache[cacheDuration];
    } else {
      // Default cache rates
      cacheRates = { write: 0.00000375, read: 0.0000003 };
    }

    return {
      ...pricing,
      cacheWrite: cacheRates.write,
      cacheRead: cacheRates.read,
    };
  }

  calculateCost(
    usage: any,
    modelId: string
  ): {
    costs: {
      input: number;
      output: number;
      cacheWrite: number;
      cacheRead: number;
      total: number;
    };
    tokens: {
      input: number;
      output: number;
      cacheWrite: number;
      cacheRead: number;
      total: number;
    };
  } {
    const pricing = this.getModelPricing(modelId);

    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const cacheWriteTokens = usage.cache_creation_input_tokens || 0;
    const cacheReadTokens = usage.cache_read_input_tokens || 0;

    const inputCost = inputTokens * pricing.input;
    const outputCost = outputTokens * pricing.output;
    const cacheWriteCost = cacheWriteTokens * pricing.cacheWrite;
    const cacheReadCost = cacheReadTokens * pricing.cacheRead;

    return {
      costs: {
        input: inputCost,
        output: outputCost,
        cacheWrite: cacheWriteCost,
        cacheRead: cacheReadCost,
        total: inputCost + outputCost + cacheWriteCost + cacheReadCost,
      },
      tokens: {
        input: inputTokens,
        output: outputTokens,
        cacheWrite: cacheWriteTokens,
        cacheRead: cacheReadTokens,
        total: inputTokens + outputTokens + cacheWriteTokens + cacheReadTokens,
      },
    };
  }

  isSyntheticModel(modelId: string): boolean {
    // Models that don't count toward usage
    const config = configManager.get();
    const syntheticModels = config.pricing?.syntheticModels || [];
    return syntheticModels.includes(modelId);
  }

  getPricingMetadata(): any {
    return this.cache.data?.metadata || null;
  }

}