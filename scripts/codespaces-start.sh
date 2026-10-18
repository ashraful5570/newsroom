#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ "${CODESPACES:-}" != "true" ]; then
  echo "Automatic browser startup is for GitHub Codespaces. Elsewhere run npm run dev and npm run worker in separate terminals."
  exit 0
fi

# Preserve existing configuration. The example explicitly selects a private sandbox.
if [ ! -e .env ] && [ ! -e .env.local ]; then
  cp .env.example .env.local
fi
if [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
  export APP_URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
fi
mkdir -p .data

start_service() {
  local service_name="$1"
  local service_script="$2"
  local service_pid_file=".data/codespaces-${service_name}.pid"
  if [ -f "$service_pid_file" ]; then
    local service_pid
    service_pid="$(cat "$service_pid_file")"
    if [[ "$service_pid" =~ ^[0-9]+$ ]] && kill -0 "$service_pid" 2>/dev/null; then
      local service_args
      service_args="$(ps -p "$service_pid" -o args= || true)"
      if [[ "$service_args" == *"npm run ${service_script}"* ]]; then
        echo "${service_name} is already running."
        return
      fi
    fi
  fi
  nohup npm run "$service_script" > ".data/codespaces-${service_name}.log" 2>&1 < /dev/null &
  echo "$!" > "$service_pid_file"
}

start_service web dev
start_service worker worker

echo "Newsroom web and worker startup requested. Keep forwarded port 3000 PRIVATE."
echo "Open the Ports tab and choose Open in Browser for Newsroom after startup completes."
echo "Logs: .data/codespaces-web.log and .data/codespaces-worker.log"
echo "This is a sandbox for testing. Live APIs require credentials; automated social publishing is not implemented."
