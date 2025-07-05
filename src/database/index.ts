import { PrismaClient } from '@prisma/client';
import { configManager } from '../config';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { execSync } from 'child_process';

class Database {
  private prisma: PrismaClient;
  private static instance: Database;

  private constructor() {
    let dbPath = configManager.getDatabaseConfig().path;
    
    // Handle tilde expansion
    if (dbPath.startsWith('~/')) {
      dbPath = path.join(os.homedir(), dbPath.slice(2));
    }
    
    // Ensure absolute path
    const absolutePath = path.isAbsolute(dbPath) 
      ? dbPath 
      : path.resolve(process.cwd(), dbPath);
    
    // Ensure directory exists
    const dbDir = path.dirname(absolutePath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${absolutePath}`
        }
      },
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : []
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
  
  async ensureInitialized(): Promise<void> {
    try {
      // Try to query the users table to check if database is initialized
      await this.prisma.user.findFirst();
    } catch (error: any) {
      if (error.message && error.message.includes('does not exist')) {
        // Tables don't exist, run migrations
        await this.runMigrationsAsync();
      } else {
        // Some other error, re-throw
        throw error;
      }
    }
  }
  
  private async runMigrationsAsync(): Promise<void> {
    try {
      console.log('Setting up database for first time use...');
      
      // Find the schema path relative to the package
      const schemaPath = path.join(__dirname, '../../prisma/schema.prisma');
      
      if (!fs.existsSync(schemaPath)) {
        throw new Error('Prisma schema not found');
      }
      
      // Get the absolute database path
      let dbPath = configManager.getDatabaseConfig().path;
      if (dbPath.startsWith('~/')) {
        dbPath = path.join(os.homedir(), dbPath.slice(2));
      }
      const absolutePath = path.isAbsolute(dbPath) 
        ? dbPath 
        : path.resolve(process.cwd(), dbPath);
      
      // Run migrations deploy (not dev) for production
      execSync(`npx --yes prisma migrate deploy --schema="${schemaPath}"`, {
        stdio: 'pipe',  // Suppress Prisma output
        env: {
          ...process.env,
          DATABASE_URL: `file:${absolutePath}`
        }
      });
      
      console.log('✓ Database setup complete');
    } catch (error: any) {
      console.error('Failed to set up database:', error.message);
      throw error;
    }
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