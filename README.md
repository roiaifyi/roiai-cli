# roiai-cli

CLI tool for managing AI service usage data, starting with Claude Code tracking.

## Installation

### From npm (Recommended)

```bash
npm install -g roiai-cli
```

### From Source

```bash
git clone https://github.com/yourusername/roiai-cli.git
cd roiai-cli
npm install
npm run build
npm run prisma:generate
npm link
```

## Configuration

1. **Copy the example configuration:**
   ```bash
   cp config/local.example.json config/local.json
   ```

2. **Edit `config/local.json`** with your actual paths:
   ```json
   {
     "claudeCode": {
       "rawDataPath": "/path/to/your/claude_raw_data",  // Parent directory, not projects/
       "pricingDataPath": "/path/to/your/pricing-data.json"
     }
   }
   ```

3. **Set up user info** (optional):
   ```bash
   cp config/user_info.example.json ~/.claude/user_info.json
   # Edit ~/.claude/user_info.json with your details
   ```

See [CONFIGURATION.md](CONFIGURATION.md) for detailed configuration options.

## Usage

### Sync Claude Code Data

Sync all Claude Code usage data to local database:

```bash
roiai-cli cc sync

# Force full resync (clear existing data)
roiai-cli cc sync --force

# Use custom data path
roiai-cli cc sync --path /path/to/claude_raw_data
```

### Watch for Changes

Watch the Claude Code data directory and auto-sync changes:

```bash
roiai-cli cc watch

# Use custom path
roiai-cli cc watch --path /path/to/claude_raw_data

# Set polling interval (milliseconds)
roiai-cli cc watch --interval 10000
```

### Push to Remote (Coming Soon)

Push local database to remote server:

```bash
roiai-cli cc push

# Skip confirmation
roiai-cli cc push --yes

# Custom batch size
roiai-cli cc push --batch-size 500
```

## Database

The SQLite database is stored at `prisma/dev.db`. You can view it using:

```bash
npm run prisma:studio
```

### Troubleshooting Database Issues

If you encounter errors like "The table `main.users` does not exist in the current database", this usually means the database file exists but the schema hasn't been applied. To fix this:

1. **Remove the existing database file:**
   ```bash
   rm -f prisma/dev.db prisma/dev.db-journal
   ```

2. **Recreate the database with the schema:**
   ```bash
   npx prisma db push
   ```

3. **Verify the database was created:**
   ```bash
   ls -la prisma/dev.db
   # Should show a file size > 0 bytes (typically ~100KB)
   ```

**Note:** If the database is created in the wrong location (e.g., `prisma/prisma/dev.db`), check your `.env` file. The `DATABASE_URL` should be:
```
DATABASE_URL="file:./dev.db"
```
This ensures the database is created at `prisma/dev.db` relative to the project root.

## Development

```bash
# Run in development mode
npm run dev

# Build TypeScript
npm run build

# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate
```

## Architecture

- **TypeScript** for type safety
- **Prisma ORM** for database management
- **Commander.js** for CLI framework
- **SQLite** for local storage
- **Chokidar** for file watching

## Future Services

The CLI is designed to support multiple AI services:
- `roiai-cli cc` - Claude Code
- `roiai-cli gpt` - OpenAI GPT (future)
- `roiai-cli cursor` - Cursor AI (future)# roiai
