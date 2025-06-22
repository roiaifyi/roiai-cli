import { components } from './api';

// Simple typed API client using fetch
export function createApiClient(config: {
  baseUrl: string;
  headers?: Record<string, string>;
}) {
  async function upsyncData(body: components['schemas']['PushRequest']): Promise<{
    ok: boolean;
    status: number;
    data: components['schemas']['PushResponse'] | components['schemas']['ValidationError'] | components['schemas']['Error'];
  }> {
    const response = await fetch(`${config.baseUrl}/api/v1/cli/upsync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json() as components['schemas']['PushResponse'] | components['schemas']['ValidationError'] | components['schemas']['Error'];
    
    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  }

  return {
    upsyncData,
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