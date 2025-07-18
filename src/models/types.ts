export * from './push.types';

export interface JSONLEntry {
  type: string;
  sessionId?: string;
  message?: {
    id: string;
    type?: string;
    role?: string;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      service_tier?: string;
    };
    content?: any[];
  };
  requestId?: string;
  uuid?: string;
  timestamp?: string;
  cwd?: string;
  isSidechain?: boolean;
  userType?: string;
  version?: string;
  summary?: string;
  leafUuid?: string;
}

export interface PricingData {
  metadata?: {
    id: string;
    provider: string;
    providerUrl: string;
    apiEndpoint: string;
    source: string;
    lastUpdated: string;
    version: string;
    description: string;
    currency: string;
    unit: string;
    notes: string;
  };
  models: Array<{
    modelId: string;
    name: string;
    input: number;
    output: number;
    cache?: {
      '5m': { write: number; read: number };
      '1h': { write: number; read: number };
    };
    originalRates?: {
      input: string;
      output: string;
      cache5mWrite?: string;
      cache1hWrite?: string;
      cacheRead?: string;
    };
  }>;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalCost: number;
}

export interface TokenUsageByModel {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface ProcessingResult {
  projectsProcessed: number;
  sessionsProcessed: number;
  messagesProcessed: number;
  errors: string[];
  tokenUsageByModel: Map<string, TokenUsageByModel>;
}

export interface ProcessingProgress {
  totalProjects: number;
  processedProjects: number;
  currentProject: string;
  totalFiles: number;
  processedFiles: number;
  currentFile: string;
  messagesInCurrentFile: number;
  processedMessagesInCurrentFile: number;
}

// Internal user info representation used throughout the app
export interface UserInfo {
  // Anonymous tracking ID (format: anon-{machineId})
  anonymousId: string;
  
  // Machine ID for this client
  clientMachineId: string;
  
  // Authentication info (present when user is logged in)
  auth?: AuthInfo;
}

// Authentication information for logged-in users
export interface AuthInfo {
  userId: string;      // Real user ID from the server
  email: string;       // User's email address
  username: string;    // User's username
  apiToken: string;    // API key for authentication
}

// Stored user info format in user_info.json for authenticated users
export interface StoredUserInfo {
  user: {
    id: string;
    email: string;
    username: string;
  };
  api_key: string;
}


export interface MachineInfo {
  machineId: string;
  macAddress: string;  // MAC address used to generate the ID
  osInfo: {
    platform: string;
    release: string;
    arch: string;
    hostname: string;
  };
  createdAt: string;
  version: number;
}