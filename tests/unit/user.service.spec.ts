import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock os module before any imports that might use it
jest.mock('os', () => ({
  hostname: jest.fn(() => 'test-machine'),
  platform: jest.fn(() => 'darwin'),
  arch: jest.fn(() => 'x64'),
  homedir: jest.fn(() => '/home/test'),
  release: jest.fn(() => '20.0.0'),
  networkInterfaces: jest.fn(() => ({}))
}));

// Mock fs/promises before imports
jest.mock('fs/promises');

import fs from 'fs/promises';
import { UserService } from '../../src/services/user.service';
import { configManager } from '../../src/config';
import { MachineService } from '../../src/services/machine.service';
import { MachineInfo } from '../../src/models/types';
jest.mock('../../src/database', () => {
  const mockPrismaClient = {
    user: {
      upsert: jest.fn(() => Promise.resolve({}))
    },
    machine: {
      upsert: jest.fn(() => Promise.resolve({}))
    },
    messageSyncStatus: {
      updateMany: jest.fn(() => Promise.resolve({ count: 0 }))
    }
  };
  
  const mockDatabase = {
    ensureInitialized: jest.fn(() => Promise.resolve())
  };
  
  return {
    prisma: mockPrismaClient,
    getPrisma: jest.fn(() => Promise.resolve(mockPrismaClient)),
    getDb: jest.fn(() => mockDatabase)
  };
});
jest.mock('../../src/config');
jest.mock('../../src/services/machine.service');

describe('UserService', () => {
  let userService: UserService;
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockConfigManager = configManager as jest.Mocked<typeof configManager>;
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup MachineService mock
    const mockMachineInfo: MachineInfo = {
      machineId: 'test-machine-id',
      macAddress: 'aa:bb:cc:dd:ee:ff',
      osInfo: {
        platform: 'darwin',
        release: '20.0.0',
        arch: 'x64',
        hostname: 'test-machine'
      },
      createdAt: '2024-01-01T00:00:00Z',
      version: 2
    };
    
    const mockLoadMachineInfo = jest.fn(() => Promise.resolve(mockMachineInfo));
    
    (MachineService as any).mockImplementation(() => ({
      loadMachineInfo: mockLoadMachineInfo
    }));
    
    // Mock static method
    (MachineService as any).getAppDirectory = jest.fn().mockReturnValue('/home/test/.roiai');
    
    userService = new UserService();
    
    // Setup config mock
    mockConfigManager.get.mockReturnValue({
      app: { 
        dataDir: '~/.roiai',
        machineInfoFilename: 'machine_info.json'
      },
      user: { 
        infoFilename: 'user_info.json',
        anonymousIdPrefix: 'anon-'
      },
      database: { path: ':memory:' },
      claudeCode: {
        rawDataPath: '~/.claude',
        pricingUrl: 'https://example.com/pricing.json',
        pricingCacheTimeout: 3600000,
        cacheDurationDefault: 5,
        batchSize: 1000
      },
      api: {
        baseUrl: 'https://api.roiai.com',
        endpoints: {
          login: '/api/v1/cli/login',
          push: '/api/v1/data/upsync'
        }
      },
      push: {
        batchSize: 1000,
        maxRetries: 5,
        timeout: 30000
      },
      logging: { level: 'info' },
      machine: {
        networkInterfacePriority: ['en', 'eth', 'wlan'],
        virtualInterfacePrefixes: ['vnic', 'vmnet'],
        machineIdLength: 16,
        machineInfoVersion: 2,
        invalidMacAddress: '00:00:00:00:00:00'
      },
      processing: {
        batchSizes: {
          default: 1000,
          transaction: 100,
          session: 10,
          aggregation: 100
        },
        timeouts: {
          transaction: 30000
        },
        hiddenDirectoryPrefix: '.',
        idSubstringLength: 16
      },
      display: {
        costPrecision: 4,
        speedPrecision: 1,
        durationPrecision: 2,
        maxErrorsDisplayed: 10,
        maxSessionsShown: 5,
        progressBarWidth: 50,
        sessionIdLength: 8,
        messageIdLength: 36,
        progressBar: {
          filled: '█',
          empty: '░'
        },
        separator: {
          char: '━',
          defaultWidth: 40
        },
        sectionSeparator: '═',
        sectionSeparatorWidth: 50,
        progressUpdateInterval: 100,
        maxFailedMessagesShown: 5,
        units: {
          bytes: ['Bytes', 'KB', 'MB', 'GB', 'TB']
        },
        decimals: {
          bytes: 2
        },
        duration: {
          thresholds: {
            seconds: 1000,
            minutes: 60000,
            hours: 3600000
          }
        },
        bytesBase: 1024
      },
      network: {
        authTimeout: 5000,
        defaultMaxRetries: 3,
        backoff: {
          baseDelay: 1000,
          maxDelay: 5000
        },
        defaultHttpsPort: '443',
        httpStatusCodes: {
          ok: 200,
          unauthorized: 401,
          forbidden: 403,
          serverErrorThreshold: 500
        }
      },
      errorHandling: {
        patterns: {
          auth: ['401', 'Unauthorized'],
          network: ['Network error', 'ECONNREFUSED']
        }
      },
      messages: {
        sync: {
          firstTime: 'First time sync detected.',
          forceSync: 'Force sync requested.'
        },
        auth: {
          invalidToken: 'Invalid token',
          noToken: 'No token',
          noUserId: 'No user ID'
        },
        push: {
          requiresAuth: 'Auth required',
          cannotPushWithoutAuth: 'Cannot push'
        },
        machine: {
          noValidInterface: 'No valid interface'
        },
        httpErrors: {
          '401': 'Unauthorized',
          '403': 'Forbidden',
          '5xx': 'Server error'
        }
      },
      pricing: {
        syntheticModels: [],
        defaultFallbackModel: 'claude-sonnet-3.5',
        modelIdMappings: {},
        defaultPricing: {
          metadata: {},
          models: []
        }
      }
    });
  });

  describe('loadUserInfo', () => {
    it('should generate anonymous user info when file does not exist', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));
      
      const userInfo = await userService.loadUserInfo();
      
      expect(userInfo.anonymousId).toBe('anon-test-machine-id');
      expect(userInfo.clientMachineId).toBe('test-machine-id');
      expect(userInfo.auth).toBeUndefined();
    });

    it('should load existing user info from file', async () => {
      const existingInfo = {
        anonymousId: 'anon-123456',
        clientMachineId: '123456',
        auth: {
          userId: 'user-123',
          email: 'test@example.com',
          username: 'testuser',
          apiToken: 'token-123'
        }
      };
      
      mockFs.readFile.mockResolvedValue(JSON.stringify(existingInfo));
      
      const userInfo = await userService.loadUserInfo();
      
      expect(userInfo).toEqual(existingInfo);
    });
  });

  describe('authentication methods', () => {
    beforeEach(async () => {
      // Load user info first
      mockFs.readFile.mockRejectedValue(new Error('File not found'));
      await userService.loadUserInfo();
    });

    it('should return false for isAuthenticated when no auth data', () => {
      expect(userService.isAuthenticated()).toBe(false);
    });

    it('should return null for authenticated data when not logged in', () => {
      expect(userService.getAuthenticatedUserId()).toBeNull();
      expect(userService.getAuthenticatedEmail()).toBeNull();
      expect(userService.getApiToken()).toBeNull();
    });

    it('should save auth data on login', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      
      await userService.login('user-123', 'test@example.com', 'token-123');
      
      expect(userService.isAuthenticated()).toBe(true);
      expect(userService.getAuthenticatedUserId()).toBe('user-123');
      expect(userService.getAuthenticatedEmail()).toBe('test@example.com');
      expect(userService.getApiToken()).toBe('token-123');
      
      // Check file was written with new format
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('user_info.json'),
        expect.stringContaining('"api_key"')
      );
    });

    it('should reset all message sync statuses on login', async () => {
      const { getPrisma } = require('../../src/database');
      const mockPrismaClient = await getPrisma();
      
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      
      await userService.login('user-123', 'test@example.com', 'token-123');
      
      // Verify that updateMany was called to reset all sync statuses
      expect(mockPrismaClient.messageSyncStatus.updateMany).toHaveBeenCalledWith({
        where: {}, // Should update all records
        data: {
          syncedAt: null,
          retryCount: 0,
          syncResponse: null
        }
      });
    });

    it('should remove auth data on logout', async () => {
      // First login
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      await userService.login('user-123', 'test@example.com', 'token-123');
      
      // Then logout
      await userService.logout();
      
      expect(userService.isAuthenticated()).toBe(false);
      expect(userService.getAuthenticatedUserId()).toBeNull();
      
      // Check file was written without auth
      const lastWriteCall = mockFs.writeFile.mock.calls[mockFs.writeFile.mock.calls.length - 1];
      expect(lastWriteCall[1]).not.toContain('"auth"');
    });
  });

  describe('anonymous user ID generation', () => {
    it('should generate consistent anonymous user ID for same machine', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));
      
      const userInfo1 = await userService.loadUserInfo();
      
      // Create new instance
      const userService2 = new UserService();
      const userInfo2 = await userService2.loadUserInfo();
      
      // Should generate same anonymous ID for same machine (from machine info)
      expect(userInfo1.anonymousId).toBe(userInfo2.anonymousId);
      expect(userInfo1.clientMachineId).toBe(userInfo2.clientMachineId);
      expect(userInfo1.anonymousId).toBe('anon-test-machine-id');
      expect(userInfo1.clientMachineId).toBe('test-machine-id');
    });
  });
});