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
  }

  /**
   * CLI Login
   */
  async cliLogin(data: CliLoginRequest): Promise<CliLoginResponse> {
    try {
      const response = await this.client.post('/api/v1/cli/login', data);
      
      // Handle wrapped response format
      if (response.data.success === true && response.data.data) {
        return response.data.data as CliLoginResponse;
      }
      
      // Handle direct response format (legacy)
      return response.data as CliLoginResponse;
    } catch (error) {
      // Debug logging
      if (axios.isAxiosError(error) && error.response) {
        console.error('Login API error:', {
          status: error.response.status,
          data: error.response.data,
          headers: error.response.headers
        });
      }
      throw this.handleError(error);
    }
  }

  /**
   * CLI Logout
   */
  async cliLogout(): Promise<SuccessResponse> {
    try {
      const response = await this.client.post('/api/v1/cli/logout');
      
      // Handle wrapped response format
      if (response.data.success === true && response.data.data) {
        return response.data.data as SuccessResponse;
      }
      
      // Return the wrapper itself if it matches SuccessResponse
      return response.data as SuccessResponse;
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
      
      // Handle wrapped response format
      if (response.data.success === true && response.data.data) {
        return response.data.data as HealthCheckResponse;
      }
      
      // Handle direct response format (legacy)
      return response.data as HealthCheckResponse;
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
      
      // Handle wrapped response format
      if (response.data.success === true && response.data.data) {
        return response.data.data as PushResponse;
      }
      
      // Handle direct response format (legacy)
      return response.data as PushResponse;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Handle API errors with proper typing
   */
  private handleError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<components['schemas']['Error'] | ValidationError>;
      
      if (axiosError.response?.data) {
        const responseData = axiosError.response.data as any;
        
        // Check if it's wrapped in success/error format
        if (responseData.success === false && responseData.error) {
          const errorData = responseData.error;
          
          // Check if it's a validation error
          if (errorData.code === 'VALIDATION_ERROR' && errorData.errors) {
            const validationError = new Error(errorData.message);
            (validationError as any).code = errorData.code;
            (validationError as any).errors = errorData.errors;
            (validationError as any).statusCode = axiosError.response.status;
            return validationError;
          }
          
          // Standard error from wrapped response
          const apiError = new Error(errorData.message || 'API request failed');
          (apiError as any).code = errorData.code;
          (apiError as any).details = errorData.details;
          (apiError as any).statusCode = axiosError.response.status;
          return apiError;
        }
        
        // Legacy error format (direct error object)
        const errorData = responseData;
        
        // Check if it's a validation error
        if ('errors' in errorData && errorData.code === 'VALIDATION_ERROR') {
          const validationError = new Error(errorData.message);
          (validationError as any).code = errorData.code;
          (validationError as any).errors = errorData.errors;
          (validationError as any).statusCode = axiosError.response.status;
          return validationError;
        }
        
        // Standard error
        const apiError = new Error(errorData.message || 'API request failed');
        (apiError as any).code = errorData.code;
        (apiError as any).details = errorData.details;
        (apiError as any).statusCode = axiosError.response.status;
        return apiError;
      }
      
      // Network or other axios errors
      const message = axiosError.message || 'Network error';
      const networkError = new Error(message);
      (networkError as any).code = 'NETWORK_ERROR';
      (networkError as any).statusCode = axiosError.response?.status || 0;
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