# roiai

Analyze your Claude Code usage and costs - locally or across all your development machines.

**Privacy First**: You can use roiai completely locally without sending any data to the cloud. The `sync` command only stores data on your machine.

**Multi-Machine Analytics**: When you're ready, use `push` to consolidate data from all your development machines (work laptop, home desktop, etc.) and get a comprehensive view of your Claude Code usage across all devices.

## Installation

```bash
npm install -g roiai
```

## Quick Start

### Local-Only Usage (No Cloud)

```bash
# Just sync - all data stays on your machine
roiai cc sync
```

### Full Cloud Analytics (Recommended for Multi-Machine Users)

1. **Login to your roiAI account (use same account on all machines):**
   ```bash
   roiai cc login
   ```
2. **Push to cloud (automatically syncs and uploads):**
   ```bash
   roiai cc push
   ```
3. **View your consolidated analytics at [roiai.fyi](https://roiai.fyi)**
   - See usage across all your machines in one dashboard
   - Analyze costs by project, model, and time period
   - Identify usage patterns and optimize your Claude Code workflow

## Commands

### Authentication

```bash
# Login to roiAI
roiai cc login

# Check authentication status
roiai cc push-status

# Logout
roiai cc logout
```

### Claude Code Analytics

```bash
# Analyze Claude Code data and store locally (no cloud upload)
roiai cc sync

# Force full re-analysis (clears existing local data)
roiai cc sync --force

# Upload Claude Code analytics to roiAI cloud (includes automatic sync)
roiai cc push

# Push without syncing first (use existing local data)
roiai cc push --skip-sync
```

## Requirements

- Node.js 18.0.0 or higher
- Claude Code installed locally

## Support

- Issues: https://github.com/roiaifyi/roiai-cli/issues
- Website: https://roiai.fyi

## License

MIT
