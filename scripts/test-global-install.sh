#!/bin/bash

# Test script to verify global installation works without ENOTEMPTY error

set -e

echo "🧪 Testing global installation fix for roiai..."
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Clean up any previous test installation
echo "🧹 Cleaning up any previous test installation..."
npm uninstall -g roiai 2>/dev/null || true

# Build the project
echo "🔨 Building the project..."
npm run build

# Create a tarball
echo "📦 Creating package tarball..."
npm pack

# Get the tarball name
TARBALL=$(ls roiai-*.tgz | head -1)

echo ""
echo "📋 Package details:"
echo "   - Package: $TARBALL"
echo "   - Size: $(du -h $TARBALL | cut -f1)"
echo ""

# Install globally from the tarball
echo "🚀 Installing globally from tarball..."
echo -e "${YELLOW}ℹ️  Note: You may need to use sudo for global installation${NC}"
echo ""

# Try without sudo first
if npm install -g ./$TARBALL 2>/dev/null; then
    echo -e "${GREEN}✅ Global installation succeeded!${NC}"
else
    # If it fails, suggest sudo
    echo -e "${YELLOW}⚠️  Permission denied. Trying with sudo...${NC}"
    if sudo npm install -g ./$TARBALL; then
        echo -e "${GREEN}✅ Global installation succeeded with sudo!${NC}"
    else
        echo -e "${RED}❌ Global installation failed even with sudo${NC}"
        exit 1
    fi
fi

echo ""
echo "🧪 Testing the installed CLI..."

# Test basic command
if roiai --version; then
    echo -e "${GREEN}✅ CLI version check passed${NC}"
else
    echo -e "${RED}❌ CLI version check failed${NC}"
    exit 1
fi

# Test help command
if roiai --help > /dev/null 2>&1; then
    echo -e "${GREEN}✅ CLI help command passed${NC}"
else
    echo -e "${RED}❌ CLI help command failed${NC}"
    exit 1
fi

# Test cc help command
if roiai cc --help > /dev/null 2>&1; then
    echo -e "${GREEN}✅ CLI cc help command passed${NC}"
else
    echo -e "${RED}❌ CLI cc help command failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 All tests passed! Global installation is working correctly.${NC}"
echo ""
echo "📍 You can now use 'roiai' command globally"
echo "   Try: roiai cc sync"
echo ""

# Clean up tarball
rm -f $TARBALL

# Optional: Uninstall after test
echo -e "${YELLOW}ℹ️  To uninstall the test installation, run: npm uninstall -g roiai${NC}"