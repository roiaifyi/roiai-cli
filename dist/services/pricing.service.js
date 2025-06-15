"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PricingService = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const config_1 = require("../config");
class PricingService {
    pricingData = null;
    modelMapping = new Map();
    constructor() {
        this.initializeModelMapping();
    }
    initializeModelMapping() {
        // Map various model IDs to their base pricing categories
        const mappings = {
            // Opus 4 variants
            "claude-opus-4-20250514": "claude-opus-4",
            "anthropic.claude-v4": "claude-opus-4",
            // Sonnet 4 variants
            "claude-sonnet-4-20250514": "claude-sonnet-4",
            "anthropic.claude-3-5-sonnet-20250625-v2:0": "claude-sonnet-4",
            // Sonnet 3.5 variants
            "claude-3-5-sonnet-20241022": "claude-sonnet-3.5",
            "claude-3.5-sonnet": "claude-sonnet-3.5",
            "anthropic.claude-3-5-sonnet-20241022-v2:0": "claude-sonnet-3.5",
            // Haiku variants
            "claude-3-5-haiku-20241022": "claude-haiku-3.5",
            "claude-3.5-haiku": "claude-haiku-3.5",
            "anthropic.claude-3-5-haiku-20241022-v1:0": "claude-haiku-3.5",
        };
        for (const [variant, base] of Object.entries(mappings)) {
            this.modelMapping.set(variant, base);
        }
    }
    async loadPricingData() {
        try {
            const pricingPath = config_1.configManager.getClaudeCodeConfig().pricingDataPath;
            const data = await promises_1.default.readFile(pricingPath, "utf-8");
            this.pricingData = JSON.parse(data);
        }
        catch (error) {
            console.warn("Failed to load pricing data, using defaults:", error);
            this.pricingData = this.getDefaultPricing();
        }
    }
    getDefaultPricing() {
        return {
            models: [
                {
                    id: "claude-opus-4",
                    name: "Claude 3 Opus",
                    input: 0.000015,
                    output: 0.000075,
                    originalRates: {
                        inputPerMillion: 15,
                        outputPerMillion: 75,
                    },
                },
                {
                    id: "claude-sonnet-4",
                    name: "Claude 3.5 Sonnet",
                    input: 0.000003,
                    output: 0.000015,
                    originalRates: {
                        inputPerMillion: 3,
                        outputPerMillion: 15,
                    },
                },
                {
                    id: "claude-sonnet-3.5",
                    name: "Claude 3.5 Sonnet (Previous)",
                    input: 0.000003,
                    output: 0.000015,
                    originalRates: {
                        inputPerMillion: 3,
                        outputPerMillion: 15,
                    },
                },
                {
                    id: "claude-haiku-3.5",
                    name: "Claude 3.5 Haiku",
                    input: 0.00000025,
                    output: 0.00000125,
                    originalRates: {
                        inputPerMillion: 0.25,
                        outputPerMillion: 1.25,
                    },
                },
            ],
            cache: {
                durations: {
                    "5min": {
                        write: 0.00000375,
                        read: 0.0000003,
                    },
                    "1hour": {
                        write: 0.00000375,
                        read: 0.0000003,
                    },
                },
            },
        };
    }
    getModelPricing(modelId) {
        if (!this.pricingData) {
            throw new Error("Pricing data not loaded");
        }
        // Check if it's a mapped model
        const mappedModel = this.modelMapping.get(modelId) || modelId;
        // Find in pricing data - handle both 'id' and 'modelId' fields
        const pricing = this.pricingData.models.find((m) => m.modelId === mappedModel || m.id === mappedModel);
        if (!pricing) {
            // console.warn(`Unknown model: ${modelId}, using Sonnet 3.5 pricing`);
            // Try to find Sonnet 3.5 with either field name
            const defaultPricing = this.pricingData.models.find((m) => m.modelId === "claude-sonnet-3.5" ||
                m.id === "claude-sonnet-3.5");
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
    formatPricingResponse(pricing) {
        // Handle the new format from pricing-data.json
        if (pricing.cache && typeof pricing.cache === "object") {
            const cacheDuration = config_1.configManager.getClaudeCodeConfig().cacheDurationDefault === 60
                ? "1h"
                : "5m";
            const cacheRates = pricing.cache[cacheDuration] || pricing.cache["5m"];
            return {
                ...pricing,
                cacheWrite: cacheRates.write,
                cacheRead: cacheRates.read,
            };
        }
        // Handle the old format
        const cacheDuration = config_1.configManager.getClaudeCodeConfig().cacheDurationDefault === 60
            ? "1hour"
            : "5min";
        const cacheRates = this.pricingData?.cache?.durations?.[cacheDuration] || {
            write: 0.00000375,
            read: 0.0000003,
        };
        return {
            ...pricing,
            cacheWrite: cacheRates.write,
            cacheRead: cacheRates.read,
        };
    }
    calculateCost(usage, modelId) {
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
    isSyntheticModel(modelId) {
        // Models that don't count toward usage
        const syntheticModels = [
            "claude-3-5-sonnet-20241022-concept",
            "claude-3-5-sonnet-20241022-thinking",
        ];
        return syntheticModels.includes(modelId);
    }
}
exports.PricingService = PricingService;
//# sourceMappingURL=pricing.service.js.map