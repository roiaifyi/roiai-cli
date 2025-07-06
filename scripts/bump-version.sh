#!/bin/bash

# bump-version.sh - Version bumping script for roiai-cli

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print success
success() {
    echo -e "${GREEN}✓${NC} $1"
}

# Function to print error
error() {
    echo -e "${RED}✗${NC} $1"
    exit 1
}

# Function to print warning
warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Function to print info
info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Function to show usage
usage() {
    echo "Usage: $0 [patch|minor|major|prepatch|preminor|premajor|prerelease]"
    echo ""
    echo "Version bump types:"
    echo "  patch      - Bug fixes (1.0.0 → 1.0.1)"
    echo "  minor      - New features (1.0.0 → 1.1.0)"
    echo "  major      - Breaking changes (1.0.0 → 2.0.0)"
    echo "  prepatch   - Pre-release patch (1.0.0 → 1.0.1-0)"
    echo "  preminor   - Pre-release minor (1.0.0 → 1.1.0-0)"
    echo "  premajor   - Pre-release major (1.0.0 → 2.0.0-0)"
    echo "  prerelease - Increment pre-release (1.0.0-0 → 1.0.0-1)"
    echo ""
    echo "Options:"
    echo "  --dry-run  - Show what would happen without making changes"
    echo "  --no-git   - Don't create git commit and tag"
    echo "  --push     - Automatically push changes and tags"
    exit 1
}

# Parse arguments
VERSION_TYPE=""
DRY_RUN=false
NO_GIT=false
AUTO_PUSH=false

while [[ $# -gt 0 ]]; do
    case $1 in
        patch|minor|major|prepatch|preminor|premajor|prerelease)
            VERSION_TYPE="$1"
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --no-git)
            NO_GIT=true
            shift
            ;;
        --push)
            AUTO_PUSH=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            error "Unknown option: $1"
            ;;
    esac
done

# Check if version type is provided
if [ -z "$VERSION_TYPE" ]; then
    usage
fi

echo "🚀 Bumping version for roiai-cli..."
echo ""

# Check if we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ] && [ "$NO_GIT" = false ]; then
    error "Not on main branch. Current branch: $CURRENT_BRANCH"
fi

# Check for uncommitted changes (excluding dist folder)
if [ "$NO_GIT" = false ]; then
    # Check if there are any changes outside of dist/
    CHANGES=$(git status --porcelain | grep -v "^.. dist/" | grep -v "^?? dist/")
    if [ -n "$CHANGES" ]; then
        warning "Uncommitted changes detected (excluding dist/):"
        echo "$CHANGES"
        echo ""
        
        # Ask user what to do
        echo "Options:"
        echo "1. Continue anyway (dist/ will be ignored)"
        echo "2. Cancel and commit changes first"
        echo ""
        read -p "Your choice (1/2): " choice
        
        case $choice in
            1)
                info "Continuing with version bump..."
                # Add dist to .gitignore temporarily if needed
                ;;
            2)
                error "Version bump cancelled. Please commit your changes first."
                ;;
            *)
                error "Invalid choice. Version bump cancelled."
                ;;
        esac
    fi
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
info "Current version: $CURRENT_VERSION"

# Calculate new version
if [ "$DRY_RUN" = true ]; then
    NEW_VERSION=$(npm version "$VERSION_TYPE" --no-git-tag-version --dry-run 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+(-[0-9]+)?')
    info "New version would be: $NEW_VERSION"
    echo ""
    echo "This is a dry run. No changes were made."
    exit 0
fi

# Run pre-release checks
echo ""
echo "Running pre-release checks..."

# Run tests
echo "Running tests..."
if npm run test:quiet > /dev/null 2>&1; then
    success "All tests passed"
else
    error "Tests failed. Please fix failing tests before bumping version."
fi

# Build the project
echo "Building project..."
if npm run build > /dev/null 2>&1; then
    success "Build successful"
else
    error "Build failed. Please fix build errors before bumping version."
fi

# Generate Prisma client
echo "Generating Prisma client..."
if npm run prisma:generate > /dev/null 2>&1; then
    success "Prisma client generated"
else
    warning "Failed to generate Prisma client"
fi

# Bump version
echo ""
echo "Bumping version..."

if [ "$NO_GIT" = true ]; then
    # Bump version without git commit/tag
    NEW_VERSION=$(npm version "$VERSION_TYPE" --no-git-tag-version)
    success "Version bumped to $NEW_VERSION (no git commit)"
else
    # Bump version with git commit and tag
    NEW_VERSION=$(npm version "$VERSION_TYPE" -m "chore: release %s")
    success "Version bumped to $NEW_VERSION"
    success "Git commit and tag created"
fi

# Update CHANGELOG.md if it exists
if [ -f "CHANGELOG.md" ] && [ "$NO_GIT" = false ]; then
    echo ""
    warning "Remember to update CHANGELOG.md with the changes for $NEW_VERSION"
fi

# Generate release notes if script exists
if [ -f "scripts/release-notes.js" ]; then
    echo ""
    echo "Generating release notes..."
    if npm run generate-release-notes > /dev/null 2>&1; then
        success "Release notes generated"
    else
        warning "Failed to generate release notes"
    fi
fi

# Push changes if requested
if [ "$AUTO_PUSH" = true ] && [ "$NO_GIT" = false ]; then
    echo ""
    echo "Pushing changes to remote..."
    git push origin main
    git push origin "v${NEW_VERSION}"
    success "Changes and tag pushed to remote"
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Version bump complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Version changed: $CURRENT_VERSION → $NEW_VERSION"
echo ""

if [ "$NO_GIT" = false ] && [ "$AUTO_PUSH" = false ]; then
    echo "Next steps:"
    echo "1. Update CHANGELOG.md if needed"
    echo "2. Push changes: git push origin main --tags"
    echo "3. The GitHub Action will handle the release"
elif [ "$NO_GIT" = true ]; then
    echo "Next steps:"
    echo "1. Review the version change in package.json"
    echo "2. Commit when ready: git add package.json && git commit -m \"chore: release $NEW_VERSION\""
    echo "3. Create tag: git tag -a \"v$NEW_VERSION\" -m \"Release $NEW_VERSION\""
    echo "4. Push changes: git push origin main --tags"
fi

echo ""
echo "🎉 Happy releasing!"