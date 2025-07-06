import { PrismaClient } from '@prisma/client';
import { configManager } from '../config';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { execSync } from 'child_process';

// Delay PrismaClient import until needed
let PrismaClientConstructor: typeof PrismaClient | null = null;

async function loadPrismaClient(): Promise<typeof PrismaClient> {
  if (!PrismaClientConstructor) {
    const module = await import('@prisma/client');
    PrismaClientConstructor = module.PrismaClient;
  }
  return PrismaClientConstructor;
}

class Database {
  private prisma: PrismaClient | null = null;
  private static instance: Database;

  private constructor() {
    // Defer initialization until getClient is called
  }

  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  async initializePrisma(): Promise<void> {
    if (this.prisma) return;

    const PrismaClientClass = await loadPrismaClient();
    
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
    
    this.prisma = new PrismaClientClass({
      datasources: {
        db: {
          url: `file:${absolutePath}`
        }
      },
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : []
    });
  }

  async getClient(): Promise<PrismaClient> {
    await this.initializePrisma();
    return this.prisma!;
  }
  
  async ensureInitialized(): Promise<void> {
    const client = await this.getClient();
    try {
      // Try to query the users table to check if database is initialized
      await client.user.findFirst();
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
      
      // Check if prisma binary is available first
      try {
        execSync('npx --yes prisma --version', {
          stdio: 'ignore',
          cwd: path.join(__dirname, '../..'),
        });
      } catch {
        // Try to use the prisma from node_modules if npx fails
        const prismaBinPath = path.join(__dirname, '../../node_modules/.bin/prisma');
        if (fs.existsSync(prismaBinPath)) {
          // Use the local prisma binary directly
          execSync(`"${prismaBinPath}" migrate deploy --schema="${schemaPath}"`, {
            stdio: 'pipe',
            env: {
              ...process.env,
              DATABASE_URL: `file:${absolutePath}`
            }
          });
          console.log('✓ Database setup complete');
          return;
        } else {
          throw new Error('Prisma CLI not found. Please run: npm install prisma@^6.10.0');
        }
      }
      
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
      if (error.message.includes('ENOENT')) {
        console.error('\nIt appears the Prisma CLI is not installed.');
        console.error('Please try running:');
        console.error('  npm install prisma@^6.10.0');
        console.error('  npx prisma generate');
        console.error('  npx prisma migrate deploy');
      }
      throw error;
    }
  }

  async connect(): Promise<void> {
    const client = await this.getClient();
    await client.$connect();
  }

  async disconnect(): Promise<void> {
    if (this.prisma) {
      await this.prisma.$disconnect();
    }
  }

  async clearAllData(): Promise<void> {
    const client = await this.getClient();
    // Delete in reverse order of dependencies
    await client.messageSyncStatus.deleteMany();
    await client.fileStatus.deleteMany();
    await client.message.deleteMany();
    await client.session.deleteMany();
    await client.project.deleteMany();
    await client.machine.deleteMany();
    await client.user.deleteMany();
  }
}

// Lazy initialization to avoid loading Prisma before it's generated
let _db: Database | null = null;

export const getDb = (): Database => {
  if (!_db) {
    _db = Database.getInstance();
  }
  return _db;
};

// Async version that ensures client is loaded
export const getPrisma = async (): Promise<PrismaClient> => {
  const database = getDb();
  return database.getClient();
};

// For backward compatibility - create proxy that handles async loading
export const db = new Proxy({} as Database, {
  get(_, prop) {
    const database = getDb();
    const value = database[prop as keyof Database];
    if (typeof value === 'function') {
      return value.bind(database);
    }
    return value;
  }
});

// Create a proxy that throws helpful error for synchronous access
export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    throw new Error(
      `Direct access to prisma.${String(prop)} is not available. ` +
      `Please use 'await getPrisma()' to get the PrismaClient instance first, ` +
      `then access the property: const client = await getPrisma(); await client.${String(prop)}(...)`
    );
  }
});