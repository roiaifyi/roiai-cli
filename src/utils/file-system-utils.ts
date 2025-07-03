import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export class FileSystemUtils {
  static resolvePath(inputPath: string): string {
    if (inputPath.startsWith('~')) {
      return path.join(os.homedir(), inputPath.slice(1));
    }
    return path.resolve(inputPath);
  }

  static expandHomeDirectory(inputPath: string): string {
    return this.resolvePath(inputPath);
  }

  static async ensureDirectoryExists(filePath: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
  }

  static async writeJsonFile(filePath: string, data: any): Promise<void> {
    await this.ensureDirectoryExists(filePath);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  static async readJsonFile<T>(filePath: string): Promise<T> {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  }

  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}