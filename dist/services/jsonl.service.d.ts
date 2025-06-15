import { ProcessingResult, ProcessingProgress } from "../models/types";
import { PricingService } from "./pricing.service";
import { UserService } from "./user.service";
export declare class JSONLService {
    private pricingService;
    private userService;
    private globalMessageIds;
    private incrementalAggregation;
    private useIncrementalAggregation;
    private incrementalChanges;
    private progressCallback?;
    constructor(pricingService: PricingService, userService: UserService);
    setUseIncrementalAggregation(value: boolean): void;
    getIncrementalChanges(): {
        newProjects: string[];
        newSessions: string[];
        newMessages: number;
        totalCostAdded: number;
    };
    setProgressCallback(callback: (progress: ProcessingProgress) => void): void;
    processDirectory(directoryPath: string): Promise<ProcessingResult>;
    private ensureUserAndMachine;
    private processProjectDirectory;
    private ensureProject;
    processJSONLFile(filePath: string, projectId: string, _projectName?: string): Promise<ProcessingResult>;
    private checkFileStatus;
    private calculateFileChecksum;
    private processMessage;
}
//# sourceMappingURL=jsonl.service.d.ts.map