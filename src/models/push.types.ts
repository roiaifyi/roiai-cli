// Push command type definitions

export interface PushRequest {
  messages: MessageEntity[];
  metadata: {
    entities: {
      users: Record<string, UserEntity>;
      machines: Record<string, MachineEntity>;
      projects: Record<string, ProjectEntity>;
      sessions: Record<string, SessionEntity>;
    };
    batch_info: {
      batch_id: string;
      timestamp: string;
      client_version: string;
      total_messages: number;
      message_counts: {
        by_model: Record<string, number>;
        by_role: Record<string, number>;
      };
    };
  };
}

export interface UserEntity {
  id: string;
  email?: string;
  username?: string;
}

export interface MachineEntity {
  id: string;
  userId: string;
  machineName?: string;
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
  uuid: string;
  messageId: string;
  sessionId: string;
  projectId: string;
  userId: string;
  role: string;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  messageCost: string;
  timestamp?: string;
}

export interface PushResponse {
  batchId: string;
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
      details: Array<{
        messageId: string;
        error: string;
      }>;
    };
  };
  summary: {
    totalMessages: number;
    messagesSucceeded: number;
    messagesFailed: number;
    entitiesCreated: {
      users: number;
      machines: number;
      projects: number;
      sessions: number;
    };
    aggregatesUpdated: boolean;
    processingTimeMs: number;
  };
}

export interface PushOptions {
  batchSize: number;
  dryRun: boolean;
  force: boolean;
  verbose: boolean;
}

export interface PushConfig {
  apiToken?: string;  // Optional, now comes from user auth
  batchSize: number;
  maxRetries: number;
  timeout: number;
}

export interface EntityMaps {
  users: Map<string, UserEntity>;
  machines: Map<string, MachineEntity>;
  projects: Map<string, ProjectEntity>;
  sessions: Map<string, SessionEntity>;
}