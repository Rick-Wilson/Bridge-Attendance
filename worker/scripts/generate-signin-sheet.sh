#!/usr/bin/env bash
# Generate a roster-style sign-in sheet for a class.
# Pulls student list from the API, marks non-members with ★, generates PDF.
#
# Usage: ./scripts/generate-signin-sheet.sh <event-id> [options]
#   Options:
#     --url <base-url>     API base URL (default: http://localhost:8787)
#     --output <file.pdf>  Output PDF path (default: auto-generated)
#     --logo <path>        Logo image for header
#     --date <YYYY-MM-DD>  Date for the sheet (default: next occurrence or today)

set -euo pipefail

EVENT_ID="${1:?Usage: $0 <event-id> [--url <base-url>] [--output <file.pdf>] [--logo <path>] [--date <YYYY-MM-DD>]}"
shift

BASE_URL="http://localhost:8787"
AUTH="Authorization: Bearer dev-secret-key-for-testing"
OUTPUT=""
LOGO=""
DATE=""

# Parse optional arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) BASE_URL="$2"; shift 2 ;;
    --output) OUTPUT="$2"; shift 2 ;;
    --logo) LOGO="$2"; shift 2 ;;
    --date) DATE="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Fetch roster from API
echo "Fetching roster for event $EVENT_ID..."
ROSTER_JSON=$(curl -s "$BASE_URL/api/events/$EVENT_ID/roster" -H "$AUTH")

# Check for errors
ERROR=$(echo "$ROSTER_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error',{}).get('message',''))" 2>/dev/null || echo "")
if [ -n "$ERROR" ]; then
  echo "Error: $ERROR"
  exit 1
fi

# Extract class info and build roster file
TMPDIR=$(mktemp -d)
ROSTER_FILE="$TMPDIR/roster.json"

python3 << 'PYEOF' - "$ROSTER_JSON" "$ROSTER_FILE"
import json, sys

data = json.loads(sys.argv[1])['data']
roster_file = sys.argv[2]

print(f"Class: {data['class_name']}")
print(f"Teacher: {data['teacher']}")
print(f"Students: {data['total_students']}")
print(f"Need mailing list signup: {data['needs_mailing_list']}")
print()

roster = []
for s in data['students']:
    name = s['name']
    if s['needs_mailing_list']:
        name = name + ' *'
        print(f"  * {s['name']} (not on mailing list)")
    roster.append({'name': name})

if data['needs_mailing_list'] > 0:
    print()
    print("* = not on mailing list, please ask to join")

with open(roster_file, 'w') as f:
    json.dump(roster, f, indent=2)
PYEOF

# Extract class info for PDF args
CLASS_NAME=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['data']['class_name'])" "$ROSTER_JSON")
TEACHER=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['data']['teacher'])" "$ROSTER_JSON")

echo ""

# Build attend command
ATTEND="${ATTEND:-$(dirname "$0")/../../attendance-pdf/target/release/attendance-pdf}"
CMD=("$ATTEND" --name "$CLASS_NAME" --teacher "$TEACHER" --roster "$ROSTER_FILE")

if [ -n "$DATE" ]; then
  CMD+=(--date "$DATE")
fi

if [ -n "$LOGO" ]; then
  CMD+=(--logo "$LOGO")
fi

if [ -n "$OUTPUT" ]; then
  CMD+=(--output "$OUTPUT")
fi

echo "Generating PDF..."
"${CMD[@]}"

# Clean up
rm -rf "$TMPDIR"
