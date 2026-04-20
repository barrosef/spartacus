#!/usr/bin/env bash
# Install git pre-commit hooks for all sub-repos.
# Run once after cloning: ./scripts/install-hooks.sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GREEN='\033[0;32m'
NC='\033[0m'

for repo in app backoffice backend; do
  dir="$ROOT/repos/$repo"
  hooks="$dir/.githooks"
  if [ -d "$dir/.git" ] && [ -d "$hooks" ]; then
    git -C "$dir" config core.hooksPath .githooks
    chmod +x "$hooks"/pre-commit
    echo -e "${GREEN}✓${NC} $repo — hooks instalados (.githooks/)"
  else
    echo "  ⏭ $repo — sem .git ou .githooks, pulando"
  fi
done

echo ""
echo "Pronto. Pre-commit hooks ativos em app, backoffice e backend."
