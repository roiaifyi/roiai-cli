#!/bin/bash

# Test script for production server
echo "🚀 Testing with production server: api.roiai.fyi"
echo ""

# Build first
echo "📦 Building project..."
npm run build

echo ""
echo "🔐 Testing login..."
node dist/index.js cc --api-url https://api.roiai.fyi login

echo ""
echo "📊 Checking push status..."
node dist/index.js cc --api-url https://api.roiai.fyi push-status

echo ""
echo "🔄 Testing sync..."
node dist/index.js cc sync

echo ""
echo "📤 Testing push (dry run)..."
node dist/index.js cc --api-url https://api.roiai.fyi push --dry-run

echo ""
echo "✅ Production server test complete!"