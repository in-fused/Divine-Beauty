#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-divinebeautybynina.com}"
WWW_DOMAIN="${WWW_DOMAIN:-www.divinebeautybynina.com}"
EMAIL="${LETSENCRYPT_EMAIL:-you@example.com}"

cd "$(dirname "$0")"

command -v docker >/dev/null 2>&1 || { echo "docker not installed" >&2; exit 1; }

# Bootstrap with HTTP-only config so nginx can start before certs exist.
cp ./nginx/default.conf ./nginx/active.conf
docker compose up -d nginx

# Obtain certs from Let's Encrypt via webroot challenge.
docker compose run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" -d "$WWW_DOMAIN" \
  --email "$EMAIL" --agree-tos --no-eff-email

# Switch nginx to TLS config after cert issuance.
cp ./nginx/tls.conf ./nginx/active.conf
docker compose restart nginx

echo "SSL certificates issued and TLS nginx config enabled for $DOMAIN and $WWW_DOMAIN"
