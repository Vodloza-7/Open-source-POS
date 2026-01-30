#!/bin/bash

echo "🔄 Stopping existing processes..."
pkill -f "php -S" || true
sleep 2

echo "✅ Starting PHP Development Server..."
cd /workspaces/Open-source-POS

# Start PHP built-in server
php -S localhost:8000 -t public/ > server.log 2>&1 &
SERVER_PID=$!

echo "⏳ Waiting for server to start..."
sleep 3

# Check if server is running
if kill -0 $SERVER_PID 2>/dev/null; then
    echo "✅ Server started successfully on http://localhost:8000"
    echo "🌐 Opening in browser..."
    "$BROWSER" http://localhost:8000 || echo "Please open http://localhost:8000 in your browser"
else
    echo "❌ Failed to start server"
    cat server.log
    exit 1
fi

echo "📊 Server is running. Press Ctrl+C to stop."
wait $SERVER_PID
