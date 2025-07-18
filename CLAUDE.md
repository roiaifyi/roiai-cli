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
7. **App Data Directory**: All app data (user info, machine info) is stored in `~/.roiai/` by default, configurable via `app.dataDir`
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
37. **Comprehensive Code Cleanup**: Removed unused dependencies, replaced console.error with logger, created 5 utility classes to reduce code duplication (SpinnerErrorHandler, AuthValidator, ProgressDisplay, DatabaseUtils, DisplayUtils), externalized all hard-coded values to configuration, achieving 81.57% test coverage with all 109 tests passing
38. **Enhanced Authentication Error Handling**: Created NetworkErrorHandler utility for detailed error diagnostics, improved push command error display with troubleshooting tips, suppressed stack traces in production mode for cleaner output
39. **Automatic Sync Before Push**: Push command now automatically runs sync before pushing to ensure all latest data is uploaded, can be skipped with `--skip-sync` flag, created reusable SyncService for code sharing between sync and push commands
40. **Sync Service Refactoring**: Extracted sync logic into reusable SyncService class, enabling sync functionality to be used by multiple commands with configurable quiet mode for silent operation
41. **Utility Class Modernization**: Created ValidationUtils and FormatterUtils classes to eliminate code duplication in error handling, percentage calculations, and currency formatting across all services and commands
42. **Temporary Files Directory**: All temporary data (logs, test databases, temp files) should be stored in `./tmp` directory, which is ignored by git. This keeps the project root clean and prevents accidental commits of temporary data
43. **Enhanced Authentication UX**: Improved authentication error messages with clear step-by-step instructions, replaced technical logger output with user-friendly console messages, added visual guidance with colors and emojis, included roiAI.fyi links for account creation
44. **Error Message Duplication Fix**: Fixed SpinnerErrorHandler to eliminate duplicate error messages by removing redundant logger.error calls, as spinner.fail already outputs the error message to console
45. **Enhanced User Experience**: Removed all logger prefixes ([INFO], [WARN], [ERROR]) from user-facing output by replacing logger calls with console methods and chalk formatting, added account creation reminders for failed logins, improved visual feedback with emojis and better color usage
46. **API Response Wrapper Handling**: Fixed all API endpoints to handle server's wrapped response format `{success: true, data: {...}}`, updated TypedApiClient methods (cliLogin, cliLogout, cliHealthCheck, cliUpsync) to extract data from wrapper, migrated Push Service from generated client to TypedApiClient for consistent response handling
47. **Re-login Support**: Modified login command to always allow re-authentication even when already logged in, shows current login status but proceeds with new credential prompts, automatically revokes old API key and replaces with new one on successful authentication, displays appropriate messages for re-authentication vs new login
48. **Debug Logging Cleanup**: Removed console.error debug logging that was showing full error objects to end users, improving UX by only displaying user-friendly error messages without technical details like status codes and headers
49. **Pricing Configuration Migration**: Moved all pricing data from hardcoded values in PricingService to configuration file (`config/default.json`), including model ID mappings, synthetic models list, and default pricing data with complete metadata and cache pricing tiers
50. **SpinnerUtils Utility Class**: Created new utility class for consistent spinner operations across all commands and services, provides safe methods (update, succeed, fail, warn, info, stop, clear) that handle undefined spinner instances gracefully, reducing code duplication
51. **Extended AuthValidator Usage**: Expanded AuthValidator utility class usage across all authentication-requiring commands (login, logout, push, push-status), providing consistent authentication validation, error handling, and user guidance with helpful messages and account creation reminders
52. **Dead Code Removal**: Removed unused dependencies from package.json (dotenv, joi, @types/joi, @types/uuid) that were no longer used after refactoring to configuration-based approach, cleaned up associated imports and implementations
53. **Configuration Helper Enhancement**: Extended ConfigHelper utility to provide type-safe access to all configuration sections including new pricing configuration, ensuring consistent default values and preventing runtime errors from missing configuration values