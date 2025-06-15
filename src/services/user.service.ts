import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { UserInfo } from '../models/types';
import { prisma } from '../database';
import { configManager } from '../config';

export class UserService {
  private userInfo: UserInfo | null = null;

  async loadUserInfo(): Promise<UserInfo> {
    // Get user info path from config
    const configPath = configManager.get().user?.infoPath || '~/.claude/user_info.json';
    const userInfoPath = configPath.startsWith('~') 
      ? path.join(os.homedir(), configPath.slice(1))
      : path.resolve(configPath);
    
    try {
      const data = await fs.readFile(userInfoPath, 'utf-8');
      this.userInfo = JSON.parse(data);
    } catch (error) {
      console.warn(`User info file not found at ${userInfoPath}, generating default values`);
      this.userInfo = this.generateDefaultUserInfo();
    }

    // Ensure user exists in database
    await this.ensureUserExists();
    
    return this.userInfo!;
  }

  private generateDefaultUserInfo(): UserInfo {
    // Generate a machine ID based on hostname and platform
    const machineId = crypto
      .createHash('sha256')
      .update(`${os.hostname()}:${os.platform()}:${os.arch()}`)
      .digest('hex')
      .substring(0, 16);

    return {
      userId: 'anonymous',
      clientMachineId: machineId,
      email: undefined
    };
  }

  private async ensureUserExists(): Promise<void> {
    if (!this.userInfo) return;

    // Create or update user
    await prisma.user.upsert({
      where: { id: this.userInfo.userId },
      create: {
        id: this.userInfo.userId,
        email: this.userInfo.email,
      },
      update: {
        lastSeen: new Date(),
        email: this.userInfo.email
      }
    });

    // Create or update machine
    await prisma.machine.upsert({
      where: { id: this.userInfo.clientMachineId },
      create: {
        id: this.userInfo.clientMachineId,
        userId: this.userInfo.userId,
        machineName: os.hostname(),
        osInfo: `${os.platform()} ${os.release()}`
      },
      update: {
        lastSeen: new Date(),
        machineName: os.hostname(),
        osInfo: `${os.platform()} ${os.release()}`
      }
    });
  }

  getUserInfo(): UserInfo {
    if (!this.userInfo) {
      throw new Error('User info not loaded');
    }
    return this.userInfo;
  }

  getUserId(): string {
    return this.getUserInfo().userId;
  }

  getClientMachineId(): string {
    return this.getUserInfo().clientMachineId;
  }
}