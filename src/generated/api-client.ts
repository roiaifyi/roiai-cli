import { components } from './api';

// Simple typed API client using fetch
export function createApiClient(config: {
  baseUrl: string;
  headers?: Record<string, string>;
}) {
  async function upsyncData(body: components['schemas']['PushRequest']): Promise<{
    ok: boolean;
    status: number;
    data: components['schemas']['PushResponse'] | components['schemas']['ErrorResponse'];
  }> {
    const response = await fetch(`${config.baseUrl}/api/v1/cli/upsync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json() as components['schemas']['PushResponse'] | components['schemas']['ErrorResponse'];
    
    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  }

  async function healthCheck(): Promise<{
    ok: boolean;
    status: number;
    data: components['schemas']['HealthCheckResponse'] | components['schemas']['ErrorResponse'];
  }> {
    const response = await fetch(`${config.baseUrl}/api/v1/cli/health`, {
      method: 'GET',
      headers: {
        ...config.headers,
      },
    });

    const data = await response.json() as components['schemas']['HealthCheckResponse'] | components['schemas']['ErrorResponse'];
    
    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  }

  async function logout(): Promise<{
    ok: boolean;
    status: number;
    data: components['schemas']['SuccessResponse'] | components['schemas']['ErrorResponse'];
  }> {
    const response = await fetch(`${config.baseUrl}/api/v1/cli/logout`, {
      method: 'POST',
      headers: {
        ...config.headers,
      },
    });

    const data = await response.json() as components['schemas']['SuccessResponse'] | components['schemas']['ErrorResponse'];
    
    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  }

  return {
    upsyncData,
    healthCheck,
    logout,
  };
}

// Re-export types for convenience
export type { components, paths, operations } from './api';

// Export specific types with cleaner names
export type PushRequest = components['schemas']['PushRequest'];
export type PushResponse = components['schemas']['PushResponse'];
export type MessageEntity = components['schemas']['MessageEntity'];
export type MachineEntity = components['schemas']['MachineEntity'];
export type ProjectEntity = components['schemas']['ProjectEntity'];
export type SessionEntity = components['schemas']['SessionEntity'];
export type UserEntity = components['schemas']['UserEntity'];
export type SyncFailureDetail = components['schemas']['SyncFailureDetail'];
export type SyncErrorCode = components['schemas']['SyncErrorCode'];
export type ValidationError = components['schemas']['ValidationError'];
export type Error = components['schemas']['Error'];
export type HealthCheckResponse = components['schemas']['HealthCheckResponse'];
export type SuccessResponse = components['schemas']['SuccessResponse'];
export type ErrorResponse = components['schemas']['ErrorResponse'];
export type ApiError = components['schemas']['ApiError'];
export type ErrorCode = components['schemas']['ErrorCode'];