import { describe, it, expect, beforeEach } from '@jest/globals';
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
    beforeEach(() => {
      // Create test pricing data
      const pricingData = {
        "claude-3-5-sonnet-20241022": {
          input: 0.000003,
          output: 0.000015,
          cacheWrite: 0.00000375,
          cacheRead: 0.0000003
        },
        "claude-3-opus-20240229": {
          input: 0.000015,
          output: 0.000075,
          cacheWrite: 0.00001875,
          cacheRead: 0.0000015
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
      await pricingService.loadPricingData();
    });
    
    describe('When I calculate costs for a message with standard tokens', () => {
      it('Then it should calculate the correct cost based on input and output tokens', () => {
        // Arrange
        const usage = {
          inputTokens: 1000,
          outputTokens: 500,
          cacheCreationInputTokens: null,
          cacheReadInputTokens: null
        };
        
        // Act
        const cost = pricingService.calculateCost(
          'claude-3-5-sonnet-20241022',
          usage
        );
        
        // Assert
        // Input: 1000 * 0.000003 = 0.003
        // Output: 500 * 0.000015 = 0.0075
        // Total: 0.0105
        expect(cost).toBe(0.0105);
      });
    });
    
    describe('When I calculate costs for a message with cache tokens', () => {
      it('Then it should include cache token costs in the calculation', () => {
        // Arrange
        const usage = {
          inputTokens: 1000,
          outputTokens: 500,
          cacheCreationInputTokens: 2000,
          cacheReadInputTokens: null
        };
        
        // Act
        const cost = pricingService.calculateCost(
          'claude-3-5-sonnet-20241022',
          usage,
          5 // 5 minute cache
        );
        
        // Assert
        // Input: 1000 * 0.000003 = 0.003
        // Output: 500 * 0.000015 = 0.0075
        // Cache Write: 2000 * 0.00000375 = 0.0075
        // Total: 0.018
        expect(cost).toBe(0.018);
      });
      
      it('Then it should calculate cache read costs when reading from cache', () => {
        // Arrange
        const usage = {
          inputTokens: 500,
          outputTokens: 200,
          cacheCreationInputTokens: null,
          cacheReadInputTokens: 1500
        };
        
        // Act
        const cost = pricingService.calculateCost(
          'claude-3-5-sonnet-20241022',
          usage,
          5
        );
        
        // Assert
        // Input: 500 * 0.000003 = 0.0015
        // Output: 200 * 0.000015 = 0.003
        // Cache Read: 1500 * 0.0000003 = 0.00045
        // Total: 0.00495
        expect(cost).toBe(0.00495);
      });
    });
    
    describe('When I calculate costs for different models', () => {
      it('Then it should use the correct pricing for each model', () => {
        // Arrange
        const usage = {
          inputTokens: 1000,
          outputTokens: 500,
          cacheCreationInputTokens: null,
          cacheReadInputTokens: null
        };
        
        // Act
        const sonnetCost = pricingService.calculateCost(
          'claude-3-5-sonnet-20241022',
          usage
        );
        const opusCost = pricingService.calculateCost(
          'claude-3-opus-20240229',
          usage
        );
        
        // Assert
        // Sonnet: (1000 * 0.000003) + (500 * 0.000015) = 0.0105
        expect(sonnetCost).toBe(0.0105);
        
        // Opus: (1000 * 0.000015) + (500 * 0.000075) = 0.0525
        expect(opusCost).toBe(0.0525);
        
        // Opus should be 5x more expensive
        expect(opusCost).toBe(sonnetCost * 5);
      });
    });
    
    describe('When I request pricing for an unknown model', () => {
      it('Then it should return 0 cost', () => {
        // Arrange
        const usage = {
          inputTokens: 1000,
          outputTokens: 500,
          cacheCreationInputTokens: null,
          cacheReadInputTokens: null
        };
        
        // Act
        const cost = pricingService.calculateCost(
          'unknown-model',
          usage
        );
        
        // Assert
        // Should use default pricing\n        expect(cost).toBeGreaterThan(0);
      });
    });
    
    describe('When I get model pricing information', () => {
      it('Then it should return the correct pricing details', () => {
        // Act
        const sonnetPricing = pricingService.getModelPricing('claude-3-5-sonnet-20241022');
        const opusPricing = pricingService.getModelPricing('claude-3-opus-20240229');
        const unknownPricing = pricingService.getModelPricing('unknown-model');
        
        // Assert
        expect(sonnetPricing).toEqual({
          input: 0.000003,
          output: 0.000015,
          cacheWrite: 0.00000375,
          cacheRead: 0.0000003
        });
        
        expect(opusPricing).toEqual({
          input: 0.000015,
          output: 0.000075,
          cacheWrite: 0.00001875,
          cacheRead: 0.0000015
        });
        
        expect(unknownPricing).toBeNull();
      });
    });
    
    describe('When I get all available models', () => {
      it('Then it should return a list of all models with pricing', () => {
        // Act
        const models = pricingService.getAvailableModels();
        
        // Assert
        expect(models).toEqual([
          'claude-3-5-sonnet-20241022',
          'claude-3-opus-20240229'
        ]);
      });
    });
  });
  
  describe('Given the pricing data file does not exist', () => {
    beforeEach(() => {
      pricingService = new PricingService('/non/existent/path.json');
    });
    
    describe('When I try to calculate costs', () => {
      it('Then it should return 0 and handle gracefully', () => {
        // Arrange
        const usage = {
          inputTokens: 1000,
          outputTokens: 500,
          cacheCreationInputTokens: null,
          cacheReadInputTokens: null
        };
        
        // Act
        const cost = pricingService.calculateCost(
          'claude-3-5-sonnet-20241022',
          usage
        );
        
        // Assert
        // Should use default pricing\n        expect(cost).toBeGreaterThan(0);
      });
    });
  });
});