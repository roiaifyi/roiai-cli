import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { MachineInfo } from '../models/types';
import { configManager } from '../config';

export class MachineService {
  private machineInfo: MachineInfo | null = null;
  private readonly machineInfoPath: string;

  constructor() {
    const config = configManager.get().app;
    const appDir = MachineService.getAppDirectory();
    this.machineInfoPath = path.join(appDir, config.machineInfoFilename);
  }

  static getAppDirectory(): string {
    const config = configManager.get().app;
    const dataDir = config.dataDir;
    
    // Handle ~ for home directory
    if (dataDir.startsWith('~')) {
      return path.join(os.homedir(), dataDir.slice(1));
    }
    
    return path.resolve(dataDir);
  }

  async loadMachineInfo(): Promise<MachineInfo> {
    if (this.machineInfo) {
      return this.machineInfo;
    }

    try {
      const data = await fs.readFile(this.machineInfoPath, 'utf-8');
      this.machineInfo = JSON.parse(data);
      return this.machineInfo!;
    } catch (error) {
      // File doesn't exist, generate new machine info
      this.machineInfo = await this.generateMachineInfo();
      await this.saveMachineInfo();
      return this.machineInfo;
    }
  }

  private async generateMachineInfo(): Promise<MachineInfo> {
    const uuid = uuidv4();
    const osInfo = {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      hostname: os.hostname()
    };

    // Generate machine ID by hashing UUID + OS info
    const machineIdData = `${uuid}:${osInfo.platform}:${osInfo.release}:${osInfo.arch}:${osInfo.hostname}`;
    const machineId = crypto
      .createHash('sha256')
      .update(machineIdData)
      .digest('hex')
      .substring(0, 16);

    return {
      uuid,
      machineId,
      osInfo,
      createdAt: new Date().toISOString(),
      version: 1
    };
  }

  private async saveMachineInfo(): Promise<void> {
    if (!this.machineInfo) {
      throw new Error('No machine info to save');
    }

    // Ensure directory exists
    await fs.mkdir(path.dirname(this.machineInfoPath), { recursive: true });
    
    // Save machine info
    await fs.writeFile(
      this.machineInfoPath, 
      JSON.stringify(this.machineInfo, null, 2)
    );
  }

  getMachineId(): string {
    if (!this.machineInfo) {
      throw new Error('Machine info not loaded');
    }
    return this.machineInfo.machineId;
  }

  getMachineInfo(): MachineInfo {
    if (!this.machineInfo) {
      throw new Error('Machine info not loaded');
    }
    return this.machineInfo;
  }
}