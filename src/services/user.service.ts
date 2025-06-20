import path from 'path';
import os from 'os';
import { UserInfo } from '../models/types';
import { prisma } from '../database';
import { configManager } from '../config';
import { MachineService } from './machine.service';
import { PathUtils } from '../utils/path-utils';
import { FileSystemUtils } from '../utils/file-system-utils';

export class UserService {
  private userInfo: UserInfo | null = null;
  private machineService: MachineService;

  constructor() {
    this.machineService = new MachineService();
  }

  async loadUserInfo(): Promise<UserInfo> {
    const userInfoPath = this.getUserInfoPath();
    
    try {
      const parsed = await FileSystemUtils.readJsonFile<any>(userInfoPath);
      
      // Authenticated user format
      if ('username' in parsed && 'api_key' in parsed) {
        // Load machine info to get the anonymous user ID
        const machineInfo = await this.machineService.loadMachineInfo();
        
        // Convert to internal format
        this.userInfo = {
          userId: `anon-${machineInfo.machineId}`,
          clientMachineId: machineInfo.machineId,
          auth: {
            realUserId: parsed.username,
            email: `${parsed.username}@roiai.com`,
            apiToken: parsed.api_key
          }
        };
      } else {
        // Anonymous user format
        this.userInfo = parsed;
      }
    } catch (error) {
      // Generate default user info if file doesn't exist
      this.userInfo = await this.generateDefaultUserInfo();
    }

    // Ensure user exists in database
    await this.ensureUserExists();
    
    return this.userInfo!;
  }

  private async generateDefaultUserInfo(): Promise<UserInfo> {
    // Load machine info (will generate if doesn't exist)
    const machineInfo = await this.machineService.loadMachineInfo();
    const machineId = machineInfo.machineId;

    return {
      userId: `anon-${machineId}`,
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

  isAuthenticated(): boolean {
    return !!this.userInfo?.auth;
  }

  getAuthenticatedUserId(): string | null {
    return this.userInfo?.auth?.realUserId || null;
  }

  getAuthenticatedEmail(): string | null {
    return this.userInfo?.auth?.email || null;
  }

  getApiToken(): string | null {
    return this.userInfo?.auth?.apiToken || null;
  }

  async login(realUserId: string, email: string, apiKey: string, username?: string): Promise<void> {
    if (!this.userInfo) {
      throw new Error('User info not loaded');
    }

    // Update in-memory auth info
    this.userInfo.auth = {
      realUserId,
      email,
      apiToken: apiKey
    };

    // Save user info to file
    const userInfoPath = this.getUserInfoPath();
    const userInfo = {
      username: username || email.split('@')[0],
      api_key: apiKey
    };
    
    await FileSystemUtils.writeJsonFile(userInfoPath, userInfo);
  }

  async logout(): Promise<void> {
    if (!this.userInfo) {
      throw new Error('User info not loaded');
    }

    // Remove auth info
    delete this.userInfo.auth;

    // Save updated user info
    const userInfoPath = this.getUserInfoPath();
    
    await FileSystemUtils.writeJsonFile(userInfoPath, this.userInfo);
  }

  private getUserInfoPath(): string {
    const config = configManager.get().user;
    
    // Check if we have a full path (for testing or custom configs)
    if (config?.infoPath) {
      return PathUtils.resolvePath(config.infoPath);
    }
    
    // Otherwise use filename in app directory
    const filename = config?.infoFilename || 'user_info.json';
    return path.join(MachineService.getAppDirectory(), filename);
  }
}