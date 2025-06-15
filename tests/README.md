# ROIAI CLI Tests

This directory contains BDD (Behavior-Driven Development) style tests for the ROIAI CLI application.

## Test Structure

```
tests/
├── fixtures/          # Test data files
├── integration/       # Integration tests
├── unit/             # Unit tests
├── setup.ts          # Test setup and utilities
├── test-utils.ts     # Common test helpers
└── run-tests.sh      # Test runner script
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests with coverage
```bash
npm run test:coverage
```

### Run specific test file
```bash
npm test -- database.service.spec.ts
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run unit tests only
```bash
npm test -- --testPathIgnorePatterns=integration
```

### Run integration tests only
```bash
npm test -- --testPathIgnorePatterns=unit
```

## Test Features

- **Temporary Database**: Each test suite uses a temporary SQLite database that is automatically cleaned up
- **BDD Style**: Tests follow Given-When-Then structure for clarity
- **Isolated Tests**: Each test is isolated with proper setup and teardown
- **Mock Data**: Test fixtures provide realistic sample data

## Writing New Tests

1. Follow the BDD pattern:
   ```typescript
   describe('Given [context]', () => {
     describe('When [action]', () => {
       it('Then [expected outcome]', () => {
         // Test implementation
       });
     });
   });
   ```

2. Use test utilities for common operations:
   - `createTestConfig()` - Create test configuration
   - `createTestJsonlFile()` - Create sample JSONL files
   - `resetTestDatabase()` - Reset database between tests
   - `createTestPrismaClient()` - Get Prisma client for tests

3. Clean up resources in `afterEach` or `afterAll` hooks

## Test Coverage

The test suite covers:
- ✅ Sync command functionality
- ✅ Database service operations
- ✅ Aggregation service calculations
- ✅ Pricing service cost calculations
- ⏳ Watch command (pending)

## Debugging Tests

To debug tests in VS Code:
1. Set breakpoints in test files
2. Use the "Debug Jest Tests" launch configuration
3. Or run: `node --inspect-brk node_modules/.bin/jest --runInBand`