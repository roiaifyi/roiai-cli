# Configuration Guide

This document explains how the roiai-cli configuration system works and how to properly configure it for different environments.

## Configuration System Overview

The roiai-cli uses the `node-config` library for hierarchical configuration management. Configuration files are loaded in a specific order, with later files overriding values from earlier ones.

## Configuration Loading Order

1. **`config/default.json`** - Base configuration for all environments
2. **`config/{environment}.json`** - Environment-specific overrides (based on NODE_ENV)
3. **`config/local.json`** - Local developer overrides (not committed to git)

**Important**: `config/local.json` overrides ALL other configurations, including production settings. Always remove or rename this file in production deployments.

## Environment Configuration

### Default Environment
When NODE_ENV is not set, only `default.json` and `local.json` are loaded.

```bash
# Uses default configuration
roiai cc sync
```

### Production Environment
For production deployments, you must set NODE_ENV=production:

```bash
# Use production configuration
NODE_ENV=production roiai cc sync

# Or using npm script
npm run start:production cc sync
```

### Development Environment
For development with specific overrides:

```bash
# Use development configuration
NODE_ENV=development roiai cc sync

# Or using npm script
npm run start:development cc sync
```

### Test Environment
Tests automatically set NODE_ENV=test:

```bash
npm test
```

## Key Configuration Values

### API Base URLs by Environment

- **Default**: `https://api.roiai.com` (staging)
- **Production**: `https://roiAI.fyi`
- **Test**: `http://localhost:3456`
- **Local Override**: `http://localhost:3000` (if config/local.json exists)

### API Endpoints

All environments use the same endpoint paths:
- Login: `/api/v1/cli/login`
- Push: `/api/v1/cli/upsync`
- Logout: `/api/v1/cli/logout`
- Health: `/api/v1/cli/health`

## Environment Variable Overrides

The node-config library supports runtime overrides using environment variables:

### JSON Override
```bash
NODE_CONFIG='{"api":{"baseUrl":"https://custom.url"}}' roiai cc sync
```

### Individual Value Override
```bash
NODE_CONFIG__api__baseUrl="https://custom.url" roiai cc sync
```

## Debugging Configuration

To see which configuration is being used:

```bash
# Enable verbose mode
roiai -v cc sync

# Enable configuration debugging
DEBUG_CONFIG=true roiai cc sync
```

## Production Deployment Checklist

1. **Set NODE_ENV=production** in your deployment environment
2. **Remove config/local.json** from production deployments
3. **Verify API endpoints** are pointing to production servers
4. **Test configuration** before deploying:
   ```bash
   NODE_ENV=production roiai -v cc login
   ```

## Common Issues

### Issue: Using wrong API endpoint in production
**Solution**: Ensure NODE_ENV=production is set and config/local.json doesn't exist

### Issue: Configuration validation fails
**Solution**: Check that all required fields are present in your configuration files

### Issue: Can't connect to API
**Solution**: Verify the api.baseUrl is correct for your environment using verbose mode

## Configuration File Examples

### Minimal Production Override
```json
{
  "api": {
    "baseUrl": "https://api.production.com"
  }
}
```

### Complete Environment Override
```json
{
  "api": {
    "baseUrl": "https://api.staging.com",
    "timeout": 60000
  },
  "database": {
    "path": "/var/data/roiai.db"
  },
  "logging": {
    "level": "warn"
  }
}
```