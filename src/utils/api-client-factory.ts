import { createApiClient } from '../generated/api-client';
import { configManager } from '../config';
import { COMMAND_STRINGS } from './constants';

/**
 * Create an authenticated API client with the given API token
 */
export function createAuthenticatedApiClient(apiToken: string) {
  const apiConfig = configManager.getApiConfig();
  return createApiClient({
    baseUrl: apiConfig.baseUrl,
    headers: {
      Authorization: `${COMMAND_STRINGS.HTTP.BEARER_PREFIX}${apiToken}`,
    },
  });
}

/**
 * Create an unauthenticated API client
 */
export function createUnauthenticatedApiClient() {
  const apiConfig = configManager.getApiConfig();
  return createApiClient({
    baseUrl: apiConfig.baseUrl,
  });
}