import { MachineService } from '../../src/services/machine.service';
import { MachineInfo } from '../../src/models/types';
import fs from 'fs/promises';
import os from 'os';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// Mock modules
jest.mock('fs/promises');
jest.mock('os');
jest.mock('crypto');
jest.mock('uuid');
jest.mock('../../src/config', () => ({
  configManager: {
    get: () => ({
      app: {
        dataDir: '~/.roiai-cli',
        machineInfoFilename: 'machine_info.json'
      }
    })
  }
}));

describe('MachineService', () => {
  let machineService: MachineService;
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockOs = os as jest.Mocked<typeof os>;
  const mockCrypto = crypto as jest.Mocked<typeof crypto>;
  const mockUuidv4 = uuidv4 as jest.MockedFunction<typeof uuidv4>;

  const mockOsInfo = {
    platform: 'darwin',
    release: '20.6.0',
    arch: 'x64',
    hostname: 'test-machine'
  };

  const mockMachineInfo: MachineInfo = {
    uuid: 'test-uuid-1234',
    machineId: 'test-machine-id',
    osInfo: mockOsInfo,
    createdAt: '2024-01-01T00:00:00.000Z',
    version: 1
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup OS mocks
    mockOs.platform.mockReturnValue('darwin' as any);
    mockOs.release.mockReturnValue('20.6.0');
    mockOs.arch.mockReturnValue('x64');
    mockOs.hostname.mockReturnValue('test-machine');
    mockOs.homedir.mockReturnValue('/Users/test');
    
    // Setup UUID mock
    mockUuidv4.mockReturnValue('test-uuid-1234' as any);
    
    // Setup crypto mock
    const mockHash = {
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('test-machine-id-1234567890abcdef')
    };
    mockCrypto.createHash.mockReturnValue(mockHash as any);

    machineService = new MachineService();
  });

  describe('getAppDirectory', () => {
    it('should handle home directory path with ~', () => {
      const result = MachineService.getAppDirectory();
      expect(result).toBe('/Users/test/.roiai-cli');
      expect(mockOs.homedir).toHaveBeenCalled();
    });

    it('should handle absolute path without ~', () => {
      jest.resetModules();
      jest.mock('../../src/config', () => ({
        configManager: {
          get: () => ({
            app: {
              dataDir: '/absolute/path',
              machineInfoFilename: 'machine_info.json'
            }
          })
        }
      }));
      
      const { MachineService: MS } = require('../../src/services/machine.service');
      const result = MS.getAppDirectory();
      expect(result).toBe('/absolute/path');
    });
  });

  describe('loadMachineInfo', () => {
    it('should return cached machine info if already loaded', async () => {
      // First load - should read from file
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockMachineInfo));
      
      const firstResult = await machineService.loadMachineInfo();
      expect(firstResult).toEqual(mockMachineInfo);
      expect(mockFs.readFile).toHaveBeenCalledTimes(1);
      
      // Second load - should return cached
      const secondResult = await machineService.loadMachineInfo();
      expect(secondResult).toEqual(mockMachineInfo);
      expect(mockFs.readFile).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should load existing machine info from file', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockMachineInfo));
      
      const result = await machineService.loadMachineInfo();
      
      expect(result).toEqual(mockMachineInfo);
      expect(mockFs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('machine_info.json'),
        'utf-8'
      );
    });

    it('should generate new machine info if file does not exist', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      
      const result = await machineService.loadMachineInfo();
      
      expect(result).toMatchObject({
        uuid: 'test-uuid-1234',
        machineId: 'test-machine-id-',
        osInfo: mockOsInfo,
        version: 1
      });
      expect(result.createdAt).toBeDefined();
      expect(mockFs.mkdir).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should handle file read errors and generate new info', async () => {
      mockFs.readFile.mockRejectedValue(new Error('Permission denied'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      
      const result = await machineService.loadMachineInfo();
      
      expect(result).toMatchObject({
        uuid: 'test-uuid-1234',
        machineId: 'test-machine-id-',
        version: 1
      });
      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });

  describe('generateMachineInfo', () => {
    it('should generate machine info with correct structure', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      
      const result = await machineService.loadMachineInfo();
      
      expect(result).toMatchObject({
        uuid: 'test-uuid-1234',
        machineId: expect.stringMatching(/^test-machine-id-/),
        osInfo: {
          platform: 'darwin',
          release: '20.6.0',
          arch: 'x64',
          hostname: 'test-machine'
        },
        version: 1
      });
      expect(new Date(result.createdAt)).toBeInstanceOf(Date);
    });

    it('should create unique machine ID from UUID and OS info', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      
      await machineService.loadMachineInfo();
      
      expect(mockCrypto.createHash).toHaveBeenCalledWith('sha256');
      const hashMock = mockCrypto.createHash('sha256');
      expect(hashMock.update).toHaveBeenCalledWith(
        'test-uuid-1234:darwin:20.6.0:x64:test-machine'
      );
      expect(hashMock.digest).toHaveBeenCalledWith('hex');
    });
  });

  describe('saveMachineInfo', () => {
    it('should create directory and save machine info', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      
      await machineService.loadMachineInfo();
      
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('.roiai-cli'),
        { recursive: true }
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('machine_info.json'),
        expect.stringContaining('"uuid"')
      );
    });

    it('should save machine info with proper formatting', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      
      await machineService.loadMachineInfo();
      
      const writeCall = mockFs.writeFile.mock.calls[0];
      const savedData = JSON.parse(writeCall[1] as string);
      
      expect(savedData).toMatchObject({
        uuid: 'test-uuid-1234',
        machineId: expect.any(String),
        osInfo: mockOsInfo,
        version: 1
      });
    });
  });

  describe('getMachineId', () => {
    it('should return machine ID after loading', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockMachineInfo));
      
      await machineService.loadMachineInfo();
      const machineId = machineService.getMachineId();
      
      expect(machineId).toBe('test-machine-id');
    });

    it('should throw error if machine info not loaded', () => {
      expect(() => machineService.getMachineId()).toThrow('Machine info not loaded');
    });
  });

  describe('getMachineInfo', () => {
    it('should return full machine info after loading', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockMachineInfo));
      
      await machineService.loadMachineInfo();
      const info = machineService.getMachineInfo();
      
      expect(info).toEqual(mockMachineInfo);
    });

    it('should throw error if machine info not loaded', () => {
      expect(() => machineService.getMachineInfo()).toThrow('Machine info not loaded');
    });
  });

  describe('edge cases', () => {
    it('should handle corrupted machine info file', async () => {
      mockFs.readFile.mockResolvedValue('invalid json {');
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      
      const result = await machineService.loadMachineInfo();
      
      // Should generate new info when JSON parsing fails
      expect(result).toMatchObject({
        uuid: 'test-uuid-1234',
        version: 1
      });
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should handle write failures gracefully', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockRejectedValue(new Error('Permission denied'));
      
      // Should throw the write error
      await expect(machineService.loadMachineInfo()).rejects.toThrow('Permission denied');
    });

    it('should handle mkdir failures', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
      mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));
      
      await expect(machineService.loadMachineInfo()).rejects.toThrow('Permission denied');
    });
  });
});