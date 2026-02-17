#!/usr/bin/env bash
set -euo pipefail

export LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-you@example.com}"

cd "$(dirname "$0")"

./preflight.sh divinebeautybynina.com

docker compose up -d --build
./init-letsencrypt.sh

docker compose ps

echo "Live deploy flow completed. Verify https://divinebeautybynina.com"
