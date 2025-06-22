# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript CLI application for managing AI service usage data, starting with Claude Code tracking. It syncs usage data from local JSONL files to a SQLite database and provides analytics.

## Architecture

The codebase follows a modular architecture:
- **Commands** (`src/commands/cc/`): CLI command implementations using Commander.js
- **Services** (`src/services/`): Business logic for data processing, aggregation, and pricing
- **Database** (`src/database/`): Prisma ORM integration and database utilities
- **Models** (`src/models/`): TypeScript type definitions
- **Config** (`src/config/`): Configuration management using node-config
- **Base Classes** (`src/base/`): Abstract base classes for shared functionality
- **Utils** (`src/utils/`): Shared utility functions and constants

Key architectural decisions:
- Incremental processing tracks file state to avoid reprocessing
- Batch processing for efficiency with large datasets
- SQLite for local storage with comprehensive schema tracking users, machines, projects, sessions, and messages
- Shared utilities reduce code duplication and ensure consistency
- Configuration-driven behavior for customizable timeouts, display settings, and file processing

## Development Commands

```bash
# Build TypeScript
npm run build

# Development mode with auto-reload
npm run dev

# Database operations
npm run prisma:generate    # Generate Prisma client after schema changes
npm run prisma:migrate     # Run database migrations
npm run prisma:studio      # Open GUI to view/edit database

# Run the CLI (after building)
node dist/index.js cc sync
node dist/index.js cc watch
```

## Testing & Quality

**Note**: Tests are implemented using Jest. Run `npm test` to execute all tests. Run `npm run test:coverage` for coverage report. MachineService has comprehensive unit tests with 97.5% coverage.

There is no linting or formatting configuration at the project level. When making changes, follow the existing TypeScript conventions in the codebase.

## Important Notes

1. **Configuration**: The app uses `node-config` with `config/default.json` as base and `config/local.json` for user overrides
2. **Database Schema**: Located in `prisma/schema.prisma` - run migrations after changes
3. **File Processing**: The `FileStatus` model tracks which JSONL files have been processed to enable incremental updates
4. **Future Services**: Architecture supports adding GPT and Cursor tracking, but only Claude Code is implemented
5. **Push Command**: The push functionality to remote servers is now implemented with authentication and retry logic
6. **API Integration**: Updated to match roiai-web platform spec - login endpoint `/api/v1/cli/login`, push endpoint `/api/v1/cli/upsync`, Bearer auth
7. **App Data Directory**: All app data (user info, machine info) is stored in `~/.roiai-cli/` by default, configurable via `app.dataDir`
8. **Machine ID**: Persistent machine identification using MAC address + OS info, stored in `machine_info.json`
9. **Push Request Format**: Updated to new API spec with messages array and metadata containing entities and batch_info with message counts
10. **Code Quality**: Refactored to eliminate code duplication and unused dependencies, with shared utilities for common operations
11. **Configuration**: Extended configuration options for timeouts, display formatting, and file processing settings
12. **API Modernization**: Removed legacy endpoint compatibility, all configurations now use latest `/api/v1/cli/upsync` and `/api/v1/cli/login` paths
13. **API Configuration**: Refactored to separate api.baseUrl from endpoint paths for better environment support and configuration flexibility
14. **Enhanced Sync Display**: Added detailed model breakdown with token usage and cost analysis in sync command, featuring emoji UI and smart filtering
15. **API Endpoint Correction**: Fixed all API endpoints to include `/api` prefix to match web server routes, removed redundant `api_secret` field
16. **Enhanced User Data Storage**: Store complete user info (id, email, username) from server, clean logout deletes user_info.json
17. **Improved Sync Display**: Filter out models with zero usage from token usage display
18. **UserInfo Interface Refactoring**: Redesigned to separate anonymous and authenticated states with anonymousId for anonymous tracking and optional auth property for authenticated users
19. **Legacy Code Removal**: Removed all backward compatibility code for legacy user formats since we're in development mode
20. **Anonymous-First Sync**: Sync operations always use anonymous user ID for local storage, while push operations map to authenticated users
21. **First-Time Sync UX**: Added informative messages about sync performance for first-time and force sync operations
22. **Writer Enum Refactoring**: Replaced `isHumanInput` boolean with `writer` enum (human, agent, assistant) for better message classification, consolidated migrations, and improved sync display with clearer categorization
23. **Incremental Sync Reliability**: Fixed file change detection using both modification time and file size, ensured aggregates recalculate in incremental mode, and improved project counting accuracy
24. **Simplified Writer Classification**: Removed complex pattern matching in favor of simple `tool_use_id` detection for agent messages, enhanced message breakdown to show percentages for all types in Human → Agent → Assistant order
25. **Push Service Refactoring**: Use authenticated user ID directly instead of transformation, simplifying the code and removing unnecessary UUID transformations for user IDs
26. **Pricing Fields Non-Nullable**: Changed pricing fields in push message entities to use 0 instead of null for consistency and type safety
27. **API Endpoint Compatibility**: Updated push endpoint to /api/v1/cli/upsync and fixed entity field names (machineId) to match server expectations
27. **Push Service Optimization**: Combined selectUnpushedBatch and loadMessagesWithEntities into single query, optimized processPushResponse to use bulk updateMany operations instead of individual upserts for better performance
28. **OpenAPI Type Integration**: Integrated auto-generated types from web server OpenAPI spec, removed manual type definitions, ensuring type safety and API contract compliance
29. **Message-SyncStatus Relation**: Made syncStatus required for all messages with cascade delete, simplified message creation with nested sync status, improved data integrity
30. **Login Sync Reset**: Modified login to reset ALL message sync statuses (not just synced ones) to enable proper user switching and re-upload capability
31. **Incremental Cost Display**: Added cost tracking before and after sync operations to display incremental cost changes during sync command execution
32. **API Endpoint Update**: Updated push endpoint from `/api/v1/data/upsync` to `/api/v1/cli/upsync` to match the latest OpenAPI specification
33. **Push Authentication Validation**: Added health check endpoint integration with fail-fast authentication validation before and during push operations, including periodic re-authentication checks and comprehensive error handling
34. **Logout API Integration**: Enhanced logout command to call server logout endpoint for proper API key revocation, with graceful fallback to local-only logout and user guidance for manual key deletion when server call fails
35. **Enhanced Push Progress Display**: Added real-time progress bar with percentage, improved visual formatting with emojis and separators, and better batch processing feedback
36. **Streamlined Push Output**: Refactored push command to use single-line progress display, condensed initial statistics to one line, simplified final summary format, and fixed push-status authentication check