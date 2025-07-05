import { PrismaClient } from '@prisma/client';
import { configManager } from '../config';
import path from 'path';

class Database {
  private prisma: PrismaClient;
  private static instance: Database;

  private constructor() {
    const dbPath = configManager.getDatabaseConfig().path;
    const absolutePath = path.isAbsolute(dbPath) 
      ? dbPath 
      : path.resolve(process.cwd(), dbPath);
    
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${absolutePath}`
        }
      },
      log: ['error', 'warn']
    });
  }

  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  getClient(): PrismaClient {
    return this.prisma;
  }

  async connect(): Promise<void> {
    await this.prisma.$connect();
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async clearAllData(): Promise<void> {
    // Delete in reverse order of dependencies
    await this.prisma.messageSyncStatus.deleteMany();
    await this.prisma.fileStatus.deleteMany();
    await this.prisma.message.deleteMany();
    await this.prisma.session.deleteMany();
    await this.prisma.project.deleteMany();
    await this.prisma.machine.deleteMany();
    await this.prisma.user.deleteMany();
  }
}

// Lazy initialization to avoid loading Prisma before it's generated
let _db: Database | null = null;
let _prisma: PrismaClient | null = null;

export const getDb = (): Database => {
  if (!_db) {
    _db = Database.getInstance();
  }
  return _db;
};

export const getPrisma = (): PrismaClient => {
  if (!_prisma) {
    _prisma = getDb().getClient();
  }
  return _prisma;
};

// For backward compatibility
export const db = new Proxy({} as Database, {
  get(_, prop) {
    return getDb()[prop as keyof Database];
  }
});

export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    return getPrisma()[prop as keyof PrismaClient];
  }
});