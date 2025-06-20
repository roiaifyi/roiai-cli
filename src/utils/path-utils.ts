import path from 'path';
import os from 'os';

export class PathUtils {
  static resolvePath(inputPath: string): string {
    if (inputPath.startsWith('~')) {
      return path.join(os.homedir(), inputPath.slice(1));
    }
    return path.resolve(inputPath);
  }

  static expandHomeDirectory(inputPath: string): string {
    return this.resolvePath(inputPath);
  }
}