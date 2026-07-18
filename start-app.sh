#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-8080}"
HOST="127.0.0.1"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_LOG="$(mktemp -t pulse-market-server.XXXX.log)"

cd "$APP_DIR"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required."
  exit 1
fi

cleanup() {
  if [[ -n "${NGROK_PID:-}" ]] && kill -0 "$NGROK_PID" 2>/dev/null; then
    kill "$NGROK_PID" 2>/dev/null || true
  fi
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

python3 market_server.py --host "$HOST" --port "$PORT" >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

for _ in {1..40}; do
  if curl -fsS "http://$HOST:$PORT/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

if ! curl -fsS "http://$HOST:$PORT/api/health" >/dev/null 2>&1; then
  echo "Server failed to start. Log: $SERVER_LOG"
  exit 1
fi

echo "Pulse 市場決策台已啟動"
echo "Local URL : http://$HOST:$PORT"

if command -v ngrok >/dev/null 2>&1; then
  NGROK_LOG="$(mktemp -t pulse-market-ngrok.XXXX.log)"
  ngrok http "$PORT" --log=stdout >"$NGROK_LOG" 2>&1 &
  NGROK_PID=$!
  echo "Public URL: ngrok 正在建立，可至 http://127.0.0.1:4040 查看"
else
  echo "Public URL: 未啟用（本機使用不需要 ngrok）"
fi

echo "按 Ctrl+C 停止服務"
wait "$SERVER_PID"
