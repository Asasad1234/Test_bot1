#!/bin/bash
set -e

echo "=========================================================="
echo "🚀 Запуск Пульс Доступа в Docker контейнере"
echo "🕒 Текущее системное время: $(date)"
echo "⚙️  Порт: ${PORT:-3000}"
echo "⏱  Интервал автоперезапуска: ${AUTO_RESTART_HOURS:-24} ч. (0 = только при сбоях)"
echo "=========================================================="

# 1. Ensure the persistent data store exists
STORE_FILE="${DATA_STORE_PATH:-/app/data-store.json}"
mkdir -p "$(dirname "$STORE_FILE")"
if [ ! -f "$STORE_FILE" ]; then
  if [ -f /app/data-store.json.initial ]; then
    echo "📁 Инициализация базы данных: копирование начального состояния в $STORE_FILE"
    cp /app/data-store.json.initial "$STORE_FILE"
  else
    echo "{}" > "$STORE_FILE"
  fi
fi

# 2. Configurable Auto-restart logic
RESTART_HOURS="${AUTO_RESTART_HOURS:-24}"

# Check if runtime config specifies a custom autoRestartHours
if [ -f /app/docker-runtime-config.json ]; then
  RUNTIME_HOURS=$(grep -o '"autoRestartHours":[0-9]*' /app/docker-runtime-config.json | cut -d: -f2)
  if [ -n "$RUNTIME_HOURS" ]; then
    RESTART_HOURS="$RUNTIME_HOURS"
  fi
fi

if [ "$RESTART_HOURS" -gt 0 ] 2>/dev/null; then
  RESTART_SECONDS=$((RESTART_HOURS * 3600))
  echo "🛡 Включен периодический супервизор автоперезапуска: каждые $RESTART_HOURS ч. ($RESTART_SECONDS сек.)"

  while true; do
    # Re-check runtime config on each iteration in case user updated hours in the UI
    if [ -f /app/docker-runtime-config.json ]; then
      RUNTIME_HOURS=$(grep -o '"autoRestartHours":[0-9]*' /app/docker-runtime-config.json | cut -d: -f2)
      if [ -n "$RUNTIME_HOURS" ] && [ "$RUNTIME_HOURS" -gt 0 ] 2>/dev/null; then
        RESTART_HOURS="$RUNTIME_HOURS"
        RESTART_SECONDS=$((RESTART_HOURS * 3600))
      fi
    fi

    echo "▶️ [Супервизор] Запуск сервера (node dist/server.cjs) [Интервал перезапуска: ${RESTART_HOURS} ч.]..."
    node dist/server.cjs &
    SERVER_PID=$!

    # Trap container signals to forward to Node process
    trap "kill -TERM $SERVER_PID 2>/dev/null || true; exit 0" SIGINT SIGTERM

    # Wait for either process death or auto-restart timeout
    ELAPSED=0
    CHECK_INTERVAL=10
    while kill -0 $SERVER_PID 2>/dev/null; do
      sleep $CHECK_INTERVAL
      ELAPSED=$((ELAPSED + CHECK_INTERVAL))
      if [ "$ELAPSED" -ge "$RESTART_SECONDS" ]; then
        echo "⏰ [Супервизор] Достигнут плановый интервал автоперезапуска ($RESTART_HOURS ч.). Перезапуск сервиса..."
        kill -TERM $SERVER_PID 2>/dev/null || true
        wait $SERVER_PID 2>/dev/null || true
        break
      fi
    done

    echo "🔄 [Супервизор] Сервер остановлен. Перезапуск через 2 секунды..."
    sleep 2
  done
else
  echo "⚡ Запуск сервера в стандартном непрерывном режиме (перезапуск только при сбоях контейнера)"
  exec node dist/server.cjs
fi
