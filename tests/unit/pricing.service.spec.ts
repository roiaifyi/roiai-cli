import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { PricingService } from '../../src/services/pricing.service';
// Mock dependencies
jest.mock('../../src/config');
jest.mock('../../src/utils/logger');

const mockFetch = jest.fn();
// Mock global fetch
global.fetch = mockFetch as any;

// Sample pricing data matching the new format
const mockPricingData = {
  metadata: {
    id: "anthropic-claude",
    provider: "Anthropic",
    providerUrl: "https://www.anthropic.com",
    apiEndpoint: "https://api.anthropic.com",
    source: "test",
    lastUpdated: "2025-06-14T00:37:13.796Z",
    version: "1.0.0",
    description: "Test pricing data",
    currency: "USD",
    unit: "per token",
    notes: "Test data"
  },
  models: [
    {
      modelId: "claude-3-5-sonnet-20241022",
      name: "Claude 3.5 Sonnet",
      input: 0.000003,
      output: 0.000015,
      cache: {
        "5m": {
          write: 0.00000375,
          read: 0.0000003
        }
      }
    },
    {
      modelId: "claude-3-opus-20240229",
      name: "Claude 3 Opus",
      input: 0.000015,
      output: 0.000075,
      cache: {
        "5m": {
          write: 0.00001875,
          read: 0.0000015
        }
      }
    }
  ]
};

describe('PricingService BDD Tests', () => {
  let pricingService: PricingService;
  
  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Mock config
    const configManager = require('../../src/config').configManager;
    jest.spyOn(configManager, 'getClaudeCodeConfig').mockReturnValue({
      pricingUrl: 'https://example.com/pricing.json',
      pricingCacheTimeout: 3600000,
      cacheDurationDefault: 5
    });
    jest.spyOn(configManager, 'get').mockReturnValue({
      pricing: {
        syntheticModels: ['claude-3-5-sonnet-20241022:reasoning', 'o1', 'o1-mini', 'o1-preview'],
        modelIdMappings: {}
      },
      claudeCode: {
        pricingUrl: 'https://example.com/pricing.json',
        pricingCacheTimeout: 3600000,
        cacheDurationDefault: 5
      }
    } as any);
    
    // Mock logger to prevent console output
    const logger = require('../../src/utils/logger').logger;
    jest.spyOn(logger, 'debug').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'success').mockImplementation(() => {});
    
    // Mock successful fetch
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockPricingData
    } as any);
    
    pricingService = new PricingService();
    await pricingService.loadPricingData();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  describe('Given I have pricing data for Claude models', () => {
    describe('When I calculate costs for a message with standard tokens', () => {
      it('Then it should calculate the correct cost based on input and output tokens', () => {
        // Arrange
        const usage = {
          input_tokens: 1000,
          output_tokens: 500,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null
        };
        
        // Act
        const result = pricingService.calculateCost(
          usage,
          'claude-3-5-sonnet-20241022'
        );
        
        // Assert
        // Input: 1000 * 0.000003 = 0.003
        // Output: 500 * 0.000015 = 0.0075
        // Total: 0.0105
        expect(result.costs.total).toBe(0.0105);
      });
    });
    
    describe('When I calculate costs for a message with cache tokens', () => {
      it('Then it should include cache token costs in the calculation', () => {
        // Arrange
        const usage = {
          input_tokens: 1000,
          output_tokens: 500,
          cache_creation_input_tokens: 2000,
          cache_read_input_tokens: 5000
        };
        
        // Act
        const result = pricingService.calculateCost(
          usage,
          'claude-3-5-sonnet-20241022'
        );
        
        // Assert
        // Input: 1000 * 0.000003 = 0.003
        // Output: 500 * 0.000015 = 0.0075
        // Cache Write: 2000 * 0.00000375 = 0.0075
        // Cache Read: 5000 * 0.0000003 = 0.0015
        // Total: 0.0195
        expect(result.costs.total).toBeCloseTo(0.0195, 10);
      });
    });
    
    describe('When I calculate costs for different Claude models', () => {
      it('Then it should use the correct pricing for each model', () => {
        // Arrange
        const usage = {
          input_tokens: 1000,
          output_tokens: 1000
        };
        
        // Act - Sonnet
        const sonnetResult = pricingService.calculateCost(
          usage,
          'claude-3-5-sonnet-20241022'
        );
        
        // Act - Opus
        const opusResult = pricingService.calculateCost(
          usage,
          'claude-opus-4'
        );
        
        // Assert
        // Sonnet: (1000 * 0.000003) + (1000 * 0.000015) = 0.018
        expect(sonnetResult.costs.total).toBeCloseTo(0.018, 10);
        
        // Opus: (1000 * 0.000015) + (1000 * 0.000075) = 0.09
        expect(opusResult.costs.total).toBeCloseTo(0.09, 10);
      });
    });
    
    describe('When I check if a model is synthetic', () => {
      it('Then it should correctly identify synthetic models', () => {
        expect(pricingService.isSyntheticModel('claude-3-5-sonnet-20241022-concept')).toBe(true);
        expect(pricingService.isSyntheticModel('claude-3-5-sonnet-20241022-thinking')).toBe(true);
        expect(pricingService.isSyntheticModel('claude-3-5-sonnet-20241022')).toBe(false);
      });
    });
  });
});