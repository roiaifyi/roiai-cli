import { API_ENDPOINTS } from './constants';

export class EndpointResolver {
  static getLoginEndpoint(baseUrl: string): string {
    return this.resolveEndpoint(baseUrl, API_ENDPOINTS.LOGIN);
  }

  static getPushEndpoint(baseUrl: string): string {
    return this.resolveEndpoint(baseUrl, API_ENDPOINTS.PUSH);
  }

  static resolveEndpoint(baseUrl: string, targetPath: string): string {
    // Extract base URL and replace the path
    const url = new URL(baseUrl);
    url.pathname = targetPath;
    return url.toString();
  }
}