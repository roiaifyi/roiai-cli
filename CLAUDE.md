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

Key architectural decisions:
- Incremental processing tracks file state to avoid reprocessing
- Batch processing for efficiency with large datasets
- SQLite for local storage with comprehensive schema tracking users, machines, projects, sessions, and messages

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

**Note**: No tests are currently implemented. The `npm test` command will fail.

There is no linting or formatting configuration at the project level. When making changes, follow the existing TypeScript conventions in the codebase.

## Important Notes

1. **Configuration**: The app uses `node-config` with `config/default.json` as base and `config/local.json` for user overrides
2. **Database Schema**: Located in `prisma/schema.prisma` - run migrations after changes
3. **File Processing**: The `FileStatus` model tracks which JSONL files have been processed to enable incremental updates
4. **Future Services**: Architecture supports adding GPT and Cursor tracking, but only Claude Code is implemented
5. **Push Command**: The push functionality to remote servers is not yet implemented