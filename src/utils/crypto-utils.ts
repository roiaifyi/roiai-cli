import crypto from 'crypto';

/**
 * Utility class for cryptographic operations
 */
export class CryptoUtils {
  /**
   * Generate a SHA-256 hash of the input string
   * @param input The string to hash
   * @param length Optional length to truncate the hash (default: full hash)
   * @returns The hex-encoded hash string
   */
  static sha256(input: string, length?: number): string {
    const hash = crypto.createHash('sha256')
      .update(input)
      .digest('hex');
    
    return length ? hash.substring(0, length) : hash;
  }

  /**
   * Generate a deterministic ID from multiple components
   * @param components Array of string components to hash together
   * @param separator Optional separator between components (default: ':')
   * @param length Optional length to truncate the hash (default: 16)
   * @returns A deterministic ID string
   */
  static generateId(components: string[], separator: string = ':', length: number = 16): string {
    const combined = components.join(separator);
    return this.sha256(combined, length);
  }
}