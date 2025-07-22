# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [1.0.31] - 2025-07-22


## [1.0.2] - 2025-01-05

### Fixed
- Global installation ENOTEMPTY error by removing postinstall script
- Prisma client generation now happens on first run instead of during installation
- Reduced package size from 200KB+ to 119KB

### Changed
- Moved Prisma client generation from postinstall to runtime
- Added automatic Prisma client generation check on startup

## [1.0.1] - 2025-01-05

### Added
- Enhanced authentication error handling with NetworkErrorHandler utility
- Detailed error diagnostics for network failures (DNS, connection refused, timeouts)
- User-friendly troubleshooting tips in error messages
- Suppressed stack traces in production mode for cleaner output
- Comprehensive release process documentation
- Automated release workflow with GitHub Actions
- Release preparation script for pre-flight checks
- Production deployment checklist
- Version bump automation support

### Improved
- User experience with cleaner error messages
- Authentication flow with better guidance
- Re-login support allowing credential updates
- API response handling with proper unwrapping

### Fixed
- Duplicate error messages in SpinnerErrorHandler
- Debug logging showing technical details to users
- API client response wrapper handling

## [1.0.0] - 2024-12-28

### Added
- Initial release of roiai for AI service usage tracking
- Core commands: `cc sync`, `cc push`, `cc login`, `cc logout`, `cc push-status`
- Claude Code usage data synchronization from JSONL files
- SQLite database with Prisma ORM for local storage
- Incremental sync capability with file change detection
- Batch processing for efficient data handling
- Authentication with API token management
- Push functionality to sync with roiai.com platform
- Real-time progress display with percentage bars
- Comprehensive error handling and retry logic
- Machine identification using MAC address
- User management with anonymous and authenticated modes
- Cost tracking and pricing data integration
- Model usage breakdown with token counts
- Writer classification (human, agent, assistant)
- Configuration system with default and local overrides
- TypeScript implementation with strong typing
- Comprehensive test suite with 81.57% coverage

### Features Timeline

#### Authentication & Security
- API key revocation on logout with server integration
- Health check endpoint for authentication validation
- Bearer token authentication for all API calls
- Graceful fallback for offline logout scenarios

#### Performance Optimizations
- Batch processing with 1000-message chunks
- 96% performance improvement (7-40s vs 131s for large datasets)
- Sequential processing to eliminate race conditions
- Bulk database operations with updateMany
- Optimized push service with combined queries

#### User Experience
- Enhanced sync display with model breakdown
- Smart filtering hiding zero-usage models
- Incremental cost tracking showing before/after costs
- Single-line progress display for push operations
- Emoji UI with visual indicators
- First-time sync performance warnings
- Detailed push statistics and summaries

#### API Integration
- OpenAPI specification compliance
- Auto-generated types from server spec
- Updated endpoints matching platform spec
- Proper error response handling
- Structured request/response formats

#### Code Quality
- Comprehensive refactoring eliminating duplication
- 5 utility classes: SpinnerErrorHandler, AuthValidator, ProgressDisplay, DatabaseUtils, DisplayUtils
- Logger integration replacing console.error
- Configuration externalization for all constants
- TypeScript strict mode compliance
- 109 passing tests across 13 test suites

### Changed
- Writer classification from boolean to enum (human, agent, assistant)
- User info structure to support anonymous-first approach
- API endpoints to include /api prefix
- Push endpoint from /api/v1/data/upsync to /api/v1/cli/upsync
- Entity field names to match server expectations
- Pricing fields to non-nullable with 0 defaults
- Message-SyncStatus relation to required with cascade delete

### Fixed
- Race conditions in concurrent message processing
- Database constraint violations during batch operations
- File change detection using both mtime and size
- Incremental sync aggregate recalculation
- Authentication state handling during push
- API endpoint compatibility issues
- Project counting accuracy in aggregates

### Removed
- Legacy user format backward compatibility
- Redundant api_secret field
- Manual type definitions (replaced with OpenAPI types)
- Unused dependencies
- Code duplication across services

## Development Guidelines

### Commit Message Format
All commits follow the format: `<type>[scope]: <description>`

Types:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `docs`: Documentation changes
- `test`: Test additions/modifications
- `chore`: Maintenance tasks

### Version History Notes
The project started at version 1.0.0 as it represents a complete rewrite and fresh implementation of the AI usage tracking CLI, with no backward compatibility requirements from any previous versions.