# Release Process for roiai-cli

This document outlines the step-by-step process for releasing new versions of the roiai-cli to NPM.

## Overview

The release process is automated through GitHub Actions but requires manual initiation to ensure proper versioning and changelog management.

## Prerequisites

- Ensure you have maintainer access to the GitHub repository
- Verify all tests are passing on the main branch
- Ensure CHANGELOG.md is up to date

## Release Types

- **Patch Release (1.0.0 → 1.0.1)**: Bug fixes and minor updates
- **Minor Release (1.0.0 → 1.1.0)**: New features that are backward compatible
- **Major Release (1.0.0 → 2.0.0)**: Breaking changes

## Step-by-Step Release Process

### 1. Prepare the Release

```bash
# Ensure you're on the main branch with latest changes
git checkout main
git pull origin main

# Run the release preparation script
npm run prepare-release

# This script will:
# - Run all tests
# - Build the project
# - Verify package.json configuration
# - Check for uncommitted changes
```

### 2. Update Version

```bash
# For patch release
npm run version:patch

# For minor release
npm run version:minor

# For major release
npm run version:major
```

This will:
- Update version in package.json
- Create a git commit with version bump
- Create a git tag

### 3. Update CHANGELOG.md

1. Move items from "Unreleased" section to the new version section
2. Add release date
3. Commit the changes:

```bash
git add CHANGELOG.md
git commit -m "docs: update CHANGELOG for v$(node -p "require('./package.json').version")"
```

### 4. Push Changes and Tag

```bash
# Push commits
git push origin main

# Push the version tag
git push origin v$(node -p "require('./package.json').version")
```

### 5. Create GitHub Release

The automated workflow will:
1. Create a GitHub release from the tag
2. Generate release notes
3. Trigger NPM publish workflow

### 6. Verify Release

After the automated process completes:

1. Check NPM package page: https://www.npmjs.com/package/roiai
2. Verify GitHub release: https://github.com/roiai/roiai-cli/releases
3. Test installation:

```bash
# Test global installation
npm install -g roiai@latest
roiai --version

# Test in a fresh project
mkdir test-roiai && cd test-roiai
npm init -y
npm install roiai
npx roiai --version
```

## Manual Release (Emergency)

If automated release fails, you can publish manually:

```bash
# Ensure you're logged in to NPM
npm whoami

# Build and publish
npm run build
npm run prisma:generate
npm publish
```

## Rollback Procedure

If a release has critical issues:

### 1. Deprecate the Bad Version

```bash
npm deprecate roiai@<version> "Critical issue found, please use version X.X.X"
```

### 2. Publish a Fix

1. Create a fix on a hotfix branch
2. Follow the normal release process with a patch version

### 3. Update GitHub Release

Mark the problematic release as pre-release and add a warning to the release notes.

## Post-Release Tasks

1. Announce the release in appropriate channels
2. Update any dependent documentation
3. Monitor issue tracker for any problems
4. Update roadmap/project board

## Troubleshooting

### NPM Publish Fails

1. Check NPM authentication: `npm whoami`
2. Verify NPM_TOKEN in GitHub secrets
3. Check for NPM service issues

### GitHub Action Fails

1. Check workflow logs in Actions tab
2. Verify all secrets are configured
3. Ensure branch protection rules allow the action

### Version Conflicts

1. Pull latest changes: `git pull origin main`
2. Resolve any conflicts
3. Re-run version bump command

## Security Notes

- Never commit sensitive credentials
- Use GitHub secrets for NPM_TOKEN
- Rotate tokens regularly
- Review dependencies before release

## Release Checklist

Before initiating a release:

- [ ] All tests passing
- [ ] Documentation updated
- [ ] CHANGELOG.md prepared
- [ ] No uncommitted changes
- [ ] Dependencies up to date
- [ ] Security vulnerabilities addressed
- [ ] Breaking changes documented (if major release)