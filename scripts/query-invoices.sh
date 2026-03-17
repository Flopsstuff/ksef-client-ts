#!/usr/bin/env bash
#
# Query invoices from KSeF using the CLI.
# Auto-logs in if session is expired or missing.
#
# Requires env vars: KSEF_TOKEN, KSEF_NIP
# Usage: bash scripts/query-invoices.sh [--env test|demo|prod]
#

set -euo pipefail

CLI="node dist/cli.js"
ENV="${1:-prod}"
# Strip --env prefix if passed as --env prod
[[ "$ENV" == "--env" ]] && ENV="${2:-prod}"

FROM=$(date -v-30d '+%Y-%m-%dT00:00:00+00:00' 2>/dev/null || date -d '30 days ago' '+%Y-%m-%dT00:00:00+00:00')
TO=$(date '+%Y-%m-%dT23:59:59+00:00')

# Check session, login if expired or missing
if ! $CLI auth whoami >/dev/null 2>&1; then
  echo "Session expired or missing. Logging in to KSeF ($ENV)..."
  $CLI auth login --token "$KSEF_TOKEN" --nip "$KSEF_NIP" --env "$ENV"
  echo ""
fi

echo "=== Issued invoices (Subject1) — last 30 days ==="
$CLI invoice query --from "$FROM" --to "$TO" --subject-type Subject1 --date-type PermanentStorage --size 10

echo ""
echo "=== Received invoices (Subject2) — last 30 days ==="
$CLI invoice query --from "$FROM" --to "$TO" --subject-type Subject2 --date-type PermanentStorage --size 10
