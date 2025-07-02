// Re-export generated types from OpenAPI spec
export {
  PushRequest,
  PushResponse,
  MessageEntity,
  MachineEntity,
  ProjectEntity,
  SessionEntity,
  UserEntity,
  SyncFailureDetail,
  SyncErrorCode,
  ValidationError,
  Error as ApiError,
  HealthCheckResponse,
  SuccessResponse,
  ErrorResponse,
  ErrorCode,
} from '../generated/api-client';

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
  machines: Map<string, import('../generated/api-client').MachineEntity>;
  projects: Map<string, import('../generated/api-client').ProjectEntity>;
  sessions: Map<string, import('../generated/api-client').SessionEntity>;
}