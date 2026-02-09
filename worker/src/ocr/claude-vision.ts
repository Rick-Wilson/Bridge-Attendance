import type { OcrResult } from '../types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096;

function buildSystemPrompt(): string {
  return `You are an OCR system that extracts structured data from photographed bridge class attendance sheets. You return ONLY valid JSON, no markdown fencing, no commentary.

The attendance sheets come in two formats:

FORMAT 1 — "blank" (table/seat grouping):
- Left column shows "Table 1", "Table 2", etc.
- Under each table label are four rows for seats: North, South, East, West
- Students write their name on the line next to their seat label
- There is NO separate table or seat column — the table number and seat are determined by the grouping structure

FORMAT 2 — "roster" (pre-printed names):
- Has column headers: NAME, TABLE, SEAT
- Pre-printed student names with a checkbox (square) to the left
- A checked checkbox means the student is present
- TABLE column: students write in their table number
- SEAT column: shows "N  S  E  W" — students circle one letter
- After the roster names, there may be blank rows where additional students wrote their names

BOTH formats may have:
- A QR code in the top-left corner encoding JSON with fields: app, event_id, name, date, teacher
- A "JOIN MY MAILING LIST" section at the bottom with Name/Email rows
- A header showing "CLASS ATTENDANCE", the class name, date, instructor, and event ID

RULES:
- For blank forms: the table_number comes from the "Table N" label, and the seat comes from the row label (North=N, South=S, East=E, West=W)
- For roster forms: is_checked is true if the checkbox has any mark inside it (checkmark, X, fill)
- Only include rows where a name is present (skip completely empty rows)
- For seat values, always normalize to single letter: N, S, E, or W
- If handwriting is unclear, provide your best guess and set confidence lower
- Email addresses: read carefully, common domains are gmail.com, yahoo.com, hotmail.com, outlook.com
- If the QR code is not readable or not visible, set qr_data to null`;
}

function buildUserPrompt(): string {
  return `Analyze this attendance sheet photograph and extract all data. Return a single JSON object with this exact structure:

{
  "qr_data": {"app":"...","event_id":"...","name":"...","date":"...","teacher":"..."} or null,
  "form_type": "blank" or "roster",
  "attendance": [
    {
      "name": "Student Name",
      "table_number": 1,
      "seat": "N",
      "is_checked": true,
      "confidence": 0.95
    }
  ],
  "mailing_list": [
    {
      "name": "Person Name",
      "email": "email@example.com",
      "confidence": 0.9
    }
  ],
  "confidence": 0.92,
  "notes": "Any issues, e.g. blurry areas, unclear handwriting"
}

Important:
- For "blank" form type, is_checked should be null for all entries
- For "roster" form type, only include entries where is_checked is true OR where a name was handwritten in a blank row
- Set confidence between 0 and 1 for each entry and overall
- Omit entries with no name written
- Return ONLY the JSON object, nothing else`;
}

/** Call Claude Vision API with a base64-encoded attendance sheet photo */
export async function processAttendanceSheet(
  apiKey: string,
  imageBase64: string,
  mediaType: string,
): Promise<OcrResult> {
  const requestBody = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: buildUserPrompt(),
          },
        ],
      },
    ],
  };

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_API_VERSION,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errorBody}`);
  }

  const apiResponse = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
    stop_reason: string;
  };

  const textBlock = apiResponse.content.find((b) => b.type === 'text');
  if (!textBlock?.text) {
    throw new Error('No text content in Anthropic API response');
  }

  // Strip markdown code fences if present
  const rawText = textBlock.text.trim();
  const jsonText = rawText.replace(/^```json?\s*\n?/, '').replace(/\n?```\s*$/, '');

  let parsed: OcrResult;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(
      `Failed to parse OCR result as JSON. Raw response: ${rawText.slice(0, 500)}`,
    );
  }

  return validateOcrResult(parsed);
}

/** Validate and normalize the parsed OCR result */
function validateOcrResult(raw: OcrResult): OcrResult {
  return {
    qr_data: raw.qr_data ?? null,
    form_type: raw.form_type === 'roster' ? 'roster' : 'blank',
    attendance: (raw.attendance ?? [])
      .map((entry) => ({
        name: (entry.name ?? '').trim(),
        table_number: typeof entry.table_number === 'number' ? entry.table_number : null,
        seat: normalizeSeat(entry.seat),
        is_checked: entry.is_checked ?? null,
        confidence: typeof entry.confidence === 'number' ? entry.confidence : 0.5,
      }))
      .filter((e) => e.name.length > 0),
    mailing_list: (raw.mailing_list ?? [])
      .map((entry) => ({
        name: (entry.name ?? '').trim(),
        email: (entry.email ?? '').trim().toLowerCase(),
        confidence: typeof entry.confidence === 'number' ? entry.confidence : 0.5,
      }))
      .filter((e) => e.name.length > 0 && e.email.length > 0),
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.5,
    notes: raw.notes ?? '',
  };
}

function normalizeSeat(seat: unknown): string | null {
  if (typeof seat !== 'string') return null;
  const upper = seat.trim().toUpperCase();
  if (upper === 'NORTH') return 'N';
  if (upper === 'SOUTH') return 'S';
  if (upper === 'EAST') return 'E';
  if (upper === 'WEST') return 'W';
  if (['N', 'S', 'E', 'W'].includes(upper)) return upper;
  return null;
}

/** Convert ArrayBuffer to base64 string (Workers-compatible, no Node.js Buffer) */
export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
