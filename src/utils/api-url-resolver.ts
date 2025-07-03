import { Command } from 'commander';
import { configManager } from '../config';

/**
 * Resolves the API URL from command options or configuration
 */
export class ApiUrlResolver {
  /**
   * Get the API URL from the command hierarchy or config
   * @param command The current command
   * @returns The resolved API URL
   */
  static getApiUrl(command: Command): string {
    // Walk up the command tree to find --api-url option
    let current: Command | null = command;
    while (current) {
      const apiUrl = current.opts().apiUrl;
      if (apiUrl) {
        return apiUrl;
      }
      current = current.parent;
    }
    
    // Fall back to config
    return configManager.getApiConfig().baseUrl;
  }
  
  /**
   * Create an API URL override configuration object
   * @param apiUrl The API URL to use
   * @returns Config object with overridden API URL
   */
  static createOverrideConfig(apiUrl: string | undefined): { api?: { baseUrl: string } } {
    if (!apiUrl) {
      return {};
    }
    
    return {
      api: {
        baseUrl: apiUrl
      }
    };
  }
}