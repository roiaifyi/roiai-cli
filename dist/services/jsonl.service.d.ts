import { ProcessingResult, ProcessingProgress } from "../models/types";
import { PricingService } from "./pricing.service";
import { UserService } from "./user.service";
import { Decimal } from "@prisma/client/runtime/library";
export declare class JSONLService {
    private pricingService;
    private userService;
    private batchProcessor;
    private progressCallback?;
    private incrementalChanges;
    constructor(pricingService: PricingService, userService: UserService, batchSize?: number);
    setProgressCallback(callback: (progress: ProcessingProgress) => void): void;
    getIncrementalChanges(): {
        newProjects: string[];
        newSessions: string[];
        newMessages: number;
        totalCostAdded: number;
    };
    processDirectory(directoryPath: string): Promise<ProcessingResult>;
    private ensureUserAndMachine;
    private processProject;
    ensureProject(projectName: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        totalSessions: number;
        totalMessages: bigint;
        totalCost: Decimal;
        totalInputTokens: bigint;
        totalOutputTokens: bigint;
        totalCacheCreationTokens: bigint;
        totalCacheReadTokens: bigint;
        userId: string;
        projectName: string;
        clientMachineId: string;
    }>;
    processJSONLFile(filePath: string, projectId: string, _projectName?: string): Promise<ProcessingResult>;
    private checkFileStatus;
    private calculateFileChecksum;
    private updateTokenUsage;
    private mergeTokenUsage;
}
//# sourceMappingURL=jsonl.service.d.ts.map