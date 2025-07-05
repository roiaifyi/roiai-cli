# GitHub Workflows Documentation

This document describes the GitHub Actions workflows used in this project.

## Workflows Overview

### 1. CI (`ci.yml`)
- **Trigger**: Push to main/develop branches, Pull requests to main
- **Purpose**: Run tests and ensure code quality
- **Actions**: 
  - Install dependencies
  - Generate Prisma client
  - Build project
  - Run test coverage

### 2. Auto Tag on Push (`auto-tag.yml`)
- **Trigger**: Push to main branch (excluding docs and workflow changes)
- **Purpose**: Automatically create a git tag for the current version in package.json
- **Actions**:
  - Check if a tag already exists for the current version
  - Create a new tag if it doesn't exist
  - Push the tag to the repository

### 3. Bump Version and Tag (`manual-release.yml`)
- **Trigger**: Manual workflow dispatch
- **Purpose**: Bump the version, update CHANGELOG, and create a tag
- **Inputs**:
  - `version_type`: patch, minor, major, or custom
  - `custom_version`: Specific version number (when type is custom)
  - `create_release`: Whether to trigger the release workflow after tagging
- **Actions**:
  - Bump version in package.json
  - Update CHANGELOG.md
  - Commit the changes
  - Create and push a new tag
  - Optionally trigger the release workflow

### 4. Release from Tag (`release-from-tag.yml`)
- **Trigger**: Manual workflow dispatch
- **Purpose**: Create a release from an existing tag
- **Inputs**:
  - `tag`: The tag to release (e.g., v1.0.23)
  - `skip_tests`: Whether to skip running tests
- **Actions**:
  - Checkout code at the specified tag
  - Verify tag exists and version matches
  - Run tests (unless skipped)
  - Build the project
  - Publish to NPM (if not already published)
  - Create GitHub release (if not already created)

## Typical Release Process

### Option 1: Automatic Tagging
1. Make your changes and commit them
2. Update version in package.json locally: `npm version patch`
3. Push to main branch
4. The `auto-tag.yml` workflow will create a tag automatically
5. Go to Actions → "Release from Tag"
6. Run the workflow with the newly created tag

### Option 2: Manual Version Bump
1. Go to Actions → "Bump Version and Tag"
2. Select version type (patch/minor/major)
3. Enable "Create release after tagging" if you want immediate release
4. The workflow will:
   - Bump the version
   - Update CHANGELOG
   - Create a tag
   - Optionally trigger the release

### Option 3: Release Existing Tag
1. Go to Actions → "Release from Tag"
2. Enter the tag name (e.g., v1.0.23)
3. The workflow will publish to NPM and create a GitHub release

## Important Notes

- Tags are created in the format `v{version}` (e.g., `v1.0.23`)
- The release workflow checks if a version is already published to NPM to avoid duplicates
- GitHub releases are only created if they don't already exist
- All workflows use Node.js 20.x for consistency
- NPM publishing requires the `NPM_TOKEN` secret to be configured

## Setting up NPM Token

1. Go to npmjs.com and log in
2. Generate an access token (Automation type recommended)
3. Add it to GitHub repository secrets as `NPM_TOKEN`

## Workflow Permissions

The workflows require the following permissions:
- `contents: write` - For creating tags and releases
- `packages: write` - For publishing packages

These are configured in each workflow file.