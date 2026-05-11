#!/bin/bash

# Discovery Intelligence Engine - Startup Script
# Run this from the web-discovery-agent/ directory

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "🚀 Discovery Intelligence Engine"
echo "================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Please install Node.js 18+"
  exit 1
fi

NODE_VER=$(node -e "console.log(parseInt(process.version.slice(1)))")
if [ "$NODE_VER" -lt 18 ]; then
  echo "❌ Node.js 18+ required. Current: $(node --version)"
  exit 1
fi

echo "✅ Node.js $(node --version)"

# Install deps if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Setup DB if needed
if [ ! -f "data/discovery.db" ]; then
  echo "🗄️  Setting up database..."
  mkdir -p data
  npm run db:push
  npm run db:seed
fi

echo ""
echo "Starting servers..."
echo "  API  → http://localhost:3001"
echo "  Web  → http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Start both servers
npm run dev
