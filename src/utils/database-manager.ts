import { PrismaClient } from '@prisma/client';

export class DatabaseManager {
  private static instance: PrismaClient;

  static getInstance(): PrismaClient {
    if (!this.instance) {
      this.instance = new PrismaClient();
    }
    return this.instance;
  }

  static async withDatabase<T>(operation: (prisma: PrismaClient) => Promise<T>): Promise<T> {
    const prisma = new PrismaClient();
    try {
      return await operation(prisma);
    } finally {
      await prisma.$disconnect();
    }
  }

  static async disconnect(): Promise<void> {
    if (this.instance) {
      await this.instance.$disconnect();
    }
  }
}