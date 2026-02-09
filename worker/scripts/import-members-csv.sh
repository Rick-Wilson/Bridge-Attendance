#!/usr/bin/env bash
# Import members from a groups.io CSV export into the local dev API.
# Usage: ./scripts/import-members-csv.sh <csv-file> [base-url]
#
# Expected CSV columns: Email, User ID, Member ID, Display Name, Username, Joined, ...
# We extract: Email (col 1), Display Name (col 4), Joined (col 6)

set -euo pipefail

CSV_FILE="${1:?Usage: $0 <csv-file> [base-url]}"
BASE_URL="${2:-http://localhost:8787}"
AUTH="Authorization: Bearer dev-secret-key-for-testing"

if [ ! -f "$CSV_FILE" ]; then
  echo "Error: File not found: $CSV_FILE"
  exit 1
fi

echo "=== Importing members from: $CSV_FILE ==="
echo "=== Target: $BASE_URL ==="
echo ""

# Parse CSV and build batch JSON payload
BATCH_JSON=$(python3 -c "
import csv, json, sys
from datetime import datetime

members = []
with open(sys.argv[1], newline='') as f:
    reader = csv.DictReader(f)
    for row in reader:
        email = row.get('Email', '').strip()
        name = row.get('Display Name', '').strip()
        joined_raw = row.get('Joined', '').strip()

        if not email or not name:
            continue

        # Convert MM/DD/YYYY to YYYY-MM-DD
        joined_date = None
        if joined_raw:
            try:
                dt = datetime.strptime(joined_raw, '%m/%d/%Y')
                joined_date = dt.strftime('%Y-%m-%d')
            except ValueError:
                joined_date = joined_raw

        members.append({
            'name': name,
            'email': email.lower(),
            'joined_date': joined_date,
        })

print(json.dumps({'members': members}))
" "$CSV_FILE")

NUM_MEMBERS=$(python3 -c "import json,sys; print(len(json.loads(sys.argv[1])['members']))" "$BATCH_JSON")
echo "Found $NUM_MEMBERS members in CSV"
echo ""

# Send batch import
echo "--- Importing via batch endpoint ---"
curl -s -X POST "$BASE_URL/api/members/batch" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d "$BATCH_JSON" | python3 -m json.tool

echo ""

# Verify
echo "--- Verifying ---"
curl -s "$BASE_URL/api/members?limit=5" \
  -H "$AUTH" | python3 -c "
import json, sys
resp = json.load(sys.stdin)
total = resp['meta']['total']
print(f'Total members in DB: {total}')
for m in resp['data'][:5]:
    print(f\"  {m['name']} <{m['email']}> (joined: {m.get('joined_date', '?')})\")
if total > 5:
    print(f'  ... and {total - 5} more')
"

echo ""
echo "=== Import complete ==="
