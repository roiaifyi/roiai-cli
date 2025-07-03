# roiai

CLI tool for tracking and managing AI service usage and costs. Currently supports Claude Code with more AI services coming soon.

## Installation

```bash
npm install -g roiai
```

### From Source

```bash
git clone https://github.com/roiai/roiai-cli.git
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

### Production Configuration

For production environments, ensure you set the NODE_ENV:

```bash
# Using environment variable
NODE_ENV=production roiai cc sync

# Or install globally and use the production script
npm install -g roiai
NODE_ENV=production roiai cc push
```

See [Configuration Guide](docs/configuration.md) for detailed configuration options and environment setup.

## Usage

### Sync Claude Code Data

Sync all Claude Code usage data to local database:

```bash
roiai cc sync

# Force full resync (clear existing data)
roiai cc sync --force

# Use custom data path
roiai cc sync --path /path/to/claude_raw_data
```

### Using Custom API Server

You can override the API server URL for any command using the `--api-url` option:

```bash
# Login to a different server
roiai cc --api-url https://staging.api.roiai.fyi login

# Push to a custom server
roiai cc --api-url https://custom.server.com push

# Check status on alternative server
roiai cc --api-url https://dev.api.roiai.fyi push-status
```

### Push to Remote

Push local database to remote server (automatically runs sync before pushing):

```bash
roiai cc push

# Skip the automatic sync before push
roiai cc push --skip-sync

# Custom batch size
roiai cc push --batch-size 500

# Force retry of failed messages
roiai cc push --force

# Dry run to preview what would be pushed
roiai cc push --dry-run
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
- `roiai-cli cursor` - Cursor AI (future)

## Documentation

- [Changelog](CHANGELOG.md) - Version history and release notes
- [Contributing](CONTRIBUTING.md) - Guidelines for contributing (coming soon)
- [API Documentation](docs/api.md) - Detailed API reference (coming soon)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
