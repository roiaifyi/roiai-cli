# Code Duplication Analysis

## Overview
This document identifies duplicated code patterns found in the roiai-cli codebase that could be extracted into reusable utilities.

## Identified Patterns

### 1. Error Handling with Spinner and Process Exit

**Pattern:**
```typescript
try {
  // operation
} catch (error) {
  spinner.fail(`Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  if (options.verbose && error instanceof Error) {
    console.error('\nError details:', error.stack);
  }
  process.exit(1);
}
```

**Files affected:**
- `src/commands/cc/push.command.ts` (lines 254-259)
- `src/commands/cc/sync.command.ts` (lines 256-260)
- `src/commands/cc/login.command.ts`
- `src/commands/cc/logout.command.ts`

**Proposed utility:**
```typescript
export class SpinnerErrorHandler {
  static handleError(
    error: unknown, 
    spinner: Ora, 
    prefix: string = 'Operation failed',
    options?: { verbose?: boolean }
  ): never {
    const message = error instanceof Error ? error.message : 'Unknown error';
    spinner.fail(`${prefix}: ${message}`);
    
    if (options?.verbose && error instanceof Error) {
      console.error('\nError details:', error.stack);
    }
    
    process.exit(1);
  }
}
```

### 2. Authentication Validation Pattern

**Pattern:**
```typescript
if (!userService.isAuthenticated()) {
  spinner.fail('Please login first using \'roiai-cli cc login\' to push data');
  process.exit(1);
}

const apiToken = userService.getApiToken();
if (!apiToken) {
  spinner.fail('No API token found. Please login again.');
  process.exit(1);
}
```

**Files affected:**
- `src/commands/cc/push.command.ts` (lines 26-35)
- `src/commands/cc/push-status.command.ts`

**Proposed utility:**
```typescript
export class AuthenticationValidator {
  static validateAuthentication(
    userService: UserService, 
    spinner: Ora
  ): string {
    if (!userService.isAuthenticated()) {
      spinner.fail('Please login first using \'roiai-cli cc login\' to push data');
      process.exit(1);
    }
    
    const apiToken = userService.getApiToken();
    if (!apiToken) {
      spinner.fail('No API token found. Please login again.');
      process.exit(1);
    }
    
    return apiToken;
  }
}
```

### 3. Progress Display Pattern

**Pattern:**
```typescript
const processedCount = processedMessages.size;
const progressPercent = eligibleCount > 0 ? Math.round((processedCount / eligibleCount) * 100) : 0;
const progressBar = '█'.repeat(Math.floor(progressPercent / 2)) + '░'.repeat(50 - Math.floor(progressPercent / 2));
spinner.text = `[${progressBar}] ${progressPercent}% - Batch ${batchNumber}/${totalBatches}`;
```

**Files affected:**
- `src/commands/cc/push.command.ts` (lines 138-142)
- Similar patterns in `sync.command.ts`

**Proposed utility:**
```typescript
export class ProgressDisplay {
  static createProgressBar(current: number, total: number, width: number = 50): string {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    const filled = Math.floor((percent / 100) * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
  }
  
  static formatProgress(
    current: number, 
    total: number, 
    label: string = ''
  ): { percent: number; bar: string; text: string } {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    const bar = this.createProgressBar(current, total);
    const text = `[${bar}] ${percent}%${label ? ' - ' + label : ''}`;
    
    return { percent, bar, text };
  }
}
```

### 4. Database Upsert Pattern

**Pattern:**
```typescript
await prisma.user.upsert({
  where: { id: userId },
  create: {
    id: userId,
    email: userEmail,
  },
  update: {
    email: userEmail
  }
});
```

**Files affected:**
- `src/services/user.service.ts` (lines 80-89)
- Similar patterns in other services

**Proposed utility:**
```typescript
export class DatabaseUtils {
  static async upsertUser(
    prisma: PrismaClient,
    userId: string,
    email?: string
  ) {
    return prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, email },
      update: { email }
    });
  }
  
  static async upsertMachine(
    prisma: PrismaClient,
    machineId: string,
    userId: string,
    machineName: string,
    osInfo: string
  ) {
    return prisma.machine.upsert({
      where: { id: machineId },
      create: { id: machineId, userId, machineName, osInfo },
      update: { machineName, osInfo }
    });
  }
}
```

### 5. Batch Error Handling Pattern

**Pattern:**
```typescript
try {
  // batch operation
} catch (error) {
  if (error instanceof Error && error.message.includes('401')) {
    console.log(chalk.red('\n🚫 Authentication failed!'));
    console.log(chalk.yellow('Your API token may have expired.'));
    process.exit(1);
  }
  // handle other errors
}
```

**Files affected:**
- `src/commands/cc/push.command.ts` (lines 212-222)
- Similar patterns in other commands

**Proposed utility:**
```typescript
export class ApiErrorHandler {
  static isAuthenticationError(error: unknown): boolean {
    return error instanceof Error && (
      error.message.includes('401') ||
      error.message.includes('Unauthorized') ||
      error.message.includes('Invalid API key') ||
      error.message.includes('Authentication failed')
    );
  }
  
  static handleApiError(
    error: unknown,
    context: string = 'API request'
  ): void {
    if (this.isAuthenticationError(error)) {
      console.log(chalk.red('\n🚫 Authentication failed!'));
      console.log(chalk.yellow('Your API token may have expired or been revoked.'));
      console.log(chalk.yellow('Please run \'roiai-cli cc login\' to refresh your credentials.'));
      process.exit(1);
    }
    
    if (error instanceof Error && error.message.includes('Network error')) {
      console.log(chalk.yellow(`\nNetwork error during ${context}. Please check your connection.`));
      throw error;
    }
  }
}
```

### 6. Statistics Display Pattern

**Pattern:**
```typescript
console.log('\n' + chalk.bold('📊 Stats:'));
console.log(`   Property: ${chalk.green(value)}`);
console.log(`   Property: ${chalk.cyan(value.toLocaleString())}`);
```

**Files affected:**
- `src/commands/cc/sync.command.ts` (lines 134-144)
- `src/commands/cc/push.command.ts`

**Proposed utility:**
```typescript
export class DisplayUtils {
  static displayStats(title: string, stats: Record<string, any>, icon: string = '📊') {
    console.log('\n' + chalk.bold(`${icon} ${title}:`));
    
    for (const [key, value] of Object.entries(stats)) {
      const formattedKey = key.replace(/([A-Z])/g, ' $1').trim();
      const formattedValue = typeof value === 'number' 
        ? chalk.green(value.toLocaleString())
        : chalk.cyan(value);
      
      console.log(`   ${formattedKey}: ${formattedValue}`);
    }
  }
  
  static displayProgress(title: string, current: number, total: number) {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    console.log(`${title}: ${chalk.yellow(current.toLocaleString())} / ${chalk.green(total.toLocaleString())} (${percent}%)`);
  }
}
```

### 7. Configuration Loading Pattern

**Pattern:**
```typescript
const config = configManager.getClaudeCodeConfig();
const dataPath = options.path || config.rawDataPath;
```

**Files affected:**
- Multiple command files
- Service files

**Already handled by** `configManager`, but could be enhanced with validation utilities.

## Implementation Priority

1. **High Priority** (Most duplicated, high impact):
   - Error handling utilities
   - Authentication validation
   - Progress display utilities

2. **Medium Priority** (Moderate duplication):
   - Database upsert utilities
   - API error handling
   - Statistics display utilities

3. **Low Priority** (Less frequent but still useful):
   - Batch processing utilities
   - Configuration validation

## Benefits of Extraction

1. **Consistency**: Ensures uniform behavior across the application
2. **Maintainability**: Single place to update logic
3. **Testing**: Easier to unit test extracted utilities
4. **Code Reduction**: Less duplicate code to maintain
5. **Error Prevention**: Centralized error handling reduces bugs

## Next Steps

1. Create utility files in `src/utils/` for each pattern
2. Refactor existing code to use the new utilities
3. Add unit tests for the new utilities
4. Update documentation