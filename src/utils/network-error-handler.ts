import { ConfigHelper } from './config-helper';
import chalk from 'chalk';

/**
 * Enhanced error handler for network and authentication errors
 * Provides detailed, actionable error messages for better user experience
 */
export class NetworkErrorHandler {
  /**
   * Enhance error messages with context and troubleshooting guidance
   */
  static enhanceError(error: unknown, context: string): string {
    if (!(error instanceof Error)) {
      return `Unknown error during ${context}`;
    }

    const message = error.message.toLowerCase();
    
    // Network connectivity issues
    if (message.includes('fetch failed') || 
        message.includes('network request failed') ||
        message.includes('failed to fetch')) {
      return this.analyzeFetchError(error, context);
    }
    
    // DNS resolution issues
    if (message.includes('enotfound') || 
        message.includes('getaddrinfo') ||
        message.includes('dns')) {
      return `Cannot resolve server address. Please check:\n` +
        `  • Is the API URL correct in your configuration?\n` +
        `  • Is your internet connection working?\n` +
        `  • Can you access ${this.extractHostname(error.message)}?`;
    }
    
    // Connection refused (server down)
    if (message.includes('econnrefused') || 
        message.includes('connection refused')) {
      return `Cannot connect to server. The server appears to be down or unreachable.\n` +
        `  • Is the RoiAI server running?\n` +
        `  • Is the API URL correct?\n` +
        `  • Check if firewall is blocking the connection`;
    }
    
    // Timeout errors
    if (message.includes('timeout') || 
        message.includes('timedout') ||
        message.includes('etimedout')) {
      return `Request timed out. Possible causes:\n` +
        `  • Slow internet connection\n` +
        `  • Server is overloaded\n` +
        `  • Network firewall blocking the request`;
    }
    
    // SSL/TLS errors
    if (message.includes('ssl') || 
        message.includes('tls') ||
        message.includes('certificate')) {
      return `SSL/TLS error. Possible causes:\n` +
        `  • Invalid SSL certificate\n` +
        `  • Corporate proxy intercepting HTTPS\n` +
        `  • System time is incorrect`;
    }
    
    // Default enhanced message
    return `${context} failed: ${error.message}`;
  }
  
  private static analyzeFetchError(error: Error, context: string): string {
    // Try to extract more details from the error cause if available
    const cause = (error as any).cause;
    
    if (cause?.code === 'ECONNREFUSED') {
      return `Cannot connect to RoiAI server. Please ensure:\n` +
        `  • The server is running\n` +
        `  • You're using the correct API URL\n` +
        `  • No firewall is blocking the connection`;
    }
    
    if (cause?.code === 'ENOTFOUND') {
      return `Cannot find RoiAI server. Please check:\n` +
        `  • Your internet connection\n` +
        `  • The API URL in your configuration\n` +
        `  • DNS settings`;
    }
    
    if (cause?.code === 'ETIMEDOUT') {
      return `Connection timed out. Please check:\n` +
        `  • Your internet connection speed\n` +
        `  • If the server is responding\n` +
        `  • Firewall settings`;
    }
    
    // Check for common fetch error patterns
    if (error.message.toLowerCase().includes('econnrefused')) {
      return `Cannot connect to RoiAI server at ${this.extractUrl(error.message)}. Please ensure:\n` +
        `  • The server is running\n` +
        `  • The API URL is correct\n` +
        `  • No firewall is blocking port ${this.extractPort(error.message)}`;
    }
    
    // Generic network error
    return `Network error during ${context}. Please check:\n` +
        `  • Your internet connection\n` +
        `  • If the RoiAI server is accessible\n` +
        `  • Your firewall/proxy settings\n` +
        `  • The API URL configuration`;
  }
  
  private static extractHostname(message: string): string {
    // Try to extract hostname from error message
    const urlMatch = message.match(/https?:\/\/([^\/]+)/);
    return urlMatch ? urlMatch[1] : 'the server';
  }
  
  private static extractUrl(message: string): string {
    // Try to extract URL from error message
    const urlMatch = message.match(/https?:\/\/[^\s]+/);
    return urlMatch ? urlMatch[0] : 'the configured URL';
  }
  
  private static extractPort(message: string): string {
    // Try to extract port from error message
    const portMatch = message.match(/:(\d+)/);
    return portMatch ? portMatch[1] : ConfigHelper.getNetwork().defaultHttpsPort;
  }

  /**
   * Retry an operation with exponential backoff
   */
  static async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = ConfigHelper.getNetwork().defaultMaxRetries,
    context: string = 'operation'
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on authentication errors
        if (error instanceof Error && 
            (error.message.includes('401') || 
             error.message.includes('403') ||
             error.message.includes('Invalid') ||
             error.message.includes('Unauthorized'))) {
          throw error;
        }
        
        if (attempt < maxRetries) {
          const backoffConfig = ConfigHelper.getNetwork().backoff;
          const delay = Math.min(backoffConfig.baseDelay * Math.pow(2, attempt - 1), backoffConfig.maxDelay);
          console.log(chalk.yellow(`Retrying ${context} in ${delay}ms... (attempt ${attempt}/${maxRetries})`));
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }
}