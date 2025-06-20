import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { MachineInfo } from '../models/types';
import { configManager } from '../config';
import { FileSystemUtils } from '../utils/file-system-utils';
import { PathUtils } from '../utils/path-utils';

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
    
    return PathUtils.resolvePath(dataDir);
  }

  async loadMachineInfo(): Promise<MachineInfo> {
    if (this.machineInfo) {
      return this.machineInfo;
    }

    try {
      this.machineInfo = await FileSystemUtils.readJsonFile<MachineInfo>(this.machineInfoPath);
      return this.machineInfo!;
    } catch (error) {
      // File doesn't exist, generate new machine info
      this.machineInfo = await this.generateMachineInfo();
      await this.saveMachineInfo();
      return this.machineInfo;
    }
  }

  private getPrimaryMacAddress(): string | null {
    const interfaces = os.networkInterfaces();
    
    // Priority order for interface names (common physical interfaces first)
    const priorityPrefixes = ['en', 'eth', 'wlan', 'wl', 'wifi'];
    
    // Get all valid interfaces (non-internal, valid MAC)
    const validInterfaces: Array<{ name: string; mac: string }> = [];
    
    for (const [name, ifaces] of Object.entries(interfaces)) {
      if (!ifaces || ifaces.length === 0) continue;
      
      const iface = ifaces[0];
      
      // Skip internal, virtual, and invalid interfaces
      if (iface.internal || 
          iface.mac === '00:00:00:00:00:00' ||
          name.startsWith('utun') ||
          name.startsWith('awdl') ||
          name.startsWith('llw') ||
          name.startsWith('veth') ||
          name.startsWith('docker') ||
          name.startsWith('br-') ||
          name.startsWith('lo')) {
        continue;
      }
      
      validInterfaces.push({ name, mac: iface.mac });
    }
    
    if (validInterfaces.length === 0) {
      return null;
    }
    
    // Sort by priority - prefer common physical interface names
    validInterfaces.sort((a, b) => {
      const aPriority = priorityPrefixes.findIndex(prefix => a.name.startsWith(prefix));
      const bPriority = priorityPrefixes.findIndex(prefix => b.name.startsWith(prefix));
      
      // If both have priority, sort by priority index
      if (aPriority !== -1 && bPriority !== -1) {
        return aPriority - bPriority;
      }
      
      // Prioritized interfaces come first
      if (aPriority !== -1) return -1;
      if (bPriority !== -1) return 1;
      
      // Otherwise sort alphabetically for consistency
      return a.name.localeCompare(b.name);
    });
    
    return validInterfaces[0].mac;
  }

  private async generateMachineInfo(): Promise<MachineInfo> {
    const osInfo = {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      hostname: os.hostname()
    };

    // Get primary MAC address
    const macAddress = this.getPrimaryMacAddress();
    
    if (!macAddress) {
      throw new Error('No valid network interface found for machine identification');
    }

    // Generate machine ID by hashing MAC + platform + architecture
    // This ensures consistency across OS reinstalls on the same hardware
    const machineIdData = `${macAddress}:${osInfo.platform}:${osInfo.arch}`;
    const machineId = crypto
      .createHash('sha256')
      .update(machineIdData)
      .digest('hex')
      .substring(0, 16);

    return {
      machineId,
      macAddress,
      osInfo,
      createdAt: new Date().toISOString(),
      version: 2  // Increment version for new MAC-based approach
    };
  }

  private async saveMachineInfo(): Promise<void> {
    if (!this.machineInfo) {
      throw new Error('No machine info to save');
    }

    await FileSystemUtils.writeJsonFile(this.machineInfoPath, this.machineInfo);
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