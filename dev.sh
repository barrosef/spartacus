#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# dev.sh — Ambiente de desenvolvimento local do Spartacus
#
# Uso:
#   ./dev.sh [serviço] <ação>
#
# Serviços:
#   emulator   Firebase Emulators (Firestore, Auth, Storage)
#   backend    FastAPI (uvicorn com hot-reload)
#   app        Expo (Metro bundler)
#   webapp     Expo Web dev server (app.spartacus.app.br local)
#   backoffice Vite dev server (React)
#   (nenhum)   Todos os serviços
#
# Ações:
#   start      Inicia o(s) serviço(s)  [padrão]
#   stop       Para o(s) serviço(s)
#   status     Mostra estado do(s) serviço(s)
#   logs       Mostra logs em tempo real (backend, app)
#   build      Gera pacote Android (app only): apk ou aab
#   deploy     Build APK + instala no Android via USB (app only)
#   devlog     Mostra logs do app Android no console (app only)
#   publish    Build AAB + publica na Play Store internal track (app only)
#   web        Build PWA + deploy no Firebase Hosting (app only)
#
# Exemplos:
#   ./dev.sh                  # sobe tudo
#   ./dev.sh backend start    # sobe só o backend
#   ./dev.sh app stop         # para só o app
#   ./dev.sh status           # status de todos
#   ./dev.sh backend logs     # logs do backend em tempo real
#   ./dev.sh app start --android  # sobe app no Android Studio
#   ./dev.sh app build apk    # gera APK local (profile: preview)
#   ./dev.sh app build aab    # gera AAB local (profile: production)
#   ./dev.sh app deploy       # build + instala APK no celular via USB
#   ./dev.sh app devlog       # logs JS do app no celular em tempo real
#   ./dev.sh app publish      # build AAB + publica na Play Store (internal)
#   ./dev.sh webapp start     # sobe app web local (Expo Web → localhost:8081)
#   ./dev.sh webapp stop      # para app web local
#   ./dev.sh backoffice       # sobe backoffice dev server
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/repos/backend"
APP_DIR="$ROOT_DIR/repos/app"
BACKOFFICE_DIR="$ROOT_DIR/repos/backoffice"

RED='\033[0;31m'
GREEN='\033[0;32m'
GOLD='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

LOCAL_IP=$(hostname -I | awk '{print $1}')

# ─── Checks ──────────────────────────────────────────────────────────────────

is_emulator_running() {
  curl -sf http://localhost:4000 &>/dev/null
}

is_backend_running() {
  [ -f /tmp/spartacus-backend.pid ] && kill -0 "$(cat /tmp/spartacus-backend.pid)" 2>/dev/null
}

is_app_running() {
  [ -f /tmp/spartacus-app.pid ] && kill -0 "$(cat /tmp/spartacus-app.pid)" 2>/dev/null
}

check_deps() {
  local missing=()
  command -v docker &>/dev/null || missing+=("docker")
  command -v uv &>/dev/null || missing+=("uv")
  command -v npx &>/dev/null || missing+=("npx (node/npm)")
  if [ ${#missing[@]} -gt 0 ]; then
    echo -e "${RED}Dependencias faltando: ${missing[*]}${NC}"
    exit 1
  fi
}

check_env_files() {
  if [ ! -f "$BACKEND_DIR/.env" ]; then
    echo -e "${GOLD}Criando $BACKEND_DIR/.env a partir de .env.example...${NC}"
    cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  fi
  if [ ! -f "$APP_DIR/.env" ]; then
    echo -e "${RED}Arquivo $APP_DIR/.env nao encontrado.${NC}"
    echo -e "${RED}Crie-o com as variaveis Firebase e EXPO_PUBLIC_API_URL=http://$LOCAL_IP:8000${NC}"
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
}

# ─── Emulator ─────────────────────────────────────────────────────────────────

emulator_start() {
  if is_emulator_running; then
    echo -e "  ${GREEN}●${NC} Emulators ja esta rodando — http://localhost:4000"
    return
  fi
  echo -e "${CYAN}Firebase Emulators...${NC}"
  cd "$BACKEND_DIR"
  docker compose up -d 2>&1 | tail -3
  echo -n "  Aguardando"
  local retries=30
  while ! is_emulator_running; do
    retries=$((retries - 1))
    if [ $retries -le 0 ]; then
      echo -e "\n${RED}  Timeout aguardando emulators.${NC}"
      exit 1
    fi
    echo -n "."
    sleep 2
  done
  echo -e " ${GREEN}OK${NC}"
  echo -e "  ${GREEN}●${NC} Emulators     http://localhost:4000"
  echo -e "    Firestore :8080 | Auth :9099 | Storage :9199"
}

emulator_stop() {
  cd "$BACKEND_DIR"
  docker compose down 2>/dev/null
  echo -e "  ${RED}●${NC} Emulators parado"
}

emulator_status() {
  if is_emulator_running; then
    echo -e "  ${GREEN}●${NC} Emulators     http://localhost:4000"
  else
    echo -e "  ${RED}●${NC} Emulators     (parado)"
  fi
}

# ─── Backend ──────────────────────────────────────────────────────────────────

backend_start() {
  if is_backend_running; then
    echo -e "  ${GREEN}●${NC} Backend ja esta rodando — http://$LOCAL_IP:8000"
    return
  fi
  echo -e "${CYAN}Backend FastAPI...${NC}"
  cd "$BACKEND_DIR"
  uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 \
    > /tmp/spartacus-backend.log 2>&1 &
  echo $! > /tmp/spartacus-backend.pid
  echo -e "  ${GREEN}●${NC} Backend       http://$LOCAL_IP:8000"
  echo -e "    Docs: http://$LOCAL_IP:8000/docs"
  echo -e "    Logs: ./dev.sh backend logs"
}

backend_stop() {
  if [ -f /tmp/spartacus-backend.pid ]; then
    kill "$(cat /tmp/spartacus-backend.pid)" 2>/dev/null || true
    rm -f /tmp/spartacus-backend.pid
  fi
  echo -e "  ${RED}●${NC} Backend parado"
}

backend_status() {
  if is_backend_running; then
    echo -e "  ${GREEN}●${NC} Backend       http://$LOCAL_IP:8000"
  else
    echo -e "  ${RED}●${NC} Backend       (parado)"
  fi
}

backend_logs() {
  if [ ! -f /tmp/spartacus-backend.log ]; then
    echo -e "${RED}Sem arquivo de log. Backend foi iniciado?${NC}"
    exit 1
  fi
  tail -f /tmp/spartacus-backend.log
}

# ─── App ──────────────────────────────────────────────────────────────────────

app_start() {
  if is_app_running; then
    echo -e "  ${GREEN}●${NC} App Expo ja esta rodando — http://$LOCAL_IP:8081"
    return
  fi

  check_env_files
  ensure_app_api_url

  echo -e "${CYAN}App Expo...${NC}"
  cd "$APP_DIR"

  # Detecta flag --android
  local expo_args="--lan"
  if [[ " $* " == *" --android "* ]] || [[ " $* " == *" --android" ]]; then
    expo_args="--lan --android"
    echo -e "  ${GOLD}Modo Android Studio ativado${NC}"
  fi

  npx expo start $expo_args \
    > /tmp/spartacus-app.log 2>&1 &
  echo $! > /tmp/spartacus-app.pid
  echo -e "  ${GREEN}●${NC} App Expo      http://$LOCAL_IP:8081"
  echo -e "    Logs: ./dev.sh app logs"
}

app_stop() {
  if [ -f /tmp/spartacus-app.pid ]; then
    kill "$(cat /tmp/spartacus-app.pid)" 2>/dev/null || true
    rm -f /tmp/spartacus-app.pid
  fi
  echo -e "  ${RED}●${NC} App Expo parado"
}

app_status() {
  if is_app_running; then
    echo -e "  ${GREEN}●${NC} App Expo      http://$LOCAL_IP:8081"
  else
    echo -e "  ${RED}●${NC} App Expo      (parado)"
  fi
}

app_build() {
  local format="${1:-}"
  if [[ "$format" != "apk" && "$format" != "aab" ]]; then
    echo -e "${RED}Formato invalido: $format${NC}"
    echo "Uso: ./dev.sh app build {apk | aab}"
    exit 1
  fi

  local profile="preview"
  if [ "$format" = "aab" ]; then
    profile="production"

    # Auto-increment versionCode in app.json
    local app_json="$APP_DIR/app.json"
    local current_version
    current_version=$(grep -o '"versionCode": *[0-9]*' "$app_json" | grep -o '[0-9]*')
    local new_version=$((current_version + 1))
    sed -i "s/\"versionCode\": *$current_version/\"versionCode\": $new_version/" "$app_json"
    echo -e "${GOLD}versionCode: $current_version → $new_version${NC}"
  fi

  echo -e "${CYAN}Build Android ($format) — profile: $profile${NC}"
  cd "$APP_DIR"
  npx eas-cli build --platform android --profile "$profile" --local
}

app_publish() {
  echo -e "${GOLD}=======================================================${NC}"
  echo -e "${GOLD}  Build AAB + Publish to Play Store (internal track)${NC}"
  echo -e "${GOLD}=======================================================${NC}"
  echo ""

  # Increment versionCode
  local app_json="$APP_DIR/app.json"
  local current_version
  current_version=$(grep -o '"versionCode": *[0-9]*' "$app_json" | grep -o '[0-9]*')
  local new_version=$((current_version + 1))
  sed -i "s/\"versionCode\": *$current_version/\"versionCode\": $new_version/" "$app_json"
  echo -e "${GOLD}versionCode: $current_version → $new_version${NC}"

  # Build AAB
  echo -e "${CYAN}Building AAB (production)...${NC}"
  cd "$APP_DIR"
  npx eas-cli build --platform android --profile production --local

  # Find the AAB just built
  local aab
  aab=$(ls -t "$APP_DIR"/build-*.aab 2>/dev/null | head -1)
  if [ -z "$aab" ]; then
    echo -e "${RED}Nenhum AAB encontrado apos o build.${NC}"
    exit 1
  fi

  # Submit to Play Store
  echo -e "${CYAN}Submitting $aab to Play Store (internal track)...${NC}"
  npx eas-cli submit --platform android --profile production --path "$aab" --non-interactive

  echo ""
  echo -e "${GREEN}Publicado com sucesso na track interna do Play Store.${NC}"
  echo -e "  versionCode: $new_version"
  echo -e "  Acesse: https://play.google.com/console"
}

_adb_check() {
  if ! command -v adb &>/dev/null; then
    echo -e "${RED}adb nao encontrado. Instale o Android SDK Platform-Tools.${NC}"
    exit 1
  fi
  if ! adb devices 2>/dev/null | grep -q "device$"; then
    echo -e "${RED}Nenhum dispositivo Android conectado. Verifique USB e depuracao USB.${NC}"
    exit 1
  fi
}

_adb_install_apk() {
  local apk="$1"
  echo -e "${CYAN}Desinstalando versao anterior...${NC}"
  adb uninstall br.com.spartacus.app 2>/dev/null || true

  echo -e "${CYAN}Instalando $apk no dispositivo...${NC}"
  adb install "$apk"
  echo -e "${GREEN}APK instalado com sucesso.${NC}"

  echo -e "${CYAN}Abrindo app...${NC}"
  adb shell am start -n br.com.spartacus.app/.MainActivity
  echo -e "${GREEN}App iniciado no dispositivo.${NC}"
}

app_deploy() {
  _adb_check

  echo -e "${CYAN}Build APK (preview)...${NC}"
  cd "$APP_DIR"
  npx eas-cli build --platform android --profile preview --local

  local apk
  apk=$(ls -t "$APP_DIR"/build-*.apk 2>/dev/null | head -1)
  if [ -z "$apk" ]; then
    echo -e "${RED}Nenhum APK encontrado apos o build.${NC}"
    exit 1
  fi

  _adb_install_apk "$apk"
}

app_install() {
  _adb_check

  local apk
  apk=$(ls -t "$APP_DIR"/build-*.apk 2>/dev/null | head -1)
  if [ -z "$apk" ]; then
    echo -e "${RED}Nenhum APK encontrado. Rode './dev.sh app build apk' primeiro.${NC}"
    exit 1
  fi

  _adb_install_apk "$apk"
}

app_devlog() {
  if ! command -v adb &>/dev/null; then
    echo -e "${RED}adb nao encontrado. Instale o Android SDK Platform-Tools.${NC}"
    exit 1
  fi
  if ! adb devices 2>/dev/null | grep -q "device$"; then
    echo -e "${RED}Nenhum dispositivo Android conectado.${NC}"
    exit 1
  fi
  echo -e "${CYAN}Logs do Spartacus no dispositivo (Ctrl+C para sair)...${NC}"
  adb logcat -c
  adb logcat -s "ReactNativeJS:*" "AndroidRuntime:*"
}

app_logs() {
  if [ ! -f /tmp/spartacus-app.log ]; then
    echo -e "${RED}Sem arquivo de log. App foi iniciado?${NC}"
    exit 1
  fi
  tail -f /tmp/spartacus-app.log
}

app_web() {
  echo -e "${CYAN}Build PWA (Expo Web)...${NC}"
  cd "$APP_DIR"

  # Ensure API URL points to production
  local env_file="$APP_DIR/.env"
  local api_url
  api_url=$(grep "^EXPO_PUBLIC_API_URL=" "$env_file" | tail -1 | cut -d= -f2-)
  if echo "$api_url" | grep -q "localhost\|192\.168"; then
    echo -e "${GOLD}ATENÇÃO: EXPO_PUBLIC_API_URL aponta para ambiente local.${NC}"
    echo -e "${GOLD}Para produção, ajuste para a URL do Cloud Run antes do build.${NC}"
    read -r -p "Continuar mesmo assim? [y/N] " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
      echo -e "${RED}Build cancelado.${NC}"
      return
    fi
  fi

  echo -e "  Executando: npx expo export --platform web"
  npx expo export --platform web
  echo -e "  ${GREEN}Build concluído → dist/${NC}"
  echo ""

  echo -e "${CYAN}Deploy para Firebase Hosting (app PWA)...${NC}"
  echo -e "  Site: spartacus-artes-marciais-app"
  echo -e "  URL:  https://spartacus-artes-marciais-app.web.app"
  echo ""
  firebase deploy --only hosting:app --project spartacus-artes-marciais
  echo ""
  echo -e "${GREEN}PWA publicado com sucesso!${NC}"
  echo -e "  https://spartacus-artes-marciais-app.web.app"
}

# ─── Webapp (Expo Web — app.spartacus.app.br local) ──────────────────────────

is_webapp_running() {
  [ -f /tmp/spartacus-webapp.pid ] && kill -0 "$(cat /tmp/spartacus-webapp.pid)" 2>/dev/null
}

webapp_start() {
  if is_webapp_running; then
    echo -e "  ${GREEN}●${NC} Webapp ja esta rodando — http://localhost:8081"
    return
  fi

  echo -e "${CYAN}Webapp (Expo Web)...${NC}"
  cd "$APP_DIR"

  # Swap API URL to local backend for the dev session
  local env_file="$APP_DIR/.env"
  local current_url
  current_url=$(grep "^EXPO_PUBLIC_API_URL=" "$env_file" | tail -1 | cut -d= -f2-)
  if ! echo "$current_url" | grep -q "localhost:8000"; then
    echo -e "  ${GOLD}Trocando EXPO_PUBLIC_API_URL para http://localhost:8000${NC}"
    sed -i "s|^EXPO_PUBLIC_API_URL=.*|EXPO_PUBLIC_API_URL=http://localhost:8000|" "$env_file"
  fi

  EXPO_PUBLIC_API_URL=http://localhost:8000 npx expo start --web --port 8081 \
    > /tmp/spartacus-webapp.log 2>&1 &
  echo $! > /tmp/spartacus-webapp.pid
  echo -e "  ${GREEN}●${NC} Webapp        http://localhost:8081"
  echo -e "    API:  http://localhost:8000 (backend local)"
  echo -e "    Prod: https://app.spartacus.app.br"
  echo -e "    Logs: ./dev.sh webapp logs"
}

webapp_stop() {
  if [ -f /tmp/spartacus-webapp.pid ]; then
    kill "$(cat /tmp/spartacus-webapp.pid)" 2>/dev/null || true
    rm -f /tmp/spartacus-webapp.pid
  fi
  echo -e "  ${RED}●${NC} Webapp parado"
}

webapp_status() {
  if is_webapp_running; then
    echo -e "  ${GREEN}●${NC} Webapp        http://localhost:8081"
  else
    echo -e "  ${RED}●${NC} Webapp        (parado)"
  fi
}

webapp_logs() {
  if [ ! -f /tmp/spartacus-webapp.log ]; then
    echo -e "${RED}Sem arquivo de log. Webapp foi iniciado?${NC}"
    exit 1
  fi
  tail -f /tmp/spartacus-webapp.log
}

# ─── Backoffice ──────────────────────────────────────────────────────────────

is_backoffice_running() {
  [ -f /tmp/spartacus-backoffice.pid ] && kill -0 "$(cat /tmp/spartacus-backoffice.pid)" 2>/dev/null
}

backoffice_start() {
  if is_backoffice_running; then
    echo -e "  ${GREEN}●${NC} Backoffice ja esta rodando — http://localhost:5173"
    return
  fi
  echo -e "${CYAN}Backoffice Vite...${NC}"
  cd "$BACKOFFICE_DIR"
  npx vite --host \
    > /tmp/spartacus-backoffice.log 2>&1 &
  echo $! > /tmp/spartacus-backoffice.pid
  echo -e "  ${GREEN}●${NC} Backoffice    http://localhost:5173"
  echo -e "    Logs: ./dev.sh backoffice logs"
}

backoffice_stop() {
  if [ -f /tmp/spartacus-backoffice.pid ]; then
    kill "$(cat /tmp/spartacus-backoffice.pid)" 2>/dev/null || true
    rm -f /tmp/spartacus-backoffice.pid
  fi
  echo -e "  ${RED}●${NC} Backoffice parado"
}

backoffice_status() {
  if is_backoffice_running; then
    echo -e "  ${GREEN}●${NC} Backoffice    http://localhost:5173"
  else
    echo -e "  ${RED}●${NC} Backoffice    (parado)"
  fi
}

backoffice_logs() {
  if [ ! -f /tmp/spartacus-backoffice.log ]; then
    echo -e "${RED}Sem arquivo de log. Backoffice foi iniciado?${NC}"
    exit 1
  fi
  tail -f /tmp/spartacus-backoffice.log
}

# ─── All ──────────────────────────────────────────────────────────────────────

all_start() {
  echo ""
  echo -e "${GOLD}=======================================================${NC}"
  echo -e "${GOLD}  SPARTACUS — Ambiente de Desenvolvimento Local${NC}"
  echo -e "${GOLD}=======================================================${NC}"
  echo ""
  check_deps
  check_env_files
  ensure_app_api_url
  echo ""
  emulator_start
  echo ""
  backend_start
  sleep 2
  echo ""
  app_start "$@"
  echo ""
  webapp_start
  echo ""
  backoffice_start
  echo ""
  echo -e "${GOLD}=======================================================${NC}"
  echo -e "  ${GREEN}Ambiente local pronto!${NC}"
  echo -e "${GOLD}=======================================================${NC}"
  echo ""
  echo -e "  ${GOLD}Comandos:${NC}"
  echo "    ./dev.sh status           — status de todos"
  echo "    ./dev.sh stop             — parar tudo"
  echo "    ./dev.sh backend logs     — logs do backend"
  echo "    ./dev.sh app logs         — logs do Expo"
  echo ""
}

all_stop() {
  echo -e "${GOLD}Parando todos os servicos...${NC}"
  backoffice_stop
  webapp_stop
  app_stop
  backend_stop
  emulator_stop
  echo -e "\n${GREEN}Tudo parado.${NC}"
}

all_status() {
  echo -e "${GOLD}Status dos servicos:${NC}"
  echo ""
  emulator_status
  backend_status
  app_status
  webapp_status
  backoffice_status
  echo ""
}

# ─── Uso ──────────────────────────────────────────────────────────────────────

usage() {
  echo "Uso: ./dev.sh [servico] <acao>"
  echo ""
  echo "Servicos: emulator, backend, app, webapp, backoffice (ou nenhum para todos)"
  echo "Acoes:    start, stop, status, logs, build, deploy, devlog"
  echo ""
  echo "Exemplos:"
  echo "  ./dev.sh                      # sobe tudo"
  echo "  ./dev.sh backend start        # sobe so o backend"
  echo "  ./dev.sh backend logs         # logs do backend"
  echo "  ./dev.sh app start --android  # sobe app no Android Studio"
  echo "  ./dev.sh app build apk        # gera APK local (preview)"
  echo "  ./dev.sh app build aab        # gera AAB local (production)"
  echo "  ./dev.sh app deploy           # build + instala no celular via USB"
  echo "  ./dev.sh app devlog           # logs JS do celular em tempo real"
  echo "  ./dev.sh app publish          # build AAB + publica na Play Store"
  echo "  ./dev.sh app web              # build PWA + deploy Firebase Hosting"
  echo "  ./dev.sh webapp start         # sobe app web local (Expo Web, API local)"
  echo "  ./dev.sh webapp stop          # para app web local"
  echo "  ./dev.sh webapp logs          # logs do app web"
  echo "  ./dev.sh backoffice           # sobe backoffice dev server"
  echo "  ./dev.sh backoffice logs      # logs do backoffice"
  echo "  ./dev.sh stop                 # para tudo"
}

# ─── Main ─────────────────────────────────────────────────────────────────────

SERVICE="${1:-}"
ACTION="${2:-start}"
EXTRA_ARGS="${*:3}"

case "$SERVICE" in
  emulator)
    case "$ACTION" in
      start)  emulator_start ;;
      stop)   emulator_stop ;;
      status) emulator_status ;;
      logs)   echo -e "${GOLD}Emulators logs via docker:${NC}"; cd "$BACKEND_DIR" && docker compose logs -f ;;
      *)      usage; exit 1 ;;
    esac
    ;;
  backend)
    case "$ACTION" in
      start)  backend_start ;;
      stop)   backend_stop ;;
      status) backend_status ;;
      logs)   backend_logs ;;
      *)      usage; exit 1 ;;
    esac
    ;;
  app)
    case "$ACTION" in
      start)  app_start $EXTRA_ARGS ;;
      stop)   app_stop ;;
      status) app_status ;;
      logs)   app_logs ;;
      build)   app_build "$EXTRA_ARGS" ;;
      deploy)  app_deploy ;;
      install) app_install ;;
      devlog)  app_devlog ;;
      publish) app_publish ;;
      web)     app_web ;;
      *)       usage; exit 1 ;;
    esac
    ;;
  webapp)
    case "$ACTION" in
      start)  webapp_start ;;
      stop)   webapp_stop ;;
      status) webapp_status ;;
      logs)   webapp_logs ;;
      *)      usage; exit 1 ;;
    esac
    ;;
  backoffice)
    case "$ACTION" in
      start)  backoffice_start ;;
      stop)   backoffice_stop ;;
      status) backoffice_status ;;
      logs)   backoffice_logs ;;
      *)      usage; exit 1 ;;
    esac
    ;;
  start)
    all_start "${@:2}"
    ;;
  stop)
    all_stop
    ;;
  status)
    all_status
    ;;
  logs)
    echo -e "${GOLD}Especifique o servico: ./dev.sh backend logs  ou  ./dev.sh app logs${NC}"
    exit 1
    ;;
  help|--help|-h)
    usage
    ;;
  "")
    all_start "${@:2}"
    ;;
  *)
    echo -e "${RED}Servico desconhecido: $SERVICE${NC}"
    usage
    exit 1
    ;;
esac
