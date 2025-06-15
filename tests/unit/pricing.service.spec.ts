import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PricingService } from '../../src/services/pricing.service';
import * as path from 'path';
import * as fs from 'fs';
import { TEST_DATA_DIR } from '../setup';

describe('PricingService BDD Tests', () => {
  let pricingService: PricingService;
  let pricingDataPath: string;
  
  beforeEach(() => {
    pricingDataPath = path.join(TEST_DATA_DIR, 'pricing-data.json');
  });
  
  describe('Given I have pricing data for Claude models', () => {
    beforeEach(async () => {
      // Create test pricing data in the format expected by PricingService
      const pricingData = {
        models: [
          {
            id: "claude-3-5-sonnet-20241022",
            name: "Claude 3.5 Sonnet",
            input: 0.000003,
            output: 0.000015,
            originalRates: {
              inputPerMillion: 3,
              outputPerMillion: 15
            }
          },
          {
            id: "claude-3-opus-20240229",
            name: "Claude 3 Opus",
            input: 0.000015,
            output: 0.000075,
            originalRates: {
              inputPerMillion: 15,
              outputPerMillion: 75
            }
          }
        ],
        cache: {
          durations: {
            "5min": {
              write: 0.00000375,
              read: 0.0000003
            }
          }
        }
      };
      
      fs.mkdirSync(path.dirname(pricingDataPath), { recursive: true });
      fs.writeFileSync(pricingDataPath, JSON.stringify(pricingData, null, 2));
      
      pricingService = new PricingService();
      // Mock the config manager to use our test path
      const configManager = require('../../src/config').configManager;
      jest.spyOn(configManager, 'getClaudeCodeConfig').mockReturnValue({
        pricingDataPath,
        cacheDurationDefault: 5
      });
      
      // Ensure pricing data is loaded by calling the load method
      await pricingService.loadPricingData();
      
      // Verify pricing data was loaded
      const testPricing = pricingService.getModelPricing('claude-3-5-sonnet-20241022');
      expect(testPricing).toBeDefined();
    });
    
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
        // Cache Write: 2000 * 0.00000375 = 0.0075
        // Total: 0.018
        expect(result.costs.total).toBeCloseTo(0.018, 10);
      });
      
      it('Then it should calculate cache read costs when reading from cache', () => {
        // Arrange
        const usage = {
          input_tokens: 500,
          output_tokens: 200,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: 1500
        };
        
        // Act
        const result = pricingService.calculateCost(
          usage,
          'claude-3-5-sonnet-20241022'
        );
        
        // Assert
        // Input: 500 * 0.000003 = 0.0015
        // Output: 200 * 0.000015 = 0.003
        // Cache Read: 1500 * 0.0000003 = 0.00045
        // Total: 0.00495
        expect(result.costs.total).toBe(0.00495);
      });
    });
    
    describe('When I calculate costs for different models', () => {
      it('Then it should use the correct pricing for each model', () => {
        // Arrange
        const usage = {
          input_tokens: 1000,
          output_tokens: 500,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null
        };
        
        // Act
        const sonnetResult = pricingService.calculateCost(
          usage,
          'claude-3-5-sonnet-20241022'
        );
        const opusResult = pricingService.calculateCost(
          usage,
          'claude-3-opus-20240229'
        );
        
        // Assert
        // Sonnet: (1000 * 0.000003) + (500 * 0.000015) = 0.0105
        expect(sonnetResult.costs.total).toBe(0.0105);
        
        // Opus: (1000 * 0.000015) + (500 * 0.000075) = 0.0525
        expect(opusResult.costs.total).toBe(0.0525);
        
        // Opus should be 5x more expensive
        expect(opusResult.costs.total).toBeCloseTo(sonnetResult.costs.total * 5, 10);
      });
    });
    
    describe('When I request pricing for an unknown model', () => {
      it('Then it should use default pricing (Sonnet 3.5)', () => {
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
          'unknown-model'
        );
        
        // Assert - should use Sonnet 3.5 pricing as default
        expect(result.costs.total).toBe(0.0105);
      });
    });
    
    describe('When I get model pricing information', () => {
      it('Then it should return the correct pricing details', () => {
        // Act
        const sonnetPricing = pricingService.getModelPricing('claude-3-5-sonnet-20241022');
        const opusPricing = pricingService.getModelPricing('claude-3-opus-20240229');
        const unknownPricing = pricingService.getModelPricing('unknown-model');
        
        // Assert
        expect(sonnetPricing.input).toBe(0.000003);
        expect(sonnetPricing.output).toBe(0.000015);
        expect(sonnetPricing.cacheWrite).toBe(0.00000375);
        expect(sonnetPricing.cacheRead).toBe(0.0000003);
        
        // Opus pricing should include the original fields plus formatted cache rates
        expect(opusPricing.input).toBe(0.000015);
        expect(opusPricing.output).toBe(0.000075);
        expect(opusPricing.cacheWrite).toBeCloseTo(0.00000375, 10); // Uses default 5min cache rate
        expect(opusPricing.cacheRead).toBeCloseTo(0.0000003, 10);
        
        // Unknown model should get default pricing
        expect(unknownPricing.input).toBe(0.000003);
        expect(unknownPricing.output).toBe(0.000015);
        expect(unknownPricing.cacheWrite).toBe(0.00000375);
        expect(unknownPricing.cacheRead).toBe(0.0000003);
      });
    });
  });
  
  describe('Given the pricing data file does not exist', () => {
    beforeEach(async () => {
      pricingService = new PricingService();
      // Mock to simulate missing file
      const configManager = require('../../src/config').configManager;
      jest.spyOn(configManager, 'getClaudeCodeConfig').mockReturnValue({
        pricingDataPath: '/non/existent/path.json',
        cacheDurationDefault: 5
      });
      await pricingService.loadPricingData();
    });
    
    describe('When I try to calculate costs', () => {
      it('Then it should use default pricing data', () => {
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
        
        // Assert - should still work with default pricing
        expect(result.costs.total).toBeGreaterThan(0);
      });
    });
  });
});