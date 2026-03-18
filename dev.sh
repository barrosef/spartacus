#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# dev.sh — Sobe o ambiente de desenvolvimento local completo
#
# Serviços:
#   1. Firebase Emulators (Firestore, Auth, Storage) via docker-compose
#   2. Backend FastAPI (uvicorn com hot-reload)
#   3. App mobile Expo (Metro bundler)
#
# Uso:
#   ./dev.sh           # sobe tudo
#   ./dev.sh stop      # para tudo
#   ./dev.sh status    # mostra status dos serviços
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/repos/backend"
APP_DIR="$ROOT_DIR/repos/app"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
GOLD='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

LOCAL_IP=$(hostname -I | awk '{print $1}')

# ─── Funções ──────────────────────────────────────────────────────────────────

print_header() {
  echo ""
  echo -e "${GOLD}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${GOLD}  SPARTACUS — Ambiente de Desenvolvimento Local${NC}"
  echo -e "${GOLD}═══════════════════════════════════════════════════════════${NC}"
  echo ""
}

check_deps() {
  local missing=()
  command -v docker &>/dev/null || missing+=("docker")
  command -v uv &>/dev/null || missing+=("uv")
  command -v npx &>/dev/null || missing+=("npx (node/npm)")

  if [ ${#missing[@]} -gt 0 ]; then
    echo -e "${RED}Dependências faltando: ${missing[*]}${NC}"
    exit 1
  fi
}

check_env_files() {
  if [ ! -f "$BACKEND_DIR/.env" ]; then
    echo -e "${GOLD}Criando $BACKEND_DIR/.env a partir de .env.example...${NC}"
    cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  fi

  if [ ! -f "$APP_DIR/.env" ]; then
    echo -e "${RED}Arquivo $APP_DIR/.env não encontrado.${NC}"
    echo -e "${RED}Crie-o com as variáveis Firebase e EXPO_PUBLIC_API_URL=http://$LOCAL_IP:8000${NC}"
    exit 1
  fi
}

ensure_app_api_url() {
  local env_file="$APP_DIR/.env"
  local current_url
  current_url=$(grep "^EXPO_PUBLIC_API_URL=" "$env_file" | tail -1 | cut -d= -f2-)

  if echo "$current_url" | grep -q "run\.app"; then
    echo -e "${GOLD}App .env aponta para Cloud Run. Trocando para local ($LOCAL_IP:8000)...${NC}"
    sed -i "s|^EXPO_PUBLIC_API_URL=.*|EXPO_PUBLIC_API_URL=http://$LOCAL_IP:8000|" "$env_file"
  fi

  echo -e "${CYAN}  App API URL: http://$LOCAL_IP:8000${NC}"
}

start_emulators() {
  echo -e "${CYAN}[1/3] Firebase Emulators...${NC}"
  cd "$BACKEND_DIR"
  docker compose up -d 2>&1 | tail -3
  echo -e "${GREEN}  Emulators: http://localhost:4000${NC}"
  echo -e "  Firestore :8080 | Auth :9099 | Storage :9199"
}

wait_for_emulators() {
  echo -n "  Aguardando emulators"
  local retries=30
  while ! curl -sf http://localhost:4000 &>/dev/null; do
    retries=$((retries - 1))
    if [ $retries -le 0 ]; then
      echo -e "\n${RED}  Timeout aguardando emulators.${NC}"
      echo "  Verifique com: docker compose -f $BACKEND_DIR/docker-compose.yml logs"
      exit 1
    fi
    echo -n "."
    sleep 2
  done
  echo -e " ${GREEN}OK${NC}"
}

start_backend() {
  echo -e "${CYAN}[2/3] Backend FastAPI...${NC}"
  cd "$BACKEND_DIR"

  # Mata processo anterior se existir
  if [ -f /tmp/spartacus-backend.pid ]; then
    kill "$(cat /tmp/spartacus-backend.pid)" 2>/dev/null || true
    rm -f /tmp/spartacus-backend.pid
  fi

  uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 \
    > /tmp/spartacus-backend.log 2>&1 &
  echo $! > /tmp/spartacus-backend.pid
  echo -e "${GREEN}  Backend: http://$LOCAL_IP:8000${NC}"
  echo "  Logs: tail -f /tmp/spartacus-backend.log"
}

start_app() {
  echo -e "${CYAN}[3/3] App Expo...${NC}"
  cd "$APP_DIR"

  # Mata processo anterior se existir
  if [ -f /tmp/spartacus-app.pid ]; then
    kill "$(cat /tmp/spartacus-app.pid)" 2>/dev/null || true
    rm -f /tmp/spartacus-app.pid
  fi

  npx expo start --lan \
    > /tmp/spartacus-app.log 2>&1 &
  echo $! > /tmp/spartacus-app.pid
  echo -e "${GREEN}  Expo: http://$LOCAL_IP:8081${NC}"
  echo "  Logs: tail -f /tmp/spartacus-app.log"
}

stop_all() {
  echo -e "${GOLD}Parando todos os serviços...${NC}"

  if [ -f /tmp/spartacus-app.pid ]; then
    kill "$(cat /tmp/spartacus-app.pid)" 2>/dev/null || true
    rm -f /tmp/spartacus-app.pid
    echo -e "  ${RED}App Expo parado${NC}"
  fi

  if [ -f /tmp/spartacus-backend.pid ]; then
    kill "$(cat /tmp/spartacus-backend.pid)" 2>/dev/null || true
    rm -f /tmp/spartacus-backend.pid
    echo -e "  ${RED}Backend parado${NC}"
  fi

  cd "$BACKEND_DIR"
  docker compose down 2>/dev/null
  echo -e "  ${RED}Emulators parados${NC}"

  echo -e "\n${GREEN}Tudo parado.${NC}"
}

show_status() {
  echo -e "${GOLD}Status dos serviços:${NC}"
  echo ""

  # Emulators
  if curl -sf http://localhost:4000 &>/dev/null; then
    echo -e "  ${GREEN}●${NC} Emulators     http://localhost:4000"
  else
    echo -e "  ${RED}●${NC} Emulators     (parado)"
  fi

  # Backend
  if [ -f /tmp/spartacus-backend.pid ] && kill -0 "$(cat /tmp/spartacus-backend.pid)" 2>/dev/null; then
    echo -e "  ${GREEN}●${NC} Backend       http://$LOCAL_IP:8000"
  else
    echo -e "  ${RED}●${NC} Backend       (parado)"
  fi

  # App
  if [ -f /tmp/spartacus-app.pid ] && kill -0 "$(cat /tmp/spartacus-app.pid)" 2>/dev/null; then
    echo -e "  ${GREEN}●${NC} App Expo      http://$LOCAL_IP:8081"
  else
    echo -e "  ${RED}●${NC} App Expo      (parado)"
  fi

  echo ""
}

print_summary() {
  echo ""
  echo -e "${GOLD}═══════════════════════════════════════════════════════════${NC}"
  echo -e "  ${GREEN}Ambiente local pronto!${NC}"
  echo -e "${GOLD}═══════════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  ${CYAN}Emulators UI${NC}  http://localhost:4000"
  echo -e "  ${CYAN}Backend API${NC}   http://$LOCAL_IP:8000"
  echo -e "  ${CYAN}Backend docs${NC}  http://$LOCAL_IP:8000/docs"
  echo -e "  ${CYAN}App Expo${NC}      http://$LOCAL_IP:8081"
  echo ""
  echo -e "  ${GOLD}Comandos:${NC}"
  echo "    ./dev.sh status   — ver status dos serviços"
  echo "    ./dev.sh stop     — parar tudo"
  echo "    tail -f /tmp/spartacus-backend.log  — logs do backend"
  echo "    tail -f /tmp/spartacus-app.log      — logs do Expo"
  echo ""
}

# ─── Main ─────────────────────────────────────────────────────────────────────

case "${1:-start}" in
  stop)
    stop_all
    ;;
  status)
    show_status
    ;;
  start|"")
    print_header
    check_deps
    check_env_files
    ensure_app_api_url
    echo ""
    start_emulators
    wait_for_emulators
    start_backend
    sleep 2
    start_app
    print_summary
    ;;
  *)
    echo "Uso: ./dev.sh [start|stop|status]"
    exit 1
    ;;
esac
