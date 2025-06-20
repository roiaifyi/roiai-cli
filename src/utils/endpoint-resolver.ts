import { configManager } from '../config';

export class EndpointResolver {
  static getLoginEndpoint(): string {
    const apiConfig = configManager.getApiConfig();
    return this.resolveEndpoint(apiConfig.baseUrl, apiConfig.endpoints.login);
  }

  static getPushEndpoint(): string {
    const apiConfig = configManager.getApiConfig();
    return this.resolveEndpoint(apiConfig.baseUrl, apiConfig.endpoints.push);
  }

  static resolveEndpoint(baseUrl: string, targetPath: string): string {
    // Construct full URL from base and path
    const url = new URL(baseUrl);
    url.pathname = targetPath;
    return url.toString();
  }

  // For custom base URLs (useful for testing)
  static getCustomLoginEndpoint(baseUrl: string): string {
    const apiConfig = configManager.getApiConfig();
    return this.resolveEndpoint(baseUrl, apiConfig.endpoints.login);
  }

  static getCustomPushEndpoint(baseUrl: string): string {
    const apiConfig = configManager.getApiConfig();
    return this.resolveEndpoint(baseUrl, apiConfig.endpoints.push);
  }
}