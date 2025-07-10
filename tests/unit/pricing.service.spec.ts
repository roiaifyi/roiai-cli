import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PricingService } from '../../src/services/pricing.service';

// Mock dependencies
jest.mock('../../src/config');
jest.mock('../../src/utils/logger');

describe('PricingService Simple Tests', () => {
  let pricingService: PricingService;
  
  beforeEach(() => {
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
        syntheticModels: [
          'claude-3-5-sonnet-20241022:reasoning',
          'claude-3-5-sonnet-20241022-concept',
          'claude-3-5-sonnet-20241022-thinking',
          'o1',
          'o1-mini',
          'o1-preview'
        ],
        modelIdMappings: {},
        defaultFallbackModel: 'claude-sonnet-3.5'
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
    
    pricingService = new PricingService();
  });
  
  describe('isSyntheticModel', () => {
    it('should identify synthetic models correctly', () => {
      expect(pricingService.isSyntheticModel('claude-3-5-sonnet-20241022-concept')).toBe(true);
      expect(pricingService.isSyntheticModel('claude-3-5-sonnet-20241022-thinking')).toBe(true);
      expect(pricingService.isSyntheticModel('o1')).toBe(true);
      expect(pricingService.isSyntheticModel('o1-mini')).toBe(true);
    });
    
    it('should return false for regular models', () => {
      expect(pricingService.isSyntheticModel('claude-opus-4')).toBe(false);
      expect(pricingService.isSyntheticModel('claude-sonnet-3.5')).toBe(false);
      expect(pricingService.isSyntheticModel('claude-3-5-sonnet-20241022')).toBe(false);
    });
  });
  
  describe('calculateCost with defaults', () => {
    it('should calculate costs with default pricing when no data is loaded', () => {
      const usage = {
        input_tokens: 1000,
        output_tokens: 500
      };
      
      // Should use default pricing
      const result = pricingService.calculateCost(usage, 'claude-sonnet-3.5');
      
      // Default pricing for claude-sonnet-3.5 is 0.000003/0.000015
      expect(result.costs.input).toBeCloseTo(0.003); // 1000 * 0.000003
      expect(result.costs.output).toBeCloseTo(0.0075); // 500 * 0.000015
      expect(result.costs.total).toBeCloseTo(0.0105);
      expect(result.tokens.total).toBe(1500);
    });
  });
});