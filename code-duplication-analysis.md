# Code Duplication Analysis for roiai-cli

## 1. Error Handling Patterns

### Current State:
- Similar try-catch blocks across multiple services
- Repeated error message formatting in push.service.ts, login.command.ts
- Duplicate error type checking (auth errors, network errors, validation errors)
- Inconsistent error response handling

### Duplication Found:
```typescript
// Pattern repeated in multiple files:
} catch (error: any) {
  let errorMessage: string;
  if (error.statusCode === 401) {
    errorMessage = 'Authentication failed...';
  } else if (error.statusCode === 403) {
    errorMessage = 'Access forbidden...';
  } else if (error.statusCode >= 500) {
    errorMessage = `Server error (${error.statusCode})...`;
  } else if (error.code) {
    errorMessage = ErrorFormatter.formatError(error.code, error.message);
  } else {
    errorMessage = error.message || 'Unknown error';
  }
}
```

### Recommendation:
Create a centralized `ErrorHandler` utility that:
- Standardizes error type detection
- Provides consistent error message formatting
- Handles different error response formats (statusCode, code, message)
- Includes retry logic for transient errors

## 2. Configuration Access Patterns

### Current State:
- Mixed usage of `configManager.get()` and `ConfigHelper`
- Repeated config path resolutions
- Duplicate config validation logic

### Duplication Found:
```typescript
// Pattern seen across services:
const config = configManager.get();
const messages = config.messages;
const apiConfig = config.api;
const displayConfig = config.display;
```

### Recommendation:
Enhance `ConfigHelper` to:
- Provide typed getters for all config sections
- Cache frequently accessed values
- Handle default values consistently
- Validate config values on access

## 3. Display and Formatting Logic

### Current State:
- Repeated progress bar generation
- Duplicate percentage calculations
- Similar console output formatting with chalk
- Inconsistent emoji usage

### Duplication Found:
```typescript
// Progress display pattern in multiple commands:
const progressPercent = total > 0 ? Math.round((current / total) * 100) : 0;
const progressBar = '█'.repeat(Math.floor(progressPercent / 2)) + '░'.repeat(50 - Math.floor(progressPercent / 2));
console.log(`[${progressBar}] ${progressPercent}%`);

// Percentage formatting repeated:
const percentage = ((value / total) * 100).toFixed(1);
```

### Recommendation:
Extend `DisplayUtils` and `FormatterUtils` to include:
- Progress bar generation
- Consistent percentage formatting
- Status message formatting
- Table/grid display helpers

## 4. Database Query Patterns

### Current State:
- Repeated upsert patterns
- Similar batch processing logic
- Duplicate transaction handling

### Duplication Found:
```typescript
// Upsert pattern repeated:
await prisma.entity.upsert({
  where: { id: entityId },
  update: { field: value || undefined },
  create: { id: entityId, field: value || null }
});

// Batch processing pattern:
const BATCH_SIZE = ConfigHelper.getProcessing().batchSize;
for (let i = 0; i < items.length; i += BATCH_SIZE) {
  const batch = items.slice(i, i + BATCH_SIZE);
  // process batch
}
```

### Recommendation:
Enhance `DatabaseUtils` to include:
- Generic upsert helper methods
- Batch processing utilities
- Transaction wrapper with retry logic
- Common query builders

## 5. API Request/Response Handling

### Current State:
- Repeated API client initialization
- Similar request building patterns
- Duplicate response validation

### Duplication Found:
```typescript
// API client creation pattern:
const apiUrl = ApiUrlResolver.getApiUrl(command);
const apiClient = createApiClient(apiUrl, token);

// Response handling pattern:
const response = await apiClient.method(request);
if (!response || !response.data) {
  throw new Error('Invalid response format');
}
```

### Recommendation:
Create an `ApiService` base class that:
- Handles client initialization
- Provides request/response interceptors
- Implements retry logic with exponential backoff
- Validates response formats

## 6. Validation Logic

### Current State:
- Limited to `ValidationUtils.requireNonNull`
- Repeated input validation in commands
- Duplicate credential validation

### Duplication Found:
```typescript
// Validation patterns:
if (!value || value.length === 0) {
  throw new Error('Value is required');
}

if (!email.includes('@')) {
  throw new Error('Invalid email format');
}
```

### Recommendation:
Extend `ValidationUtils` to include:
- Email validation
- UUID validation
- Path validation
- Numeric range validation
- Required field validation with custom messages

## 7. File System Operations

### Current State:
- Repeated path resolution logic
- Duplicate file existence checks
- Similar directory creation patterns

### Duplication Found:
```typescript
// Path resolution pattern:
if (path.startsWith('~/')) {
  path = path.replace(/^~/, os.homedir());
}
if (!path.isAbsolute(path)) {
  path = path.resolve(process.cwd(), path);
}
```

### Recommendation:
Enhance `FileSystemUtils` to include:
- Consistent path resolution
- Safe file read/write operations
- Directory creation with parents
- File existence checks with proper error handling

## 8. Spinner/Loading State Management

### Current State:
- `SpinnerErrorHandler` exists but could be expanded
- Repeated spinner state management
- Duplicate success/failure message formatting

### Duplication Found:
```typescript
// Spinner pattern:
const spinner = ora('Loading...').start();
try {
  // operation
  spinner.succeed('Success message');
} catch (error) {
  spinner.fail('Error message');
  // handle error
}
```

### Recommendation:
Create a `SpinnerManager` utility that:
- Wraps async operations with automatic spinner management
- Provides consistent success/failure formatting
- Handles nested operations
- Supports quiet mode

## Priority Recommendations

1. **High Priority**: Enhance error handling utilities to reduce duplication in push.service.ts and commands
2. **High Priority**: Extend validation utilities for common validation patterns
3. **Medium Priority**: Create progress display utilities for consistent UI
4. **Medium Priority**: Add database query builders for common patterns
5. **Low Priority**: Enhance file system utilities for path operations

## Estimated Impact

- **Lines of code reduction**: ~500-700 lines
- **Improved maintainability**: Centralized logic for easier updates
- **Better consistency**: Uniform error messages and formatting
- **Easier testing**: Utilities can be unit tested independently