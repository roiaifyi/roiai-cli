export declare class PricingService {
    private pricingData;
    private modelMapping;
    constructor();
    private initializeModelMapping;
    loadPricingData(): Promise<void>;
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
}
//# sourceMappingURL=pricing.service.d.ts.map