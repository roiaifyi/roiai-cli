import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';
import fetch from 'node-fetch';
import { PricingService, PricingCache } from '../../src/services/pricing.service';
import { configManager } from '../../src/config';
import { logger } from '../../src/utils/logger';

// Mock dependencies
jest.mock('node-fetch');
jest.mock('../../src/config');
jest.mock('../../src/utils/logger');

const mockFetch = fetch as jest.MockedFunction<typeof fetch>;
const mockConfigManager = configManager as jest.Mocked<typeof configManager>;
const mockLogger = logger as jest.Mocked<typeof logger>;

// Sample pricing data matching the ai-models-pricing format
const samplePricingData = {
  metadata: {
    id: "anthropic-claude",
    provider: "Anthropic",
    providerUrl: "https://www.anthropic.com",
    apiEndpoint: "https://api.anthropic.com",
    source: "https://docs.anthropic.com/en/docs/about-claude/pricing",
    lastUpdated: "2025-06-14T00:37:13.796Z",
    version: "1.0.0",
    description: "Official Anthropic Claude API pricing data with cache rates",
    currency: "USD",
    unit: "per token",
    notes: "Claude models support prompt caching for reduced costs on repeated context"
  },
  models: [
    {
      modelId: "claude-opus-4",
      name: "Claude Opus 4",
      input: 0.000015,
      output: 0.000075,
      cache: {
        "5m": { write: 0.00001875, read: 0.0000015 },
        "1h": { write: 0.00003, read: 0.0000015 }
      }
    },
    {
      modelId: "claude-sonnet-3.5",
      name: "Claude 3.5 Sonnet",
      input: 0.000003,
      output: 0.000015,
      cache: {
        "5m": { write: 0.00000375, read: 0.0000003 },
        "1h": { write: 0.000006, read: 0.0000003 }
      }
    }
  ]
};

describe('PricingService', () => {
  let pricingService: PricingService;
  let mockConfig: any;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Save and clear NODE_ENV for testing actual fetch behavior
    originalNodeEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    
    // Setup default mock config
    mockConfig = {
      pricingUrl: 'https://example.com/pricing.json',
      pricingCacheTimeout: 3600000, // 1 hour
      cacheDurationDefault: 5
    };
    
    mockConfigManager.getClaudeCodeConfig.mockReturnValue(mockConfig);
    
    // Mock logger methods
    mockLogger.debug.mockImplementation(() => {});
    mockLogger.error.mockImplementation(() => {});
    mockLogger.warn.mockImplementation(() => {});
    mockLogger.success.mockImplementation(() => {});
    
    // Create new service instance
    pricingService = new PricingService();
  });

  afterEach(() => {
    // Restore original NODE_ENV
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
    jest.resetModules();
  });

  describe('loadPricingData', () => {
    test('should fetch pricing data from remote URL on first load', async () => {
      // Mock successful fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => samplePricingData
      } as any);

      await pricingService.loadPricingData();

      expect(mockFetch).toHaveBeenCalledWith(mockConfig.pricingUrl);
      expect(mockLogger.success).toHaveBeenCalledWith('Loaded pricing data from remote source');
      
      // Verify pricing data is loaded by checking if calculateCost works
      const result = pricingService.calculateCost({ input_tokens: 100, output_tokens: 50 }, 'claude-3-5-sonnet-20241022');
      expect(result.costs.total).toBeCloseTo(0.0012);
    });

    test('should use cached data when within timeout', async () => {
      // First load
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => samplePricingData
      } as any);
      
      await pricingService.loadPricingData();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      
      // Second load should use cache
      await pricingService.loadPricingData();
      expect(mockFetch).toHaveBeenCalledTimes(1); // No additional fetch
      expect(mockLogger.debug).toHaveBeenCalledWith('Using cached pricing data');
    });

    test('should fetch new data when cache timeout is 0', async () => {
      mockConfig.pricingCacheTimeout = 0;
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => samplePricingData
      } as any);
      
      // Multiple loads should always fetch
      await pricingService.loadPricingData();
      await pricingService.loadPricingData();
      
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('should refetch when cache expires', async () => {
      mockConfig.pricingCacheTimeout = 100; // 100ms timeout
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => samplePricingData
      } as any);
      
      // First load
      await pricingService.loadPricingData();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      
      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should fetch again
      await pricingService.loadPricingData();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('should handle fetch errors and use defaults', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      
      await pricingService.loadPricingData();
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to fetch pricing data:',
        expect.any(Error)
      );
      expect(mockLogger.warn).toHaveBeenCalledWith('Using default pricing data');
      
      // Should have default data - verify by checking calculateCost works
      const cost = pricingService.calculateCost({ input_tokens: 100 }, 'claude-sonnet-3.5');
      expect(cost.costs.input).toBeCloseTo(0.0003);
    });

    test('should use expired cache on fetch failure if available', async () => {
      // First successful load
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => samplePricingData
      } as any);
      
      await pricingService.loadPricingData();
      
      // Wait for cache to expire
      mockConfig.pricingCacheTimeout = 100;
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Load again with expired cache data
      const expiredCache: PricingCache = {
        data: samplePricingData as any,
        lastFetchTime: Date.now() - 7200000 // 2 hours ago
      };
      
      // Manually set expired cache
      (pricingService as any).cache = expiredCache;
      
      // Mock fetch failure
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      
      await pricingService.loadPricingData();
      
      expect(mockLogger.warn).toHaveBeenCalledWith('Using expired cache due to fetch failure');
      
      // Should still have the expired cache data - verify pricing still works
      const cost = pricingService.calculateCost({ input_tokens: 100 }, 'claude-opus-4');
      expect(cost.costs.input).toBeCloseTo(0.0015); // 100 * 0.000015
    });

    test('should handle HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      } as any);
      
      await pricingService.loadPricingData();
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to fetch pricing data:',
        expect.any(Error)
      );
    });

    test('should handle concurrent fetch requests', async () => {
      let resolveJson: any;
      const jsonPromise = new Promise(resolve => { resolveJson = resolve; });
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => jsonPromise
      } as any);
      
      // Start multiple loads concurrently
      const load1 = pricingService.loadPricingData();
      const load2 = pricingService.loadPricingData();
      const load3 = pricingService.loadPricingData();
      
      // Resolve the json promise
      resolveJson(samplePricingData);
      
      await Promise.all([load1, load2, load3]);
      
      // Should only fetch once
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('getModelPricing', () => {
    beforeEach(async () => {
      // Pre-load pricing data
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => samplePricingData
      } as any);
      
      await pricingService.loadPricingData();
    });

    test('should return pricing for known model', () => {
      const pricing = pricingService.getModelPricing('claude-opus-4');
      
      expect(pricing.modelId).toBe('claude-opus-4');
      expect(pricing.input).toBe(0.000015);
      expect(pricing.output).toBe(0.000075);
      expect(pricing.cacheWrite).toBe(0.00001875); // 5m cache by default
      expect(pricing.cacheRead).toBe(0.0000015);
    });

    test('should map model variants to base model', () => {
      const pricing = pricingService.getModelPricing('claude-opus-4-20250514');
      
      expect(pricing.modelId).toBe('claude-opus-4');
      expect(pricing.input).toBe(0.000015);
    });

    test('should use 1h cache rates when configured', () => {
      mockConfig.cacheDurationDefault = 60;
      
      const pricing = pricingService.getModelPricing('claude-opus-4');
      
      expect(pricing.cacheWrite).toBe(0.00003); // 1h cache
      expect(pricing.cacheRead).toBe(0.0000015);
    });

    test('should default to claude-sonnet-3.5 for unknown models', () => {
      const pricing = pricingService.getModelPricing('unknown-model');
      
      expect(pricing.modelId).toBe('claude-sonnet-3.5');
      expect(pricing.input).toBe(0.000003);
    });

    test('should return safe defaults if no data available', () => {
      // Create a new instance without loading data
      const freshService = new PricingService();
      
      const pricing = freshService.getModelPricing('claude-gpt-5-turbo');
      
      expect(pricing.input).toBe(0.000003);
      expect(pricing.output).toBe(0.000015);
      expect(pricing.cacheWrite).toBe(0.00000375);
      expect(pricing.cacheRead).toBe(0.0000003);
    });
  });

  describe('calculateCost', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => samplePricingData
      } as any);
      
      await pricingService.loadPricingData();
    });

    test('should calculate costs correctly', () => {
      const usage = {
        input_tokens: 1000,
        output_tokens: 500,
        cache_creation_input_tokens: 2000,
        cache_read_input_tokens: 3000
      };
      
      const result = pricingService.calculateCost(usage, 'claude-opus-4');
      
      expect(result.costs.input).toBeCloseTo(0.015); // 1000 * 0.000015
      expect(result.costs.output).toBeCloseTo(0.0375); // 500 * 0.000075
      expect(result.costs.cacheWrite).toBeCloseTo(0.0375); // 2000 * 0.00001875
      expect(result.costs.cacheRead).toBeCloseTo(0.0045); // 3000 * 0.0000015
      expect(result.costs.total).toBeCloseTo(0.0945);
      
      expect(result.tokens.total).toBe(6500);
    });

    test('should handle missing usage fields', () => {
      const usage = {
        input_tokens: 100
      };
      
      const result = pricingService.calculateCost(usage, 'claude-sonnet-3.5');
      
      expect(result.costs.input).toBeCloseTo(0.0003); // 100 * 0.000003
      expect(result.costs.output).toBe(0);
      expect(result.costs.cacheWrite).toBe(0);
      expect(result.costs.cacheRead).toBe(0);
      expect(result.costs.total).toBeCloseTo(0.0003);
      
      expect(result.tokens.input).toBe(100);
      expect(result.tokens.output).toBe(0);
    });
  });

  describe('isSyntheticModel', () => {
    test('should identify synthetic models', () => {
      expect(pricingService.isSyntheticModel('claude-3-5-sonnet-20241022-concept')).toBe(true);
      expect(pricingService.isSyntheticModel('claude-3-5-sonnet-20241022-thinking')).toBe(true);
    });

    test('should return false for regular models', () => {
      expect(pricingService.isSyntheticModel('claude-opus-4')).toBe(false);
      expect(pricingService.isSyntheticModel('claude-sonnet-3.5')).toBe(false);
    });
  });

  describe('cache expiration', () => {
    test('should refetch data after cache expires', async () => {
      // Load data first
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => samplePricingData
      } as any);
      
      await pricingService.loadPricingData();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      
      // Set short timeout and wait for expiration
      mockConfig.pricingCacheTimeout = 50;
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Second fetch with different data
      const modifiedData = { ...samplePricingData };
      modifiedData.models[0].input = 0.00002; // Different price
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => modifiedData
      } as any);
      
      await pricingService.loadPricingData();
      expect(mockFetch).toHaveBeenCalledTimes(2);
      
      // Verify new data is being used
      const cost = pricingService.calculateCost({ input_tokens: 100 }, 'claude-opus-4');
      expect(cost.costs.input).toBeCloseTo(0.002); // 100 * 0.00002
    });
  });

  describe('getPricingMetadata', () => {
    test('should return metadata when available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => samplePricingData
      } as any);
      
      await pricingService.loadPricingData();
      
      const metadata = pricingService.getPricingMetadata();
      expect(metadata.id).toBe('anthropic-claude');
      expect(metadata.provider).toBe('Anthropic');
    });

    test('should return null when no data available', () => {
      const metadata = pricingService.getPricingMetadata();
      expect(metadata).toBeNull();
    });
  });
});