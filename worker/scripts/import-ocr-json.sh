#!/usr/bin/env bash
# Import attendance data from Claude.ai OCR JSON into the local dev API.
# Usage: ./scripts/import-ocr-json.sh <json-file> [base-url]

set -euo pipefail

JSON_FILE="${1:?Usage: $0 <json-file> [base-url]}"
BASE_URL="${2:-http://localhost:8787}"
AUTH="Authorization: Bearer dev-secret-key-for-testing"

if [ ! -f "$JSON_FILE" ]; then
  echo "Error: File not found: $JSON_FILE"
  exit 1
fi

echo "=== Importing from: $JSON_FILE ==="
echo "=== Target: $BASE_URL ==="
echo ""

# Parse the JSON and process each class
NUM_CLASSES=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(len(d['classes']))" "$JSON_FILE")

for i in $(seq 0 $((NUM_CLASSES - 1))); do
  # Extract event info
  EVENT_JSON=$(python3 -c "
import json, sys
d = json.load(open(sys.argv[1]))
cls = d['classes'][$i]
e = cls['event']
seat_map = {'North':'N','South':'S','East':'E','West':'W'}

# Build event creation payload
event = {
    'id': e['id'],
    'name': e['class_name'],
    'date': e['date'],
    'teacher': e.get('instructor', ''),
    'location': e.get('location', ''),
    'type': 'face_to_face'
}
print(json.dumps(event))
" "$JSON_FILE")

  EVENT_ID=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['id'])" "$EVENT_JSON")
  EVENT_NAME=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['name'])" "$EVENT_JSON")

  echo "--- Creating event: $EVENT_NAME ($EVENT_ID) ---"
  curl -s -X POST "$BASE_URL/api/events" \
    -H "$AUTH" \
    -H "Content-Type: application/json" \
    -d "$EVENT_JSON" | python3 -m json.tool
  echo ""

  # Build confirm payload (attendance + mailing_list)
  CONFIRM_JSON=$(python3 -c "
import json, sys
d = json.load(open(sys.argv[1]))
cls = d['classes'][$i]
seat_map = {'North':'N','South':'S','East':'E','West':'W'}

attendance = []
for entry in cls['attendance']:
    name = entry.get('name')
    if not name:
        continue
    # Use matched_member name if available, otherwise use OCR name
    student_name = entry.get('matched_member') or name
    record = {
        'student_name': student_name,
        'table_number': entry.get('table'),
        'seat': seat_map.get(entry.get('seat', ''), entry.get('seat'))
    }
    attendance.append(record)

mailing_list = []
for entry in cls.get('mailing_list', []):
    if entry.get('name') and entry.get('email'):
        mailing_list.append({
            'name': entry['name'],
            'email': entry['email']
        })

print(json.dumps({'attendance': attendance, 'mailing_list': mailing_list}, indent=2))
" "$JSON_FILE")

  NUM_ATT=$(python3 -c "import json,sys; print(len(json.loads(sys.argv[1])['attendance']))" "$CONFIRM_JSON")
  NUM_ML=$(python3 -c "import json,sys; print(len(json.loads(sys.argv[1])['mailing_list']))" "$CONFIRM_JSON")
  echo "--- Confirming $NUM_ATT attendance + $NUM_ML mailing list for $EVENT_NAME ---"

  curl -s -X POST "$BASE_URL/api/events/$EVENT_ID/confirm" \
    -H "$AUTH" \
    -H "Content-Type: application/json" \
    -d "$CONFIRM_JSON" | python3 -m json.tool
  echo ""

  # Verify
  echo "--- Verifying $EVENT_NAME ---"
  curl -s "$BASE_URL/api/events/$EVENT_ID" \
    -H "$AUTH" | python3 -c "
import json, sys
data = json.load(sys.stdin)['data']
print(f\"  Event: {data['name']} ({data['date']})\")
att = data.get('attendance', [])
print(f\"  Attendance: {len(att)} students\")
for a in att:
    seat = a.get('seat', '?')
    table = a.get('table_number', '?')
    print(f\"    Table {table} {seat}: {a['student_name']}\")
"
  echo ""
done

echo "=== Import complete ==="
