import { PrismaClient } from '@prisma/client';
declare class Database {
    private prisma;
    private static instance;
    private constructor();
    static getInstance(): Database;
    getClient(): PrismaClient;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    clearAllData(): Promise<void>;
}
export declare const db: Database;
export declare const prisma: PrismaClient<import(".prisma/client").Prisma.PrismaClientOptions, never, import("@prisma/client/runtime/library").DefaultArgs>;
export {};
//# sourceMappingURL=index.d.ts.map