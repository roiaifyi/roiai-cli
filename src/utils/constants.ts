export const COMMAND_STRINGS = {
  LOGIN_COMMAND: 'roiai cc login',
  PUSH_COMMAND: 'roiai cc push',
  SYNC_COMMAND: 'roiai cc sync',
  
  MESSAGES: {
    LOGIN_REQUIRED: 'Please login first using \'roiai cc login\' to push data',
    LOGIN_REQUIRED_GENERAL: 'Please login first using \'roiai cc login\'',
    UNKNOWN_ERROR: 'Unknown error',
    OPERATION_FAILED: 'Operation failed',
    AUTHENTICATION_FAILED: 'Authentication failed',
    NETWORK_ERROR: 'Network error occurred',
    INVALID_CONFIG: 'Invalid configuration'
  },
  
  TABLES: {
    MESSAGES: 'messages',
    USERS: 'users',
    PROJECTS: 'projects',
    SESSIONS: 'sessions',
    MACHINES: 'machines'
  },
  
  HTTP: {
    BEARER_PREFIX: 'Bearer ',
    USER_AGENT_PREFIX: 'roiai/'
  }
} as const;

export const API_ENDPOINTS = {
  LOGIN: '/api/v1/cli/login',
  PUSH: '/api/v1/cli/upsync'
} as const;

export const DEFAULT_API_BASE_URL = 'https://api.roiai.com';