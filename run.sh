#!/usr/bin/env bash
set -e

echo "=== RAVENS — River AI Vision for Environmental Surveillance ==="

# Start FastAPI backend
echo "[*] Starting FastAPI backend on :8000 ..."
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Start React frontend
echo "[*] Starting React frontend on :3000 ..."
cd frontend && npm start &
FRONTEND_PID=$!

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT

wait
