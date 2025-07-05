# Production Deployment Checklist

This checklist ensures a safe and reliable deployment of roiai-cli to production.

## Pre-Deployment Checklist

### Code Quality
- [ ] All tests passing (`npm test`)
- [ ] Build successful (`npm run build`)
- [ ] No TypeScript errors
- [ ] Code coverage meets standards (>80%)
- [ ] No security vulnerabilities (`npm audit`)

### Documentation
- [ ] README.md updated with latest features
- [ ] API documentation current
- [ ] CHANGELOG.md updated with version changes
- [ ] Release notes prepared
- [ ] Configuration documentation updated

### Version Management
- [ ] Version bumped appropriately (patch/minor/major)
- [ ] Git tags created
- [ ] All changes committed to main branch
- [ ] No uncommitted files

### Testing
- [ ] Manual testing completed on:
  - [ ] macOS
  - [ ] Linux
  - [ ] Windows (if supported)
- [ ] Integration tests with production API
- [ ] Performance testing for large datasets
- [ ] Error handling scenarios tested

### Configuration
- [ ] Production configuration verified
- [ ] API endpoints pointing to production
- [ ] Sensitive data removed from code
- [ ] Environment variables documented

## Deployment Steps

### 1. Final Preparation
```bash
# Run the preparation script
npm run prepare-release

# Verify everything is ready
git status
npm test
npm run build
```

### 2. Version and Tag
```bash
# Bump version (choose appropriate type)
npm run version:patch  # or minor/major

# Update CHANGELOG.md
# Move items from Unreleased to new version section

# Commit changelog
git add CHANGELOG.md
git commit -m "docs: update CHANGELOG for v$(node -p "require('./package.json').version")"

# Push changes and tags
git push origin main
git push origin --tags
```

### 3. Monitor Deployment
- [ ] GitHub Actions workflow started
- [ ] Tests passing in CI
- [ ] GitHub Release created
- [ ] NPM publish successful

### 4. Post-Deployment Verification

#### NPM Package
- [ ] Package visible on npmjs.com
- [ ] Version number correct
- [ ] Installation works: `npm install -g roiai@latest`
- [ ] Binary executable: `roiai --version`

#### Functionality Testing
```bash
# Test basic commands
roiai --help
roiai cc --help

# Test authentication
roiai cc login

# Test sync (if have Claude Code data)
roiai cc sync

# Test push
roiai cc push
```

#### API Integration
- [ ] Login endpoint working
- [ ] Push endpoint accepting data
- [ ] Health check responding
- [ ] Error handling graceful

## Rollback Procedure

If issues are discovered post-deployment:

### 1. Immediate Actions
```bash
# Deprecate the problematic version
npm deprecate roiai@<version> "Critical issue found, please use previous version"

# Notify users via GitHub issues/discussions
```

### 2. Fix and Re-release
1. Create hotfix branch from tag
2. Fix the issue
3. Test thoroughly
4. Release as patch version

### 3. Communication
- [ ] Update GitHub Release notes with known issues
- [ ] Post announcement about the issue
- [ ] Update status page (if applicable)

## Monitoring Post-Release

### First 24 Hours
- [ ] Monitor GitHub issues for bug reports
- [ ] Check NPM download stats
- [ ] Review error tracking (if configured)
- [ ] Monitor API logs for unusual activity

### First Week
- [ ] Gather user feedback
- [ ] Address critical issues
- [ ] Plan next release based on feedback
- [ ] Update roadmap

## Security Checklist

- [ ] No API keys or secrets in code
- [ ] Dependencies up to date
- [ ] No vulnerable dependencies
- [ ] Input validation in place
- [ ] Error messages don't leak sensitive info

## Performance Checklist

- [ ] Sync performance acceptable for large datasets
- [ ] Memory usage reasonable
- [ ] API calls properly rate limited
- [ ] Database queries optimized

## User Experience

- [ ] Error messages helpful and actionable
- [ ] Progress indicators working
- [ ] Commands respond quickly
- [ ] Help text clear and complete

## Final Sign-off

- [ ] Technical lead approval
- [ ] Product owner approval
- [ ] Security review completed
- [ ] Documentation reviewed

---

**Remember**: It's better to delay a release than to ship broken software. Take your time and verify everything works correctly.