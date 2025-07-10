// Import and re-export generated types from OpenAPI spec
import type { components } from '../generated/api';

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
export type ApiError = components['schemas']['Error'];
export type HealthCheckResponse = components['schemas']['HealthCheckResponse'];
export type SuccessResponse = components['schemas']['SuccessResponse'];
export type ErrorResponse = components['schemas']['ErrorResponse'];
export type ErrorCode = components['schemas']['ErrorCode'];

export interface PushOptions {
  batchSize: number;
  dryRun: boolean;
  force: boolean;
  verbose: boolean;
  skipSync?: boolean;
}

export interface PushConfig {
  batchSize: number;
  maxRetries: number;
  timeout: number;
}

export interface EntityMaps {
  machines: Map<string, MachineEntity>;
  projects: Map<string, ProjectEntity>;
  sessions: Map<string, SessionEntity>;
}