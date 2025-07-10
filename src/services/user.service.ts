import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { UserInfo, StoredUserInfo } from '../models/types';
import { getPrisma } from '../database';
import { configManager } from '../config';
import { MachineService } from './machine.service';
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
      const fileContent = await FileSystemUtils.readJsonFile<any>(userInfoPath);
      
      // Check if it's the new authenticated format with user object
      if (this.isStoredUserInfo(fileContent)) {
        // Load machine info to get the anonymous user ID
        const machineInfo = await this.machineService.loadMachineInfo();
        
        // Convert StoredUserInfo to internal UserInfo format
        this.userInfo = {
          anonymousId: `${configManager.get().user?.anonymousIdPrefix || 'anon-'}${machineInfo.machineId}`,
          clientMachineId: machineInfo.machineId,
          auth: {
            userId: fileContent.user.id,
            email: fileContent.user.email,
            username: fileContent.user.username,
            apiToken: fileContent.api_key
          }
        };
      } else {
        // Anonymous user format (internal UserInfo stored directly)
        this.userInfo = fileContent as UserInfo;
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
      anonymousId: `${configManager.get().user?.anonymousIdPrefix || 'anon-'}${machineId}`,
      clientMachineId: machineId
    };
  }

  private async ensureUserExists(): Promise<void> {
    if (!this.userInfo) return;

    // Get the effective user ID (real user ID if authenticated, otherwise anonymous ID)
    const effectiveUserId = this.userInfo.auth?.userId || this.userInfo.anonymousId;
    const userEmail = this.userInfo.auth?.email;

    // Skip if we don't have a valid user ID
    if (!effectiveUserId) {
      throw new Error('Invalid user state: no user ID available');
    }

    // Ensure database is initialized before any operations
    const { getDb } = await import('../database');
    const database = getDb();
    await database.ensureInitialized();

    // Create or update user
    const prismaClient = await getPrisma();
    await prismaClient.user.upsert({
      where: { id: effectiveUserId },
      create: {
        id: effectiveUserId,
        email: userEmail,
      },
      update: {
        email: userEmail
      }
    });

    // Create or update machine
    await prismaClient.machine.upsert({
      where: { id: this.userInfo.clientMachineId },
      create: {
        id: this.userInfo.clientMachineId,
        userId: effectiveUserId,
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
    const userInfo = this.getUserInfo();
    // Return real user ID if authenticated, otherwise anonymous ID
    return userInfo.auth?.userId || userInfo.anonymousId;
  }

  getAnonymousId(): string {
    const userInfo = this.getUserInfo();
    // Always return anonymous ID regardless of authentication status
    return userInfo.anonymousId;
  }

  getClientMachineId(): string {
    return this.getUserInfo().clientMachineId;
  }

  isAuthenticated(): boolean {
    return !!this.userInfo?.auth;
  }

  getAuthenticatedUserId(): string | null {
    return this.userInfo?.auth?.userId || null;
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
      userId: realUserId,
      email: email,
      username: username || (email ? email.split('@')[0] : ''),
      apiToken: apiKey
    };

    // Save complete user info to file in StoredUserInfo format
    const userInfoPath = this.getUserInfoPath();
    const storedUserInfo: StoredUserInfo = {
      user: {
        id: realUserId,
        email: email,
        username: username || (email ? email.split('@')[0] : '')
      },
      api_key: apiKey
    };
    
    await FileSystemUtils.writeJsonFile(userInfoPath, storedUserInfo);

    // Reset sync status for ALL messages when a user logs in
    // This ensures that when switching users, all messages can be re-uploaded
    // Ensure database is initialized before any operations
    const { getDb } = await import('../database');
    const database = getDb();
    await database.ensureInitialized();
    
    const prismaClient = await getPrisma();
    await prismaClient.messageSyncStatus.updateMany({
      where: {}, // Update all records
      data: {
        syncedAt: null,
        retryCount: 0,
        syncResponse: null
      }
    });
  }

  async logout(): Promise<void> {
    if (!this.userInfo) {
      throw new Error('User info not loaded');
    }

    // Remove auth info
    delete this.userInfo.auth;

    // Delete the user info file to ensure clean logout
    const userInfoPath = this.getUserInfoPath();
    
    try {
      await fs.unlink(userInfoPath);
    } catch (error) {
      // Ignore error if file doesn't exist
    }
  }

  private getUserInfoPath(): string {
    const config = configManager.get().user;
    
    // Check if we have a full path (for testing or custom configs)
    if (config?.infoPath) {
      return FileSystemUtils.resolvePath(config.infoPath);
    }
    
    // Otherwise use filename in app directory
    const filename = config?.infoFilename || 'user_info.json';
    return path.join(MachineService.getAppDirectory(), filename);
  }

  // Type guard for StoredUserInfo
  private isStoredUserInfo(obj: any): obj is StoredUserInfo {
    return obj && 
           typeof obj === 'object' &&
           obj.user && 
           typeof obj.user === 'object' &&
           typeof obj.user.id === 'string' &&
           typeof obj.user.email === 'string' &&
           typeof obj.user.username === 'string' &&
           typeof obj.api_key === 'string';
  }

}