import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import { UserService } from '../../src/services/user.service';
import { configManager } from '../../src/config';
import { MachineService } from '../../src/services/machine.service';
import { MachineInfo } from '../../src/models/types';

// Mock dependencies
jest.mock('fs/promises');
jest.mock('os');
jest.mock('../../src/database', () => ({
  prisma: {
    user: {
      upsert: jest.fn()
    },
    machine: {
      upsert: jest.fn()
    }
  }
}));
jest.mock('../../src/config');
jest.mock('../../src/services/machine.service');

describe('UserService', () => {
  let userService: UserService;
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockOs = os as jest.Mocked<typeof os>;
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
    (MachineService as any).getAppDirectory = jest.fn().mockReturnValue('/home/test/.roiai-cli');
    
    userService = new UserService();
    
    // Setup os mocks
    mockOs.hostname.mockReturnValue('test-machine');
    mockOs.platform.mockReturnValue('darwin');
    mockOs.arch.mockReturnValue('x64');
    mockOs.homedir.mockReturnValue('/home/test');
    mockOs.release.mockReturnValue('20.0.0');
    
    // Setup config mock
    mockConfigManager.get.mockReturnValue({
      app: { 
        dataDir: '~/.roiai-cli',
        machineInfoFilename: 'machine_info.json'
      },
      user: { infoFilename: 'user_info.json' },
      database: { path: ':memory:' },
      claudeCode: {} as any,
      api: {
        baseUrl: 'https://api.roiai.com',
        endpoints: {
          login: '/v1/cli/login',
          push: '/v1/data/upsync'
        }
      },
      push: {} as any,
      watch: {} as any,
      logging: { level: 'info' }
    });
  });

  describe('loadUserInfo', () => {
    it('should generate anonymous user info when file does not exist', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));
      
      const userInfo = await userService.loadUserInfo();
      
      expect(userInfo.userId).toBe('anon-test-machine-id');
      expect(userInfo.clientMachineId).toBe('test-machine-id');
      expect(userInfo.email).toBeUndefined();
      expect(userInfo.auth).toBeUndefined();
    });

    it('should load existing user info from file', async () => {
      const existingInfo = {
        userId: 'anon-123456',
        clientMachineId: '123456',
        auth: {
          realUserId: 'user-123',
          email: 'test@example.com',
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
      expect(userInfo1.userId).toBe(userInfo2.userId);
      expect(userInfo1.clientMachineId).toBe(userInfo2.clientMachineId);
      expect(userInfo1.userId).toBe('anon-test-machine-id');
      expect(userInfo1.clientMachineId).toBe('test-machine-id');
    });
  });
});