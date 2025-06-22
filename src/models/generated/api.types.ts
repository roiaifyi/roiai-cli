/**
 * Generated TypeScript types from OpenAPI specification
 * DO NOT EDIT MANUALLY - Generated from roiai-web/openapi.yaml
 */

// Error types
export interface Error {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface ValidationError {
  code: "VALIDATION_ERROR";
  message: string;
  errors: Record<string, string>;
}

export type SyncErrorCode =
  | "SYNC_001" // Message validation failed
  | "SYNC_002" // Message processing failed
  | "SYNC_003" // Machine not found
  | "SYNC_004" // Project not found
  | "SYNC_005" // Session not found
  | "SYNC_006"; // Rate limit exceeded

export interface SyncFailureDetail {
  messageId: string;
  error: string;
  code: SyncErrorCode;
}

// Entity types
export interface UserEntity {
  id: string;
  email?: string;
  username?: string;
}

export interface MachineEntity {
  id: string;
  userId: string;
  machineName: string;
  localMachineId: string;
}

export interface ProjectEntity {
  id: string;
  projectName: string;
  userId: string;
  clientMachineId: string;
}

export interface SessionEntity {
  id: string;
  projectId: string;
  userId: string;
  clientMachineId: string;
}

export interface MessageEntity {
  id: string;
  messageId: string;
  sessionId: string | null;
  projectId: string | null;
  userId: string;
  role: "user" | "assistant" | "system";
  model?: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  messageCost: number;
  timestamp?: string;
  writer: "human" | "agent" | "assistant";
  machineId: string;
  pricePerInputToken: number;
  pricePerOutputToken: number;
  pricePerCacheWriteToken: number;
  pricePerCacheReadToken: number;
  cacheDurationMinutes: number;
}

// Request/Response types
export interface PushRequest {
  messages: MessageEntity[];
  entities: {
    machines: Record<string, MachineEntity>;
    projects: Record<string, ProjectEntity>;
    sessions: Record<string, SessionEntity>;
  };
}

export interface PushResponse {
  syncId: string;
  results: {
    persisted: {
      count: number;
      messageIds: string[];
    };
    deduplicated: {
      count: number;
      messageIds: string[];
    };
    failed: {
      count: number;
      details: SyncFailureDetail[];
    };
  };
  summary: {
    totalMessages: number;
    messagesSucceeded: number;
    messagesFailed: number;
    processingTimeMs: number;
  };
}

// API endpoint paths
export const API_ENDPOINTS = {
  DATA_UPSYNC: "/data/upsync",
} as const;

// Helper type for API responses
export type ApiResponse<T> = T | Error | ValidationError;