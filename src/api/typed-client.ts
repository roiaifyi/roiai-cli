/**
 * Type-safe API client using generated OpenAPI types
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { components } from '../generated/api';

// Export commonly used types
export type ErrorResponse = components['schemas']['ErrorResponse'];
export type SuccessResponse = components['schemas']['SuccessResponse'];
export type ApiError = components['schemas']['ApiError'];
export type ErrorCode = components['schemas']['ErrorCode'];
export type ValidationError = components['schemas']['ValidationError'];

// CLI-specific types
export type CliLoginRequest = components['schemas']['CliLoginRequest'];
export type CliLoginResponse = components['schemas']['CliLoginResponse'];
export type HealthCheckResponse = components['schemas']['HealthCheckResponse'];
export type PushRequest = components['schemas']['PushRequest'];
export type PushResponse = components['schemas']['PushResponse'];

// Entity types
export type UserEntity = components['schemas']['UserEntity'];
export type MachineEntity = components['schemas']['MachineEntity'];
export type ProjectEntity = components['schemas']['ProjectEntity'];
export type SessionEntity = components['schemas']['SessionEntity'];
export type MessageEntity = components['schemas']['MessageEntity'];

// Error types
export type SyncErrorCode = components['schemas']['SyncErrorCode'];
export type SyncFailureDetail = components['schemas']['SyncFailureDetail'];

export class TypedApiClient {
  private client: AxiosInstance;

  constructor(baseURL: string, apiKey?: string) {
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
      },
    });

    // Add request interceptor for debugging
    if (process.env.DEBUG_API) {
      this.client.interceptors.request.use((config) => {
        console.log('API Request:', {
          url: config.url,
          method: config.method,
          headers: config.headers,
          data: config.data
        });
        return config;
      });
    }
  }

  /**
   * Unwrap API response from server's standard format
   */
  private unwrapResponse<T>(response: any): T {
    // Handle wrapped response format
    if (response.data?.success === true && response.data.data) {
      return response.data.data as T;
    }
    
    // Handle direct response format (legacy)
    return response.data as T;
  }

  /**
   * CLI Login
   */
  async cliLogin(data: CliLoginRequest): Promise<CliLoginResponse> {
    try {
      const response = await this.client.post('/api/v1/cli/login', data);
      return this.unwrapResponse<CliLoginResponse>(response);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * CLI Logout
   */
  async cliLogout(): Promise<SuccessResponse> {
    try {
      const response = await this.client.post('/api/v1/cli/logout');
      return this.unwrapResponse<SuccessResponse>(response);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * CLI Health Check
   */
  async cliHealthCheck(): Promise<HealthCheckResponse> {
    try {
      const response = await this.client.get('/api/v1/cli/health');
      return this.unwrapResponse<HealthCheckResponse>(response);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Upload sync data
   */
  async cliUpsync(data: PushRequest): Promise<PushResponse> {
    try {
      const response = await this.client.post('/api/v1/cli/upsync', data);
      return this.unwrapResponse<PushResponse>(response);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Create a properly formatted API error
   */
  private createApiError(errorData: any, statusCode: number): Error {
    const error = new Error(errorData.message || 'API request failed');
    (error as any).code = errorData.code;
    (error as any).statusCode = statusCode;
    
    if (errorData.details) {
      (error as any).details = errorData.details;
    }
    
    if (errorData.errors && errorData.code === 'VALIDATION_ERROR') {
      (error as any).errors = errorData.errors;
    }
    
    return error;
  }

  /**
   * Handle API errors with proper typing
   */
  private handleError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<components['schemas']['Error'] | ValidationError>;
      const statusCode = axiosError.response?.status || 0;
      
      if (axiosError.response?.data) {
        const responseData = axiosError.response.data as any;
        
        // Check if it's wrapped in success/error format
        if (responseData.success === false && responseData.error) {
          return this.createApiError(responseData.error, statusCode);
        }
        
        // Legacy error format (direct error object)
        return this.createApiError(responseData, statusCode);
      }
      
      // Network or other axios errors
      const message = axiosError.message || 'Network error';
      const networkError = new Error(message);
      (networkError as any).code = 'NETWORK_ERROR';
      (networkError as any).statusCode = statusCode;
      return networkError;
    }
    
    // Unknown error
    return error instanceof Error ? error : new Error('Unknown error occurred');
  }

  /**
   * Update authorization header
   */
  updateApiKey(apiKey: string | undefined) {
    if (apiKey) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${apiKey}`;
    } else {
      delete this.client.defaults.headers.common['Authorization'];
    }
  }
}

// Singleton instance factory
export function createApiClient(baseURL: string, apiKey?: string): TypedApiClient {
  return new TypedApiClient(baseURL, apiKey);
}