import { PrismaClient } from '@prisma/client';

export class DatabaseManager {
  static async withDatabase<T>(operation: (prisma: PrismaClient) => Promise<T>): Promise<T> {
    const prisma = new PrismaClient();
    try {
      return await operation(prisma);
    } finally {
      await prisma.$disconnect();
    }
  }
}