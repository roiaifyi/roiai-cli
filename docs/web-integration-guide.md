# Web Integration Guide for roiai-cli

This guide explains how to integrate the roiai-cli with a web application server for centralized AI usage tracking and analytics.

## Overview

The roiai-cli is designed to sync local AI usage data (currently Claude Code) to a remote web server. The integration follows a two-step process:
1. **Local Sync**: Extract usage data from Claude's JSONL files to a local SQLite database
2. **Remote Push**: Upload the local data to your web server via REST API

## Prerequisites

- roiai-cli installed and built (`npm install && npm run build`)
- A web server implementing the required API endpoints
- API authentication credentials

## Server API Requirements

Your web server must implement the following endpoints:

### 1. Authentication Endpoint
```
POST /api/v1/cli/login
Content-Type: application/json

Request:
{
  "email": "user@example.com",
  "api_key": "your-api-key"
}

Response:
{
  "success": true,
  "data": {
    "user": {
      "id": "user-uuid",
      "email": "user@example.com",
      "username": "username"
    },
    "token": "bearer-token-for-api-calls"
  }
}
```

### 2. Data Upload Endpoint
```
POST /api/v1/cli/upsync
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "batch_id": "unique-batch-id",
  "timestamp": "2024-01-20T10:30:00Z",
  "entities": {
    "users": [...],
    "machines": [...],
    "projects": [...],
    "sessions": [...]
  },
  "messages": [...],
  "metadata": {
    "entities": {
      "users": 1,
      "machines": 1,
      "projects": 5,
      "sessions": 10
    },
    "batch_info": {
      "total_messages": 100,
      "human_messages": 40,
      "agent_messages": 30,
      "assistant_messages": 30
    }
  }
}

Response:
{
  "batch_id": "unique-batch-id",
  "results": {
    "persisted": { "count": 90, "message_ids": [...] },
    "deduplicated": { "count": 10, "message_ids": [...] },
    "failed": { "count": 0, "details": [] }
  },
  "summary": {
    "total_messages": 100,
    "messages_succeeded": 100,
    "messages_failed": 0,
    "entities_created": {
      "users": 0,
      "machines": 1,
      "projects": 2,
      "sessions": 5
    }
  }
}
```

### 3. Health Check Endpoint (Optional)
```
GET /api/v1/health
Authorization: Bearer <token>

Response:
{
  "status": "ok",
  "authenticated": true
}
```

### 4. Logout Endpoint (Optional)
```
POST /api/v1/cli/logout
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "API key revoked successfully"
}
```

## Setup Steps

### 1. Configure API Connection

Create or edit `~/.roiai/config/local.json`:

```json
{
  "api": {
    "baseUrl": "https://your-server.com"
  }
}
```

### 2. Authenticate with Server

```bash
roiai cc login
```

This will:
- Prompt for your email and API key
- Authenticate with the server
- Store the authentication token locally

### 3. Sync Local Data

```bash
roiai cc sync
```

This extracts Claude Code usage from `~/.claude/settings/code/conversations/*.jsonl` files and stores it in the local SQLite database.

### 4. Push to Server

```bash
roiai cc push
```

This uploads the local data to your server in batches. Features include:
- Batch processing (default: 1000 messages per request)
- Automatic retry with exponential backoff
- Progress tracking with real-time updates
- Incremental sync (only new data is pushed)

### 5. Monitor Status

```bash
roiai cc push-status
```

Check the synchronization status and see pending uploads.

## Data Schema

The CLI tracks the following entities:

### Users
- `id`: Unique identifier
- `email`: User email (optional)
- `username`: Display name (optional)

### Machines
- `id`: Unique identifier (MAC address + OS hash)
- `userId`: Associated user
- `machineName`: Computer hostname

### Projects
- `id`: Unique identifier
- `projectName`: Project directory name
- `userId`: Owner user
- `machineId`: Where project exists

### Sessions
- `id`: Conversation identifier
- `projectId`: Associated project
- `userId`: Session user
- `machineId`: Session machine

### Messages
- `uuid`: Globally unique ID
- `messageId`: Original message ID
- `sessionId`: Parent session
- `role`: human/agent/assistant
- Token counts and costs
- Timestamps

## Configuration Options

Full configuration in `~/.roiai/config/local.json`:

```json
{
  "api": {
    "baseUrl": "https://your-server.com",
    "endpoints": {
      "login": "/api/v1/cli/login",
      "push": "/api/v1/cli/upsync",
      "health": "/api/v1/health",
      "logout": "/api/v1/cli/logout"
    }
  },
  "push": {
    "batchSize": 1000,
    "maxRetries": 5,
    "timeout": 30000,
    "retryDelay": 1000,
    "maxRetryDelay": 32000
  },
  "sync": {
    "fileProcessingLimit": 100,
    "displayLimit": 20
  }
}
```

## Security Considerations

1. **API Keys**: Store securely, never commit to version control
2. **HTTPS**: Always use HTTPS for API communication
3. **Token Storage**: Auth tokens are stored in `~/.roiai/user_info.json`
4. **Logout**: Use `roiai cc logout` to revoke tokens

## Server Implementation Tips

1. **Idempotency**: Use `messageId` for deduplication
2. **Batch Processing**: Process messages in transactions
3. **Entity Creation**: Create missing entities automatically
4. **Aggregate Updates**: Update usage statistics after each batch
5. **Error Handling**: Return detailed error information for failed messages

## Troubleshooting

### Authentication Issues
```bash
# Re-authenticate
roiai cc logout
roiai cc login

# Check current auth status
roiai cc push-status
```

### Network Problems
- Check API base URL configuration
- Verify server is accessible
- Check firewall/proxy settings
- Review server logs for errors

### Data Issues
```bash
# Force re-sync from scratch
roiai cc sync --force

# Reset failed push attempts
roiai cc push --force

# View detailed logs
roiai cc push --verbose
```

## Advanced Usage

### Custom Batch Sizes
```bash
roiai cc push --batch-size 500
```

### Dry Run Mode
```bash
roiai cc push --dry-run
```

### Automated Syncing
Create a cron job:
```bash
# Sync and push every hour
0 * * * * cd /path/to/roiai-cli && npm run roiai cc sync && npm run roiai cc push
```

## API Rate Limiting

If your server implements rate limiting:
1. Configure appropriate batch sizes
2. Add delays between batches if needed
3. Monitor 429 responses and adjust accordingly

## Support

For issues with:
- **CLI**: Check the [GitHub repository](https://github.com/your-org/roiai-cli)
- **Server Integration**: Consult your server documentation
- **API Changes**: Update CLI to match server API version