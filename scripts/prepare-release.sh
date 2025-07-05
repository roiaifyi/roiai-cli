#!/bin/bash

# prepare-release.sh - Pre-release validation script for roiai-cli

set -e

echo "🚀 Preparing roiai-cli for release..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Check if we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    error "Not on main branch. Current branch: $CURRENT_BRANCH"
fi
success "On main branch"

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    error "Uncommitted changes detected. Please commit or stash changes before release."
fi
success "No uncommitted changes"

# Pull latest changes
echo "Pulling latest changes..."
git pull origin main --quiet
success "Repository up to date"

# Install dependencies
echo "Installing dependencies..."
npm ci --quiet
success "Dependencies installed"

# Generate Prisma client
echo "Generating Prisma client..."
npm run prisma:generate --quiet
success "Prisma client generated"

# Run tests
echo "Running tests..."
if npm run test:quiet; then
    success "All tests passed"
else
    error "Tests failed. Please fix failing tests before release."
fi

# Build the project
echo "Building project..."
if npm run build > /dev/null 2>&1; then
    success "Build successful"
else
    error "Build failed. Please fix build errors before release."
fi

# Check for security vulnerabilities
echo "Checking for security vulnerabilities..."
AUDIT_RESULT=$(npm audit --json 2>/dev/null || echo '{"vulnerabilities":{"total":0}}')
VULNERABILITIES=$(echo "$AUDIT_RESULT" | grep -o '"total":[0-9]*' | grep -o '[0-9]*' || echo "0")

if [ "$VULNERABILITIES" -gt 0 ]; then
    warning "Found $VULNERABILITIES vulnerabilities. Consider running 'npm audit fix' before release."
else
    success "No security vulnerabilities found"
fi

# Verify package.json has required fields
echo "Verifying package.json..."
REQUIRED_FIELDS=("name" "version" "description" "main" "bin" "repository" "author" "license")
PACKAGE_JSON=$(cat package.json)

for field in "${REQUIRED_FIELDS[@]}"; do
    if ! echo "$PACKAGE_JSON" | grep -q "\"$field\""; then
        error "Missing required field in package.json: $field"
    fi
done
success "package.json validation passed"

# Check if version tag already exists
CURRENT_VERSION=$(node -p "require('./package.json').version")
if git tag | grep -q "^v$CURRENT_VERSION$"; then
    warning "Version tag v$CURRENT_VERSION already exists. You may need to bump the version."
else
    success "Version v$CURRENT_VERSION is ready for release"
fi

# Verify CHANGELOG.md exists and has unreleased section
if [ ! -f "CHANGELOG.md" ]; then
    warning "CHANGELOG.md not found. Consider creating one."
else
    if grep -q "## \[Unreleased\]" CHANGELOG.md; then
        success "CHANGELOG.md has unreleased section"
    else
        warning "No [Unreleased] section in CHANGELOG.md"
    fi
fi

# Check npm authentication
echo "Checking NPM authentication..."
if npm whoami > /dev/null 2>&1; then
    NPM_USER=$(npm whoami)
    success "Authenticated to NPM as: $NPM_USER"
else
    warning "Not authenticated to NPM. You'll need to login before publishing."
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Release preparation complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Current version: $CURRENT_VERSION"
echo ""
echo "Next steps:"
echo "1. Update version: npm run version:[patch|minor|major]"
echo "2. Update CHANGELOG.md"
echo "3. Push changes and tag: git push origin main --tags"
echo ""
echo "The GitHub Action will handle the rest! 🎉"