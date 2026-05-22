#!/bin/bash
# Ledgr integration + E2E test runner
# Usage:
#   ./run_tests.sh           — run both backend and frontend tests
#   ./run_tests.sh backend   — backend pytest only
#   ./run_tests.sh e2e       — Playwright E2E only
#   ./run_tests.sh seed      — seed dummy data into ES + ClickHouse only

set -e
cd "$(dirname "$0")"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${YELLOW}▶ $*${NC}"; }
success() { echo -e "${GREEN}✓ $*${NC}"; }
fail()    { echo -e "${RED}✗ $*${NC}"; exit 1; }

# ── Prereqs ────────────────────────────────────────────────────────────────────

check_service() {
  local name=$1 url=$2
  if curl -sf "$url" > /dev/null 2>&1; then
    success "$name is reachable ($url)"
  else
    fail "$name not reachable at $url — is docker compose up?"
  fi
}

check_services() {
  info "Checking required services..."
  check_service "Elasticsearch"  "http://localhost:9200/_cluster/health"
  check_service "ClickHouse"     "http://localhost:8123/ping"
  check_service "FastAPI backend" "http://localhost:8000/api/health"
}

# ── Backend (pytest) ───────────────────────────────────────────────────────────

run_backend_tests() {
  info "Installing backend test deps..."
  pip install -q -r backend/requirements.txt -r backend/tests/requirements-test.txt

  info "Running backend integration tests..."
  python -m pytest backend/tests/ \
    --rootdir=backend \
    -v \
    --tb=short \
    -p no:cacheprovider \
    "$@"
  success "Backend tests passed"
}

# ── Seed only ─────────────────────────────────────────────────────────────────

run_seed() {
  info "Seeding dummy data into Elasticsearch + ClickHouse..."
  pip install -q -r backend/requirements.txt
  python backend/tests/seed.py
  success "Seed complete — 17 DEMO + 3 ISOLATE invoices loaded"
}

# ── Frontend E2E (Playwright) ──────────────────────────────────────────────────

run_e2e_tests() {
  info "Installing Playwright..."
  cd frontend
  npm install --save-dev @playwright/test
  npx playwright install chromium --with-deps

  info "Running Playwright E2E tests (BASE_URL=${BASE_URL:-http://localhost:3000})..."
  npx playwright test \
    --reporter=list \
    "$@"
  success "E2E tests passed"
  cd ..
}

# ── Main ───────────────────────────────────────────────────────────────────────

MODE=${1:-all}

case "$MODE" in
  seed)
    check_services
    run_seed
    ;;
  backend)
    check_services
    run_backend_tests "${@:2}"
    ;;
  e2e)
    check_services
    run_e2e_tests "${@:2}"
    ;;
  all)
    check_services
    run_seed
    run_backend_tests
    run_e2e_tests
    echo ""
    success "All tests passed."
    ;;
  *)
    echo "Usage: $0 [all|backend|e2e|seed]"
    exit 1
    ;;
esac
