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
  parentUuid?: string | null;
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
  models: Array<{
    id: string;
    name: string;
    input: number;
    output: number;
    originalRates: {
      inputPerMillion: number;
      outputPerMillion: number;
    };
  }>;
  cache: {
    durations: {
      '5min': { write: number; read: number };
      '1hour': { write: number; read: number };
    };
  };
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalCost: number;
}

export interface ProcessingResult {
  sessionsProcessed: number;
  messagesProcessed: number;
  duplicatesSkipped: number;
  errors: string[];
}

export interface UserInfo {
  userId: string;
  clientMachineId: string;
  email?: string;
}