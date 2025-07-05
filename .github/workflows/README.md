# GitHub Workflows

This project uses GitHub Actions for continuous integration and release management.

## Workflows

### CI (`ci.yml`)
- **Trigger**: On push to main/develop branches and on pull requests
- **Purpose**: Run tests and ensure code quality
- **Matrix**: Tests on Node.js 18.x and 20.x
- **Steps**:
  1. Install dependencies
  2. Generate Prisma client
  3. Build project
  4. Run tests
  5. Generate coverage report

### Manual Release (`manual-release.yml`)
- **Trigger**: Manual workflow dispatch
- **Purpose**: Create a new release and publish to NPM
- **Inputs**:
  - `version_type`: patch, minor, major, or custom
  - `custom_version`: Specific version number (only for custom type)
  - `skip_tests`: Option to skip tests (default: false)

## Release Process

To create a new release:

1. Go to Actions tab in GitHub
2. Select "Manual Release" workflow
3. Click "Run workflow"
4. Choose version type:
   - `patch`: Bug fixes (1.0.0 → 1.0.1)
   - `minor`: New features (1.0.0 → 1.1.0)
   - `major`: Breaking changes (1.0.0 → 2.0.0)
   - `custom`: Specify exact version
5. Click "Run workflow"

The workflow will:
1. Run tests (unless skipped)
2. Bump version in package.json
3. Update CHANGELOG.md
4. Commit changes
5. Create and push git tag
6. Publish to NPM
7. Create GitHub release with notes

## Required Secrets

- `NPM_TOKEN`: NPM authentication token for publishing packages
  - Get from: https://www.npmjs.com/settings/[username]/tokens
  - Add to: Settings → Secrets and variables → Actions

## Notes

- The workflow commits directly to main branch
- Tests are run by default but can be skipped
- CHANGELOG.md is automatically updated
- Release notes are generated from commit history
- Both GitHub release and NPM package are created