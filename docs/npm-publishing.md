# NPM Publishing Guide

## Prerequisites

1. NPM account with publish access to `roiai` package
2. NPM access token configured in GitHub secrets as `NPM_TOKEN`

## Publishing Process

### Automated Release (Recommended)

1. **Create a new release on GitHub:**
   - Go to Releases → Create new release
   - Tag version: `v1.0.1` (follow semver)
   - Release title: `Release v1.0.1`
   - Describe changes in release notes
   - Publish release

2. **GitHub Actions will automatically:**
   - Run tests
   - Build the project
   - Publish to NPM

### Manual Release

1. **Update version:**
   ```bash
   npm run version:patch  # 1.0.0 → 1.0.1
   # or
   npm run version:minor  # 1.0.0 → 1.1.0
   # or
   npm run version:major  # 1.0.0 → 2.0.0
   ```

2. **Test the release:**
   ```bash
   npm run release:dry
   ```

3. **Publish to NPM:**
   ```bash
   npm run release
   ```

4. **Push tags:**
   ```bash
   git push --tags
   ```

## Version Management

- **Patch**: Bug fixes (1.0.0 → 1.0.1)
- **Minor**: New features, backward compatible (1.0.0 → 1.1.0)
- **Major**: Breaking changes (1.0.0 → 2.0.0)

## Pre-publish Checklist

- [ ] All tests passing
- [ ] Build successful
- [ ] README updated
- [ ] CHANGELOG updated
- [ ] No sensitive data in package
- [ ] Production config points to roiAI.fyi

## Post-publish Verification

```bash
# Test installation
npm install -g roiai

# Verify command works
roiai --version
roiai cc sync --help
```