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
6. **API Integration**: Updated to match roiai-web platform spec - login endpoint `/v1/cli/login`, push endpoint `/v1/data/upsync`, Bearer auth
7. **App Data Directory**: All app data (user info, machine info) is stored in `~/.roiai-cli/` by default, configurable via `app.dataDir`
8. **Machine ID**: Persistent machine identification using MAC address + OS info, stored in `machine_info.json`
9. **Push Request Format**: Updated to new API spec with messages array and metadata containing entities and batch_info with message counts
10. **Code Quality**: Refactored to eliminate code duplication and unused dependencies, with shared utilities for common operations
11. **Configuration**: Extended configuration options for timeouts, display formatting, and file processing settings
12. **API Modernization**: Removed legacy endpoint compatibility, all configurations now use latest `/v1/data/upsync` and `/v1/cli/login` paths
13. **API Configuration**: Refactored to separate api.baseUrl from endpoint paths for better environment support and configuration flexibility