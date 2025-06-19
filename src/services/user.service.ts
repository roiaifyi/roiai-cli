import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { UserInfo } from '../models/types';
import { prisma } from '../database';
import { configManager } from '../config';
import { MachineService } from './machine.service';

export class UserService {
  private userInfo: UserInfo | null = null;
  private machineService: MachineService;

  constructor() {
    this.machineService = new MachineService();
  }

  async loadUserInfo(): Promise<UserInfo> {
    const userInfoPath = this.getUserInfoPath();
    
    try {
      const data = await fs.readFile(userInfoPath, 'utf-8');
      const parsed = JSON.parse(data);
      
      // Check if it's the new format from the spec
      if ('username' in parsed && 'api_key' in parsed) {
        // Load machine info to get the anonymous user ID
        const machineInfo = await this.machineService.loadMachineInfo();
        
        // Convert new format to our internal format
        this.userInfo = {
          userId: `anon-${machineInfo.machineId}`,
          clientMachineId: machineInfo.machineId,
          auth: {
            realUserId: parsed.username, // Using username as user ID for now
            email: `${parsed.username}@roiai.com`, // Generate email from username
            apiToken: parsed.api_key
          }
        };
      } else {
        // Old format
        this.userInfo = parsed;
      }
    } catch (error) {
      // Silently generate default user info if file doesn't exist
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

    // Update in-memory auth info for backward compatibility
    this.userInfo.auth = {
      realUserId,
      email,
      apiToken: apiKey
    };

    // Save in the new format according to spec
    const userInfoPath = this.getUserInfoPath();

    // Ensure directory exists
    await fs.mkdir(path.dirname(userInfoPath), { recursive: true });
    
    // Save user info in new format
    const newFormat = {
      username: username || email.split('@')[0],
      api_key: apiKey,
      api_secret: apiKey  // Same as api_key for Bearer token auth
    };
    
    await fs.writeFile(userInfoPath, JSON.stringify(newFormat, null, 2));
  }

  async logout(): Promise<void> {
    if (!this.userInfo) {
      throw new Error('User info not loaded');
    }

    // Remove auth info
    delete this.userInfo.auth;

    // Save updated user info
    const userInfoPath = this.getUserInfoPath();
    
    await fs.writeFile(userInfoPath, JSON.stringify(this.userInfo, null, 2));
  }

  private getUserInfoPath(): string {
    const config = configManager.get().user;
    
    // Check if we have a full path (for testing or custom configs)
    if (config?.infoPath) {
      const configPath = config.infoPath;
      return configPath.startsWith('~') 
        ? path.join(os.homedir(), configPath.slice(1))
        : path.resolve(configPath);
    }
    
    // Otherwise use filename in app directory
    const filename = config?.infoFilename || 'user_info.json';
    return path.join(MachineService.getAppDirectory(), filename);
  }
}