import { PricingData } from "../models/types";
export interface PricingCache {
    data: PricingData | null;
    lastFetchTime: number;
}
export declare class PricingService {
    private cache;
    private modelMapping;
    private fetchPromise;
    constructor();
    private initializeModelMapping;
    loadPricingData(): Promise<void>;
    private isCacheValid;
    private fetchFromUrl;
    private normalizePricingData;
    private getDefaultPricing;
    getModelPricing(modelId: string): any;
    private formatPricingResponse;
    calculateCost(usage: any, modelId: string): {
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
    };
    isSyntheticModel(modelId: string): boolean;
    getPricingMetadata(): any;
}
//# sourceMappingURL=pricing.service.d.ts.map