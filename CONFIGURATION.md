# Configuration Guide for roiai-cli

This guide explains how to configure the roiai-cli for your environment.

## Quick Start

1. **Copy the example config file:**
   ```bash
   cp config/local.example.json config/local.json
   ```

2. **Edit `config/local.json`** with your actual paths:
   ```json
   {
     "user": {
       "infoPath": "~/.claude/user_info.json"
     },
     "claudeCode": {
       "rawDataPath": "/path/to/your/claude_raw_data",
       "pricingDataPath": "/path/to/your/pricing-data.json"
     }
   }
   ```

3. **Create your user info file:**
   ```bash
   # Create the directory if it doesn't exist
   mkdir -p ~/.claude
   
   # Copy the example file
   cp config/user_info.example.json ~/.claude/user_info.json
   
   # Edit with your information
   nano ~/.claude/user_info.json
   ```

## Configuration Files

### 1. Main Configuration (`config/local.json`)

The main configuration file controls all aspects of the CLI. Create this file by copying `local.example.json`:

```json
{
  "user": {
    "infoPath": "~/.claude/user_info.json"  // Path to user info file
  },
  "claudeCode": {
    "rawDataPath": "../claude_raw_data",     // Path to Claude raw data
    "pricingUrl": "https://raw.githubusercontent.com/alansparrow/ai-models-pricing/main/claude/pricing-data.json",
    "pricingCacheTimeout": 3600000,          // Cache duration in ms (1 hour, 0 = no cache)
    "cacheDurationDefault": 5,               // Cache duration (5 or 60 minutes)
    "batchSize": 1000                        // Processing batch size
  },
  "sync": {
    "apiEndpoint": "https://api.example.com/upload",  // Remote API endpoint
    "apiToken": "your-secret-token",                  // API authentication
    "batchSize": 1000,                                // Upload batch size
    "maxRetries": 3                                   // Max retry attempts
  },
  "database": {
    "path": "./prisma/dev.db"                // SQLite database location
  },
  "logging": {
    "level": "info"                          // Log level: debug, info, warn, error
  }
}
```

### 2. User Info File

The user info file identifies you and your machine. Create it at the path specified in your config (default: `~/.claude/user_info.json`):

```json
{
  "userId": "your-unique-user-id",
  "clientMachineId": "your-machine-name",
  "email": "your-email@example.com"
}
```

If this file doesn't exist, the CLI will generate default values based on your system.

### 3. Pricing Data Configuration

The CLI fetches pricing data from a remote repository to ensure you always have up-to-date pricing:

```json
{
  "claudeCode": {
    "pricingUrl": "https://raw.githubusercontent.com/alansparrow/ai-models-pricing/main/claude/pricing-data.json",
    "pricingCacheTimeout": 3600000  // 1 hour in milliseconds
  }
}
```

- **pricingUrl**: URL to fetch the latest pricing data
- **pricingCacheTimeout**: How long to cache the data (milliseconds)
  - `3600000` = 1 hour (default)
  - `0` = No cache, fetch every time
  - `86400000` = 24 hours

## Common Path Configurations

### macOS
```json
{
  "claudeCode": {
    "rawDataPath": "~/Library/Application Support/Claude/claude_raw_data"
  }
}
```

### Windows
```json
{
  "claudeCode": {
    "rawDataPath": "C:\\Users\\YourName\\AppData\\Local\\Claude\\claude_raw_data"
  }
}
```

### Linux
```json
{
  "claudeCode": {
    "rawDataPath": "~/.local/share/claude/claude_raw_data"
  }
}
```

## Configuration Priority

Configuration is loaded in this order (later overrides earlier):

1. `config/default.json` - Base configuration (don't edit this)
2. `config/production.json` - Production overrides (if NODE_ENV=production)
3. `config/local.json` - Your local overrides (create this file)
4. Environment variables
5. Command-line arguments

## Environment Variables

You can override any config value using environment variables:

```bash
# Override the raw data path
export NODE_CONFIG='{"claudeCode":{"rawDataPath":"/custom/path"}}'

# Or set NODE_ENV for different configs
export NODE_ENV=production
```

## Command Line Overrides

Some commands support direct path overrides:

```bash
# Override raw data path for sync
roiai-cli cc sync --path /custom/claude_raw_data

# Override polling interval for watch
roiai-cli cc watch --interval 10000
```

## Troubleshooting

### "Claude raw data path does not exist"

This error means the configured `rawDataPath` doesn't exist. Check:

1. The path in your `config/local.json` is correct
2. The directory exists and you have read permissions
3. Use absolute paths if relative paths aren't working

### "User info file not found"

This warning appears when the user info file doesn't exist. The CLI will use default values, but you should create the file for proper user tracking:

```bash
mkdir -p ~/.claude
echo '{
  "userId": "'$(whoami)'",
  "clientMachineId": "'$(hostname)'",
  "email": "your-email@example.com"
}' > ~/.claude/user_info.json
```

### Custom User Info Location

To use a different location for the user info file:

```json
{
  "user": {
    "infoPath": "/custom/path/to/user_info.json"
  }
}
```

## Security Notes

1. **Never commit** `config/local.json` - it's gitignored
2. **Keep API tokens secret** - use environment variables in production
3. **User info is sensitive** - contains your email and user ID

## Example Setup Script

Here's a complete setup script:

```bash
#!/bin/bash

# Navigate to roiai-cli directory
cd roiai-cli

# Create config from example
cp config/local.example.json config/local.json

# Create user info directory
mkdir -p ~/.claude

# Create user info file
cat > ~/.claude/user_info.json << EOF
{
  "userId": "$(whoami)",
  "clientMachineId": "$(hostname)",
  "email": "your-email@example.com"
}
EOF

# Update config with your paths (macOS example)
cat > config/local.json << EOF
{
  "claudeCode": {
    "rawDataPath": "$HOME/Library/Application Support/Claude/claude_raw_data",
    "pricingDataPath": "$HOME/repos/claude-stat/pricing-data.json"
  }
}
EOF

# Build and run
npm run build
node dist/index.js cc sync
```