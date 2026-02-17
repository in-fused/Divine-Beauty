#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-divinebeautybynina.com}"
WWW_DOMAIN="www.${DOMAIN#www.}"

fail() { echo "[preflight] ERROR: $*" >&2; exit 1; }
warn() { echo "[preflight] WARN: $*" >&2; }
info() { echo "[preflight] $*"; }

command -v docker >/dev/null 2>&1 || fail "docker is not installed"
docker compose version >/dev/null 2>&1 || fail "docker compose plugin is not available"

if ! command -v dig >/dev/null 2>&1; then
  warn "dig not found; skipping DNS checks"
else
  ip_main="$(dig +short A "$DOMAIN" | head -n1 || true)"
  ip_www="$(dig +short A "$WWW_DOMAIN" | head -n1 || true)"
  [[ -n "$ip_main" ]] || warn "No A record found for $DOMAIN"
  [[ -n "$ip_www" ]] || warn "No A record found for $WWW_DOMAIN"
  info "$DOMAIN -> ${ip_main:-<none>}"
  info "$WWW_DOMAIN -> ${ip_www:-<none>}"
fi

for port in 80 443; do
  if ss -ltn "sport = :$port" | rg -q ":$port"; then
    warn "Port $port already in use; ensure this is expected before deploy"
  else
    info "Port $port appears available"
  fi
done

info "Preflight complete"
