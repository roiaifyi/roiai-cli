# HTTP Batching Strategy for Remote Server Sync

## Overview
This document outlines the optimal batching strategy for syncing Claude Code usage data to a remote server via HTTP POST requests.

## Current Data Profile
- **Total unsynced records**: 8,651 messages
- **Average tokens per message**: ~39,256 tokens
- **Sessions to sync**: 32 sessions across 9 projects
- **Record size**: ~86 bytes per sync_status record (current state)

## Message Payload Size Estimation

### Per Message Breakdown
From the code analysis, each message record contains:
- Basic fields: ~200 bytes (IDs, timestamps, role, model)
- Token counts: 4 integers × 8 bytes = 32 bytes
- Cost data: 5 decimal fields × 16 bytes = 80 bytes
- **Base message size**: ~312 bytes

With JSON serialization overhead (~30%):
- **Per message**: ~406 bytes
- **With metadata**: ~500 bytes per message

## Optimal Batching Strategy

### 1. Batch Size: 100 messages per request
- Payload size: 100 × 500 bytes = ~50 KB per request
- Well within typical API limits (1-10 MB)
- Allows for response data and HTTP overhead
- Memory efficient for processing

### 2. Total Requests: 87 requests
- 8,651 messages ÷ 100 = 87 requests (last batch: 51 messages)
- Sequential processing recommended to avoid overwhelming server

### 3. Request Timing
- **Request interval**: 100-200ms between requests
- **Total sync time**: ~15-30 seconds (excluding server processing)
- **Concurrent requests**: Max 3-5 parallel requests to balance speed and server load

### 4. Memory Usage
- **Per batch in memory**: ~50 KB for payload + ~50 KB for processing = ~100 KB
- **Peak memory**: ~500 KB (with 5 concurrent requests)
- **Database query memory**: ~1 MB for fetching batch data

### 5. Error Handling Strategy
```typescript
interface BatchSyncStrategy {
  batchSize: 100,
  maxRetries: 3,
  retryDelay: 1000, // ms, exponential backoff
  maxConcurrent: 3,
  timeoutPerRequest: 30000, // 30 seconds
  
  // Batch tracking
  successfulBatches: Set<string>,
  failedMessages: Map<string, Error>,
  
  // Resume capability
  lastSyncedBatchId: string,
  checkpointEvery: 10 // batches
}
```

## Implementation Recommendations

1. **Batch by Session**: Group messages by sessionId to maintain logical coherence
2. **Checkpoint Progress**: Save progress every 10 batches to handle interruptions
3. **Response Handling**: Update sync_status immediately after each successful batch
4. **Compression**: Consider gzip compression for 60-70% size reduction
5. **Monitoring**: Log batch performance metrics for optimization

## Performance Metrics
- **Throughput**: ~290-580 messages/second (depending on server response time)
- **Bandwidth**: ~5 MB total data transfer (compressed: ~2 MB)
- **Success rate target**: >99% with retry mechanism
- **Recovery time**: <1 minute to resume from any failure point

## SQL Queries for Implementation

### Fetch Unsynced Messages in Batches
```sql
SELECT m.*, ss.id as sync_status_id
FROM messages m
JOIN sync_status ss ON ss.record_id = m.uuid
WHERE ss.synced_at IS NULL
  AND ss.table_name = 'messages'
ORDER BY m.session_id, m.timestamp
LIMIT 100
OFFSET ?;
```

### Update Sync Status After Successful Batch
```sql
UPDATE sync_status
SET synced_at = CURRENT_TIMESTAMP,
    sync_batch_id = ?,
    sync_response = ?
WHERE id IN (?);
```

### Handle Failed Messages
```sql
UPDATE sync_status
SET retry_count = retry_count + 1,
    sync_response = ?
WHERE id = ?
  AND retry_count < 3;
```

## Example Implementation Flow

```typescript
async function syncToRemoteServer() {
  const batchSize = 100;
  const maxConcurrent = 3;
  let offset = 0;
  let totalSynced = 0;
  
  while (true) {
    // Fetch batch
    const messages = await fetchUnsyncedMessages(batchSize, offset);
    if (messages.length === 0) break;
    
    try {
      // Send batch
      const response = await sendBatchToServer(messages);
      
      // Update sync status
      await markBatchAsSynced(messages, response.batchId);
      
      totalSynced += messages.length;
      console.log(`Synced ${totalSynced}/8651 messages`);
      
      // Rate limiting
      await sleep(100);
      
    } catch (error) {
      // Handle errors and retry logic
      await handleBatchError(messages, error);
    }
    
    offset += batchSize;
  }
}
```

## Monitoring and Alerts

### Key Metrics to Track
1. **Sync Success Rate**: Target >99%
2. **Average Batch Processing Time**: Should be <1 second
3. **Failed Message Count**: Alert if >1% of total
4. **Network Errors**: Track timeout and connection failures
5. **Server Response Times**: Monitor for degradation

### Health Checks
- Verify sync_status table consistency
- Check for orphaned sync records
- Monitor retry queue size
- Validate batch completeness

## Future Optimizations

1. **Dynamic Batch Sizing**: Adjust based on network conditions
2. **Parallel Session Processing**: Process different sessions concurrently
3. **Delta Sync**: Only sync changed fields for updates
4. **Binary Protocol**: Consider protobuf for 50% size reduction
5. **Streaming API**: For real-time sync capabilities

---

*This strategy balances efficiency, reliability, and server friendliness while ensuring all messages are successfully synced to the remote server.*