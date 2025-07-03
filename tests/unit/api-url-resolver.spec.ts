import { Command } from 'commander';
import { ApiUrlResolver } from '../../src/utils/api-url-resolver';
import { configManager } from '../../src/config';

jest.mock('../../src/config');

describe('ApiUrlResolver', () => {
  const mockConfigManager = configManager as jest.Mocked<typeof configManager>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfigManager.getApiConfig.mockReturnValue({
      baseUrl: 'https://api.roiai.fyi',
      endpoints: {
        login: '/api/v1/cli/login',
        push: '/api/v1/cli/upsync'
      }
    });
  });

  describe('getApiUrl', () => {
    it('should return API URL from command option when provided', () => {
      const command = new Command();
      command.opts = jest.fn().mockReturnValue({ apiUrl: 'https://custom.api.com' });
      
      const result = ApiUrlResolver.getApiUrl(command);
      
      expect(result).toBe('https://custom.api.com');
    });

    it('should check parent commands for API URL option', () => {
      const parentCommand = new Command();
      parentCommand.opts = jest.fn().mockReturnValue({ apiUrl: 'https://parent.api.com' });
      
      const childCommand = new Command();
      childCommand.opts = jest.fn().mockReturnValue({});
      childCommand.parent = parentCommand;
      
      const result = ApiUrlResolver.getApiUrl(childCommand);
      
      expect(result).toBe('https://parent.api.com');
    });

    it('should return config URL when no command option is provided', () => {
      const command = new Command();
      command.opts = jest.fn().mockReturnValue({});
      
      const result = ApiUrlResolver.getApiUrl(command);
      
      expect(result).toBe('https://api.roiai.fyi');
      expect(mockConfigManager.getApiConfig).toHaveBeenCalled();
    });

    it('should traverse multiple parent levels to find API URL', () => {
      const grandparentCommand = new Command();
      grandparentCommand.opts = jest.fn().mockReturnValue({ apiUrl: 'https://grandparent.api.com' });
      
      const parentCommand = new Command();
      parentCommand.opts = jest.fn().mockReturnValue({});
      parentCommand.parent = grandparentCommand;
      
      const childCommand = new Command();
      childCommand.opts = jest.fn().mockReturnValue({});
      childCommand.parent = parentCommand;
      
      const result = ApiUrlResolver.getApiUrl(childCommand);
      
      expect(result).toBe('https://grandparent.api.com');
    });
  });

  describe('createOverrideConfig', () => {
    it('should create override config with API URL', () => {
      const result = ApiUrlResolver.createOverrideConfig('https://override.api.com');
      
      expect(result).toEqual({
        api: {
          baseUrl: 'https://override.api.com'
        }
      });
    });

    it('should return empty object when no URL provided', () => {
      const result = ApiUrlResolver.createOverrideConfig(undefined);
      
      expect(result).toEqual({});
    });
  });
});