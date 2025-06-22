# Push (Upsync) Command Design Document

## Overview

The push command synchronizes local Claude usage data to a remote server. It implements a robust, resumable batch upload system that handles large datasets efficiently while managing failures gracefully.

## Architecture

### Data Flow

```
Local Database → Batch Selection → Entity Loading → Request Building → HTTP Push → Response Processing → Local Update
```

### Key Components

1. **Sync Status Table**: Tracks push state for each message
2. **Push Service**: Handles batching, data loading, and API communication
3. **Push Command**: CLI interface with progress tracking
4. **Configuration**: Customizable batch sizes and retry policies

## Database Design

### Sync Status Table
```sql
sync_status {
  id: INTEGER (PK)
  table_name: TEXT              -- Always 'messages' for push
  record_id: TEXT               -- Message UUID
  operation: TEXT               -- 'INSERT'
  local_timestamp: DATETIME     -- When record was created
  synced_at: DATETIME?          -- When successfully pushed
  sync_batch_id: TEXT?          -- Batch identifier
  sync_response: TEXT?          -- 'persisted', 'deduplicated', or error
  retry_count: INTEGER          -- Number of failed attempts
}
```

## API Design

### Push Request Structure

```typescript
interface PushRequest {
  batchId: string;                  // Unique batch identifier
  timestamp: string;                // ISO timestamp
  entities: {                       // Deduplicated entities
    users: Map<string, UserEntity>;
    machines: Map<string, MachineEntity>;
    projects: Map<string, ProjectEntity>;
    sessions: Map<string, SessionEntity>;
  };
  messages: MessageEntity[];        // Ordered by timestamp
  metadata: {
    clientVersion: string;
    totalMessages: number;
  };
}
```

### Entity Structures

Only minimal fields required for server-side matching/creation:

```typescript
interface UserEntity {
  id: string;
  email?: string;
  username?: string;
}

interface MachineEntity {
  id: string;
  userId: string;
  machineName?: string;
}

interface ProjectEntity {
  id: string;
  projectName: string;
  userId: string;
  clientMachineId: string;
}

interface SessionEntity {
  id: string;
  projectId: string;
  userId: string;
  clientMachineId: string;
}

interface MessageEntity {
  uuid: string;
  messageId: string;
  sessionId: string;
  projectId: string;
  userId: string;
  role: string;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  messageCost: string;              // Decimal as string
  timestamp?: string;               // ISO string
}
```

### Push Response Structure

```typescript
interface PushResponse {
  batchId: string;
  results: {
    persisted: {
      count: number;
      messageIds: string[];         // Successfully saved new messages
    };
    deduplicated: {
      count: number;
      messageIds: string[];         // Already existed on server
    };
    failed: {
      count: number;
      details: Array<{
        messageId: string;
        error: string;              // Specific error for this message
      }>;
    };
  };
  summary: {
    totalMessages: number;          // Total in batch
    messagesSucceeded: number;      // persisted + deduplicated
    messagesFailed: number;         // failed
    entitiesCreated: {
      users: number;
      machines: number;
      projects: number;
      sessions: number;
    };
    aggregatesUpdated: boolean;     // Whether server updated aggregates
    processingTimeMs: number;       // Server processing time
  };
}
```

## Implementation Strategy

### 1. Batch Selection

Select unpushed messages that haven't exceeded retry limit:

```sql
SELECT record_id 
FROM sync_status 
WHERE table_name = 'messages' 
  AND synced_at IS NULL 
  AND retry_count < ?
ORDER BY local_timestamp ASC 
LIMIT ?
```

**Key Features:**
- Natural resumption after interruption
- Chronological order preservation
- Automatic retry limit enforcement

### 2. Entity Loading

Load all messages with related entities in one query:

```typescript
const messages = await prisma.message.findMany({
  where: { uuid: { in: messageIds } },
  include: {
    session: {
      include: {
        project: {
          include: {
            machine: true,
            user: true
          }
        }
      }
    }
  }
});
```

Then build deduplicated entity maps for efficient transmission.

### 3. Error Handling

**Retry Strategy:**
- Network errors: Retry with exponential backoff
- Validation errors: Limited retries (likely won't succeed)
- Auth errors: Single retry after token refresh
- Server errors: Standard retry count

**Failed Message Handling:**
- Increment `retry_count` in sync_status
- Store error message in `sync_response`
- Skip messages exceeding `maxRetries`

### 4. Response Processing

Update sync_status based on server response:

1. **Persisted**: Mark as synced with timestamp
2. **Deduplicated**: Also mark as synced (no need to resend)
3. **Failed**: Increment retry count, store error

## CLI Commands

### Main Push Command

```bash
roiai cc push [options]

Options:
  -b, --batch-size <number>  Messages per batch (default: 1000)
  -d, --dry-run             Preview what would be pushed
  -f, --force               Reset retry count for failed records
  -v, --verbose             Show detailed progress
```

### Status Command

```bash
roiai cc push-status

Shows:
- Total synced/unsynced messages
- Retry count distribution
- Recent push history
```

## Configuration

```json
{
  "api": {
    "baseUrl": "https://api.roiai.com",
    "endpoints": {
      "login": "/api/v1/cli/login",
      "push": "/api/v1/cli/upsync"
    }
  },
  "push": {
    "apiToken": "",              // Bearer token for auth
    "batchSize": 1000,           // Messages per batch
    "maxRetries": 5,             // Max retry attempts
    "timeout": 30000             // Request timeout in ms
  }
}
```

## Server-Side Processing

When the server receives a push request:

1. **Validate** request structure and auth token
2. **Create/Match Entities**:
   - Check if users, machines, projects, sessions exist
   - Create missing entities
   - Maintain relationships
3. **Process Messages**:
   - Upsert messages using `messageId` for deduplication
   - Track which are new vs existing
4. **Update Aggregates**:
   - Calculate token usage changes
   - Update costs at all levels
   - Propagate counts (messages, sessions, projects)
5. **Return Response** with detailed results

## Performance Considerations

1. **Batch Size**: Balance between payload size and number of requests
2. **Entity Deduplication**: Send each entity only once per batch
3. **Database Queries**: Use single query with joins for efficiency
4. **Transaction Scope**: Update sync_status in single transaction
5. **Network Resilience**: Automatic retry with backoff

## Security

1. **Authentication**: Bearer token in Authorization header
2. **Data Validation**: Client and server-side validation
3. **Transport**: HTTPS only
4. **Idempotency**: Batch ID prevents duplicate processing

## Future Enhancements

1. **Compression**: Gzip request body for large batches
2. **Resumable Uploads**: For very large batches
3. **Parallel Processing**: Multiple concurrent batches
4. **Incremental Sync**: Only send changed fields
5. **Webhook Support**: Real-time push triggers

## Error Scenarios

### Network Failures
- Automatic retry with exponential backoff
- Batch remains unpushed for next attempt

### Partial Batch Failure
- Successfully pushed messages marked as synced
- Failed messages increment retry count
- Next push attempt only includes failed messages

### Authentication Issues
- Single retry after token refresh
- Clear error message for user action

### Server Errors
- Standard retry with backoff
- Preserve error details for debugging

## Testing Strategy

1. **Unit Tests**:
   - Batch selection logic
   - Entity deduplication
   - Response processing

2. **Integration Tests**:
   - Full push flow with mock server
   - Error handling scenarios
   - Retry behavior

3. **Performance Tests**:
   - Large batch handling
   - Memory usage with many entities
   - Network failure recovery