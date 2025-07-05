# NPM Global Installation Fix

## Problem
The `npm install -g roiai` command was failing with an `ENOTEMPTY` error during installation. This was caused by the `postinstall` script that runs `prisma generate`, which creates files during the npm installation process, causing race conditions.

## Solution
We removed the `postinstall` script from `package.json` and instead implemented runtime Prisma client generation that happens on first run of the CLI.

### Changes Made:

1. **Removed postinstall script** from `package.json`
   ```diff
   - "postinstall": "prisma generate",
   ```

2. **Added runtime Prisma check** in `src/utils/prisma-check.ts`
   - Checks if Prisma client exists
   - Generates it automatically on first run
   - Shows user-friendly message during generation

3. **Updated main entry point** to call `ensurePrismaClient()` before any operations

## Installation Notes

### For Users
- The CLI will automatically generate required database components on first run
- This is a one-time process that takes a few seconds
- You may see: "First time setup: Generating Prisma client..."

### For Global Installation
If you encounter permission errors during global installation:
```bash
# Option 1: Use sudo
sudo npm install -g roiai

# Option 2: Configure npm to use a different directory
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH
npm install -g roiai
```

## Version
This fix was implemented in version 1.0.2