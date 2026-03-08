#!/usr/bin/env bash
#
# Query invoices from KSeF using the CLI.
# Requires: ksef auth login (session must exist in ~/.ksef/session.json)
#
# Usage: bash scripts/query-invoices.sh
#        -- or if built: ksef invoice query --from ... --size 10

set -euo pipefail

CLI="node dist/cli.js"
FROM=$(date -v-30d '+%Y-%m-%dT00:00:00+00:00' 2>/dev/null || date -d '30 days ago' '+%Y-%m-%dT00:00:00+00:00')
TO=$(date '+%Y-%m-%dT23:59:59+00:00')

echo "=== Issued invoices (Subject1) — last 30 days ==="
$CLI invoice query --from "$FROM" --to "$TO" --subject-type Subject1 --date-type PermanentStorage --size 10

echo ""
echo "=== Received invoices (Subject2) — last 30 days ==="
$CLI invoice query --from "$FROM" --to "$TO" --subject-type Subject2 --date-type PermanentStorage --size 10
