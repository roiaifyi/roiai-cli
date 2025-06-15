#!/bin/bash

echo "🧪 Running BDD Tests for ROIAI CLI"
echo "================================="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Ensure we're in the project root
cd "$(dirname "$0")/.."

# Build the project first
echo -e "\n${YELLOW}Building project...${NC}"
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}Build failed!${NC}"
    exit 1
fi

# Run tests
echo -e "\n${YELLOW}Running tests...${NC}"

# Run unit tests
echo -e "\n${YELLOW}Unit Tests:${NC}"
npm test -- --testPathIgnorePatterns=integration

# Run integration tests
echo -e "\n${YELLOW}Integration Tests:${NC}"
npm test -- --testPathIgnorePatterns=unit

# Run all tests with coverage
echo -e "\n${YELLOW}Running all tests with coverage:${NC}"
npm run test:coverage

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}✅ All tests passed!${NC}"
else
    echo -e "\n${RED}❌ Some tests failed!${NC}"
    exit 1
fi