# Push Command Implementation Plan

## Phase 1: Core Data Structures & Types
**Files to create:**
- `src/models/push.types.ts` - All interfaces for push functionality
- `src/config/push.config.ts` - Push-specific configuration

**Tasks:**
1. Define PushRequest, PushResponse interfaces
2. Define entity interfaces (minimal fields only)
3. Add push configuration to config system

## Phase 2: Push Service
**File to create:**
- `src/services/push.service.ts`

**Methods to implement:**
1. `selectUnpushedBatch()` - Query sync_status for batch
2. `loadMessagesWithEntities()` - Efficient loading with joins
3. `buildPushRequest()` - Construct API payload
4. `executePush()` - HTTP POST with error handling
5. `processPushResponse()` - Update sync_status records

**Key considerations:**
- Entity deduplication using Maps
- Proper error handling for network issues
- Transaction safety for database updates

## Phase 3: Push Command
**File to create:**
- `src/commands/cc/push.command.ts`

**Features:**
1. Main push logic with batch processing loop
2. Progress tracking with ora spinner
3. Options: --dry-run, --force, --verbose, --batch-size
4. Clear user feedback and error messages

## Phase 4: Push Status Command
**File to create:**
- `src/commands/cc/push-status.command.ts`

**Features:**
1. Show sync statistics
2. Display retry distribution
3. Identify problematic messages

## Phase 5: Configuration Updates
**Files to modify:**
- `config/default.json` - Add push section
- `config/local.example.json` - Add push examples
- `src/config/index.ts` - Add push config interface

## Phase 6: Testing
**Files to create:**
- `tests/unit/push.service.spec.ts`
- `tests/integration/push.command.spec.ts`

**Test scenarios:**
1. Batch selection with retry limits
2. Entity deduplication
3. Response processing (success/partial/failure)
4. Network error handling
5. Force retry functionality

## Phase 7: Documentation
**Files to update:**
- `README.md` - Add push command usage
- `CONFIGURATION.md` - Document push settings

## Implementation Order

1. **Day 1**: 
   - Create types and interfaces
   - Implement PushService core methods
   - Add configuration

2. **Day 2**:
   - Implement push command with basic functionality
   - Add push-status command
   - Test with mock server

3. **Day 3**:
   - Write comprehensive tests
   - Add error handling edge cases
   - Update documentation

## Success Criteria

- [ ] Can push messages in configurable batches
- [ ] Handles network failures gracefully
- [ ] Provides clear progress feedback
- [ ] Respects retry limits
- [ ] Updates local sync status correctly
- [ ] Shows accurate push statistics
- [ ] All tests passing
- [ ] Documentation complete

## Notes

- Start with mock server endpoint for testing
- Entity maps must maintain insertion order
- Use transactions for sync_status updates
- Consider memory usage for large batches
- Test interruption/resumption thoroughly