import { PrismaClient, Prisma } from '@prisma/client';

export class DatabaseService {
  constructor(private prisma: PrismaClient) {}
  
  async findOrCreateUser(userId: string, email?: string) {
    return await this.prisma.user.upsert({
      where: { id: userId },
      update: { 
        lastSeen: new Date(),
        ...(email && { email })
      },
      create: {
        id: userId,
        email,
        createdAt: new Date(),
        lastSeen: new Date()
      }
    });
  }
  
  async findOrCreateMachine(machineId: string, userId: string, machineName?: string) {
    return await this.prisma.machine.upsert({
      where: { id: machineId },
      update: {
        lastSeen: new Date(),
        ...(machineName && { machineName })
      },
      create: {
        id: machineId,
        userId,
        machineName,
        firstSeen: new Date(),
        lastSeen: new Date()
      }
    });
  }
  
  async findOrCreateProject(projectId: string, projectName: string, userId: string, clientMachineId: string) {
    return await this.prisma.project.upsert({
      where: { id: projectId },
      update: {
        lastSeen: new Date()
      },
      create: {
        id: projectId,
        projectName,
        userId,
        clientMachineId,
        firstSeen: new Date(),
        lastSeen: new Date()
      }
    });
  }
  
  async findOrCreateSession(sessionId: string, projectId: string, userId: string, clientMachineId: string) {
    return await this.prisma.session.upsert({
      where: { id: sessionId },
      update: {
        endTime: new Date()
      },
      create: {
        id: sessionId,
        projectId,
        userId,
        clientMachineId,
        startTime: new Date()
      }
    });
  }
  
  async createMessage(messageData: {
    uuid: string;
    messageId: string;
    sessionId: string;
    projectId: string;
    userId: string;
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
        uuid: messageData.uuid,
        messageId: messageData.messageId,
        sessionId: messageData.sessionId,
        projectId: messageData.projectId,
        userId: messageData.userId,
        role: messageData.role,
        model: messageData.model,
        type: messageData.type,
        inputTokens: messageData.inputTokens,
        outputTokens: messageData.outputTokens,
        cacheCreationTokens: messageData.cacheCreationTokens,
        cacheReadTokens: messageData.cacheReadTokens,
        timestamp: messageData.timestamp,
        messageCost: messageData.messageCost,
        requestId: messageData.requestId
      }
    });
  }
  
  async createMessagesBatch(messages: Array<{
    uuid: string;
    messageId: string;
    sessionId: string;
    projectId: string;
    userId: string;
    role: string;
    model?: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    timestamp?: Date;
    messageCost: Prisma.Decimal;
  }>) {
    return await this.prisma.message.createMany({
      data: messages
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
  
  async getUserWithStats(userId: string) {
    return await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            messages: true,
            sessions: true,
            projects: true
          }
        }
      }
    });
  }
  
  async getProjectWithStats(projectId: string) {
    return await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        _count: {
          select: {
            messages: true,
            sessions: true
          }
        }
      }
    });
  }
}