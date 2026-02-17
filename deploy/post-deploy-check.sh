#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-divinebeautybynina.com}"

fail() { echo "[post-deploy] ERROR: $*" >&2; exit 1; }
info() { echo "[post-deploy] $*"; }

command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v openssl >/dev/null 2>&1 || fail "openssl is required"

info "Checking HTTP -> HTTPS redirect"
http_headers="$(curl -sSI --max-time 15 "http://${DOMAIN}" || true)"
echo "$http_headers" | rg -qi '^location: https://' || fail "HTTP did not redirect to HTTPS"

info "Checking HTTPS reachability"
https_headers="$(curl -sSI --max-time 20 "https://${DOMAIN}" || true)"
echo "$https_headers" | rg -qi '^http/.* 200|^http/.* 30[12]' || fail "HTTPS endpoint did not return success/redirect status"

info "Checking certificate subject/issuer and expiry"
cert_text="$(echo | openssl s_client -connect "${DOMAIN}:443" -servername "${DOMAIN}" 2>/dev/null | openssl x509 -noout -subject -issuer -dates)"
echo "$cert_text"

echo "$cert_text" | rg -q "Let's Encrypt" || info "Issuer is not Let's Encrypt (this may be expected if provider-managed cert is in use)"

echo "[post-deploy] OK: deployment checks passed for ${DOMAIN}"
