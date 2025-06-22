import { PrismaClient, Prisma } from '@prisma/client';

export class DatabaseService {
  constructor(private prisma: PrismaClient) {}
  
  async findOrCreateUser(userId: string, email?: string, username?: string) {
    return await this.prisma.user.upsert({
      where: { id: userId },
      update: { 
        ...(email && { email }),
        ...(username && { username })
      },
      create: {
        id: userId,
        email,
        username
      }
    });
  }
  
  async findOrCreateMachine(machineId: string, userId: string, machineName?: string) {
    return await this.prisma.machine.upsert({
      where: { id: machineId },
      update: {
        ...(machineName && { machineName })
      },
      create: {
        id: machineId,
        userId,
        machineName
      }
    });
  }
  
  async findOrCreateProject(projectId: string, projectName: string, userId: string, clientMachineId: string) {
    return await this.prisma.project.upsert({
      where: { id: projectId },
      update: {},
      create: {
        id: projectId,
        projectName,
        userId,
        clientMachineId
      }
    });
  }
  
  async findOrCreateSession(sessionId: string, projectId: string, userId: string, clientMachineId: string) {
    return await this.prisma.session.upsert({
      where: { id: sessionId },
      update: {},
      create: {
        id: sessionId,
        projectId,
        userId,
        clientMachineId
      }
    });
  }
  
  async createMessage(messageData: {
    id: string;
    messageId: string;
    sessionId: string;
    projectId: string;
    userId: string;
    clientMachineId: string;
    role: string;
    model?: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    timestamp?: Date;
    messageCost: Prisma.Decimal;
    requestId?: string;
    type?: string;
  }) {
    return await this.prisma.message.create({
      data: {
        id: messageData.id,
        messageId: messageData.messageId,
        sessionId: messageData.sessionId,
        projectId: messageData.projectId,
        userId: messageData.userId,
        clientMachineId: messageData.clientMachineId,
        role: messageData.role,
        model: messageData.model,
        type: messageData.type,
        inputTokens: messageData.inputTokens,
        outputTokens: messageData.outputTokens,
        cacheCreationTokens: messageData.cacheCreationTokens,
        cacheReadTokens: messageData.cacheReadTokens,
        timestamp: messageData.timestamp,
        messageCost: messageData.messageCost,
        requestId: messageData.requestId,
        syncStatus: {
          create: {}
        }
      }
    });
  }
  
  async createMessagesBatch(messages: Array<{
    id: string;
    messageId: string;
    sessionId: string;
    projectId: string;
    userId: string;
    clientMachineId: string;
    role: string;
    model?: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    timestamp?: Date;
    messageCost: Prisma.Decimal;
  }>) {
    // Note: createMany doesn't support nested creates, so we need to use transactions
    return await this.prisma.$transaction(async (tx) => {
      // Create all messages with their sync status in a single transaction
      for (const message of messages) {
        await tx.message.create({
          data: {
            ...message,
            syncStatus: {
              create: {}
            }
          }
        });
      }
      return messages.length;
    });
  }
  
  async updateFileStatus(
    filePath: string,
    fileSize: number,
    lastModified: Date,
    checksum: string,
    recordCount: number
  ) {
    return await this.prisma.fileStatus.upsert({
      where: { filePath },
      update: {
        fileSize,
        lastModified,
        checksum,
        lastProcessedAt: new Date(),
        lastProcessedLine: recordCount
      },
      create: {
        filePath,
        fileSize,
        lastModified,
        checksum,
        lastProcessedAt: new Date(),
        lastProcessedLine: recordCount
      }
    });
  }
  
  async isFileProcessed(filePath: string, checksum: string): Promise<boolean> {
    const fileStatus = await this.prisma.fileStatus.findUnique({
      where: { filePath }
    });
    
    return fileStatus !== null && 
           fileStatus.checksum === checksum && 
           fileStatus.lastProcessedAt !== null;
  }
  
}