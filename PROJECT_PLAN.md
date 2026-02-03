# Project Plan: Bridge Class Attendance System

## Phase 1: PDF Generator (Priority - needed TODAY)

### Goal
Create a Rust CLI tool that generates printable attendance sheets with:
- QR code encoding event metadata
- Student roster (pre-printed names or blank rows)
- Table number and seat (N/S/E/W) columns
- Optional mailing list signup section

### Data Model

```rust
// QR Code payload
struct QrPayload {
    app: String,           // "bridge-attendance"
    event_id: String,      // UUID
    name: String,          // Class name
    date: String,          // ISO date
    teacher: String,
}

// Roster input (JSON)
struct Student {
    name: String,
}
```

### CLI Interface

```
attendance-pdf [OPTIONS]

Options:
  -n, --name <NAME>           Class/event name (required)
  -t, --teacher <TEACHER>     Teacher name [default: Rick]
  -d, --date <DATE>           Date YYYY-MM-DD [default: today]
  -l, --location <LOCATION>   Location
  -r, --rows <ROWS>           Number of blank rows [default: 32]
  -m, --mailing-list          Include mailing list section [default: true]
      --mailing-rows <N>      Mailing list rows [default: 6]
  -o, --output <FILE>         Output filename [default: attendance-{date}.pdf]
      --roster <FILE>         Student roster JSON file
```

### PDF Layout Specification

**Page: US Letter (8.5" x 11")**

```
┌────────────────────────────────────────────────────────────┐
│ ┌──────┐                                                   │
│ │ QR   │   CLASS ATTENDANCE                    15mm margin │
│ │ Code │   {Class Name}                                    │
│ │30x30 │   {Date} - {Teacher}                              │
│ └──────┘   {Location}                                      │
│            ID: {short-uuid}                                │
├────────────────────────────────────────────────────────────┤
│ NAME                                    TABLE    SEAT      │
│ ─────────────────────────────────────────────────────────  │
│                                                            │
│ [Roster mode: checkbox + name]                             │
│ ☐ Alice Johnson                         ___    N  S  E  W │
│ ☐ Bob Smith                             ___    N  S  E  W │
│                                                            │
│ [Blank mode: numbered lines]                               │
│ 1. _____________________________        ___    N  S  E  W │
│ 2. _____________________________        ___    N  S  E  W │
│                                                            │
│ ... (28-32 rows depending on mailing list)                 │
│                                                            │
├────────────────────────────────────────────────────────────┤
│ JOIN OUR MAILING LIST                                      │
│ Name: _________________________ Email: __________________ │
│ Name: _________________________ Email: __________________ │
│ (6 rows)                                                   │
└────────────────────────────────────────────────────────────┘
```

### Claude Code Prompt - Phase 1

```
I'm building a Rust CLI tool to generate PDF attendance sheets for my bridge classes.

Project context:
- This is part of a larger attendance tracking system
- The PDF will be printed, filled in by hand, then photographed and OCR'd later
- I need this working today for my classes

Requirements:
1. Generate a US Letter PDF with:
   - QR code (top left, 30mm) encoding JSON: {app, event_id, name, date, teacher}
   - Header with class name, date, teacher, location
   - Attendance grid with columns: NAME, TABLE (write-in), SEAT (circle N/S/E/W)
   - Optional mailing list signup section at bottom

2. Two modes:
   - Blank form: numbered rows (1-32) with lines for writing names
   - Roster form: pre-printed names with checkboxes, plus 8 blank rows for new students

3. CLI interface using clap:
   - --name (required): class name
   - --teacher (default: "Rick")
   - --date (default: today, format YYYY-MM-DD)
   - --location (optional)
   - --rows (default: 32): blank rows count
   - --mailing-list (default: true)
   - --mailing-rows (default: 6)
   - --output (default: attendance-{date}.pdf)
   - --roster (optional): path to JSON file with student names

4. Dependencies to use:
   - printpdf for PDF generation
   - qrcode + image for QR code generation
   - clap for CLI
   - chrono for dates
   - serde/serde_json for JSON
   - uuid for event IDs

Please create the complete Cargo.toml and src/main.rs. Focus on clean, readable code. The PDF should look professional when printed.
```

### Deliverables
- [ ] `attendance-pdf/Cargo.toml`
- [ ] `attendance-pdf/src/main.rs`
- [ ] `attendance-pdf/examples/roster.json`
- [ ] Test with actual class parameters

---

## Phase 2: Data Model & Backend API

### Goal
Set up Cloudflare Worker with D1 database and R2 storage.

### Database Schema (D1/SQLite)

```sql
-- Events (class sessions)
CREATE TABLE events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    teacher TEXT NOT NULL,
    location TEXT,
    type TEXT DEFAULT 'face_to_face',  -- face_to_face | online
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Students (built up over time from attendance)
CREATE TABLE students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    photo_url TEXT,
    first_event_id TEXT REFERENCES events(id),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Attendance records
CREATE TABLE attendance (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id),
    student_id TEXT NOT NULL REFERENCES students(id),
    table_number INTEGER,
    seat TEXT,  -- N, S, E, W
    source TEXT DEFAULT 'ocr',  -- ocr | manual | online
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, student_id)
);

-- Table photos (for flashcard app)
CREATE TABLE table_photos (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id),
    table_number INTEGER NOT NULL,
    photo_url TEXT NOT NULL,
    processed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Mailing list signups
CREATE TABLE mailing_list (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    event_id TEXT REFERENCES events(id),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- OCR processing queue
CREATE TABLE ocr_jobs (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id),
    photo_url TEXT NOT NULL,
    status TEXT DEFAULT 'pending',  -- pending | processing | complete | failed
    result_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    processed_at TEXT
);
```

### API Endpoints

```
POST   /api/events              Create new event
GET    /api/events              List events
GET    /api/events/:id          Get event details with attendance

POST   /api/events/:id/scan     Upload attendance sheet photo
GET    /api/events/:id/ocr      Get OCR results for review
POST   /api/events/:id/confirm  Confirm/edit OCR results

POST   /api/events/:id/table-photo  Upload table photo
GET    /api/students            List all students
GET    /api/students/:id        Get student with attendance history

GET    /api/flashcards          Get random student photos for study
POST   /api/flashcards/result   Record flashcard attempt

GET    /api/mailing-list        Export mailing list
```

### Claude Code Prompt - Phase 2

```
I'm setting up a Cloudflare Worker backend for my bridge class attendance system.

Infrastructure:
- Cloudflare Workers for API and serving the web app
- D1 (SQLite) for the database
- R2 for storing photos (attendance sheets and table photos)
- Will be hosted at attendance.harmonicsystems.com

Please create:

1. wrangler.toml configuration for:
   - D1 database binding
   - R2 bucket binding
   - Environment variables for ANTHROPIC_API_KEY

2. Database migration file with tables for:
   - events (class sessions)
   - students
   - attendance (links events to students with table/seat)
   - table_photos (for flashcard feature)
   - mailing_list
   - ocr_jobs (processing queue)

3. TypeScript API routes:
   - CRUD for events
   - Photo upload to R2
   - Student management
   - Attendance recording

4. Use Hono framework for routing (it works well with Workers)

Focus on the data model and basic CRUD first. OCR integration will come in Phase 3.
```

### Deliverables
- [ ] `worker/wrangler.toml`
- [ ] `worker/schema.sql`
- [ ] `worker/src/index.ts`
- [ ] `worker/src/api/events.ts`
- [ ] `worker/src/api/students.ts`
- [ ] `worker/src/api/photos.ts`
- [ ] Deploy to Cloudflare, configure DNS

---

## Phase 3: OCR Integration

### Goal
Implement AI-powered OCR to process photographed attendance sheets.

### OCR Strategy

1. **Extract QR code** - Identify the event from the QR code in the photo
2. **Detect attendance section** - Find the grid area
3. **For roster forms** - Identify which checkboxes are marked, read table/seat
4. **For blank forms** - Read handwritten names, table numbers, circled seats
5. **Detect mailing list section** - Read name/email pairs

### Claude Vision Prompt Template

```
Analyze this attendance sheet photo. Extract:

1. QR code data (if visible/readable)
2. For each row in the attendance section:
   - Is the checkbox marked? (for roster forms)
   - Student name (printed or handwritten)
   - Table number (handwritten)
   - Seat position (which letter is circled: N, S, E, or W)
3. Mailing list entries (name and email pairs)

Return JSON:
{
  "qr_data": {...} or null,
  "attendance": [
    {"name": "...", "table": 5, "seat": "N", "is_checked": true},
    ...
  ],
  "mailing_list": [
    {"name": "...", "email": "..."},
    ...
  ],
  "confidence": 0.95,
  "notes": "any issues or unclear items"
}
```

### Claude Code Prompt - Phase 3

```
I need to add OCR processing to my attendance system using Claude's vision API.

The workflow:
1. User photographs the filled-in attendance sheet
2. Photo is uploaded to R2
3. Worker calls Claude API with the image
4. Claude extracts attendance data (names, table numbers, circled seats)
5. Results are stored for user review/confirmation

Please implement:

1. OCR service module that:
   - Takes an R2 photo URL
   - Calls Claude API with vision capabilities
   - Parses the structured response
   - Handles errors gracefully

2. API endpoint POST /api/events/:id/scan that:
   - Accepts image upload
   - Stores in R2
   - Queues OCR job
   - Returns job ID for polling

3. API endpoint GET /api/events/:id/ocr/:jobId that:
   - Returns OCR status and results
   - Includes confidence scores

4. API endpoint POST /api/events/:id/confirm that:
   - Accepts reviewed/edited OCR results
   - Creates attendance records
   - Updates student roster if new names found
   - Adds mailing list entries

The Claude prompt should handle both:
- Roster forms (pre-printed names with checkboxes)
- Blank forms (handwritten names)

Include robust error handling for poor photo quality.
```

### Deliverables
- [ ] `worker/src/ocr/claude-vision.ts`
- [ ] `worker/src/api/scan.ts`
- [ ] OCR job queue processing
- [ ] Review/confirm UI endpoint

---

## Phase 4: Web App UI

### Goal
Create the camera capture and attendance management interface.

### Pages

1. **Home** - List of recent events, create new event
2. **Event Detail** - View attendance, upload photos, see OCR results
3. **Scan** - Camera interface for photographing sheets
4. **Review** - Edit/confirm OCR results before saving
5. **Table Photos** - Capture photos of students at tables
6. **Students** - View all students, attendance history

### Claude Code Prompt - Phase 4

```
I need a web UI for my attendance system. It will be served from the same Cloudflare Worker.

Requirements:
1. Simple, mobile-friendly interface (primarily used on iPad/phone at class)
2. Camera capture for attendance sheets and table photos
3. Review/edit OCR results before confirming
4. View attendance history by event or student

Tech choices:
- Could be vanilla JS/HTML for simplicity
- Or lightweight framework (Preact, Alpine.js)
- Tailwind CSS for styling
- Must work well on mobile Safari

Pages needed:
1. / - Event list with "New Event" button
2. /events/:id - Event detail with attendance list
3. /events/:id/scan - Camera capture for attendance sheet
4. /events/:id/review - Review OCR results, edit if needed
5. /events/:id/tables - Capture table photos
6. /students - All students list
7. /students/:id - Individual student history

Please create:
1. HTML templates for each page
2. JavaScript for camera access and photo capture
3. API integration for CRUD operations
4. Mobile-optimized layout
```

### Deliverables
- [ ] `worker/frontend/index.html`
- [ ] `worker/frontend/app.js`
- [ ] `worker/frontend/styles.css`
- [ ] Camera capture functionality
- [ ] OCR review interface

---

## Phase 5: Flashcard App

### Goal
Create a study mode for memorizing student names from table photos.

### Features

1. Display a table photo
2. User identifies the North player (holding table marker)
3. Prompt user to name each player at the table
4. Track correct/incorrect answers
5. Spaced repetition for harder-to-remember names

### Claude Code Prompt - Phase 5

```
Add a flashcard/study mode to help me memorize student names.

Data source:
- Table photos from events (stored in R2)
- Student records linked to attendance at specific tables

Flashcard modes:
1. "Who's at this table?" - Show table photo, name all 4 players
2. "Quick ID" - Show cropped face, name the student
3. "Table + Seat" - "Who was North at table 5 on Tuesday?"

Features:
- Random selection weighted toward less-practiced students
- Track attempts and success rate per student
- Simple spaced repetition (show missed ones more often)
- Works offline once photos are cached

Please add:
1. /flashcards page with study interface
2. API endpoints for flashcard data and recording results
3. Local storage for offline capability
4. Statistics view showing progress
```

### Deliverables
- [ ] Flashcard UI
- [ ] Spaced repetition logic
- [ ] Progress tracking
- [ ] Offline support

---

## Phase 6: Online Class Support

### Goal
Extend the system to support online (Zoom/BBO) classes.

### Differences from Face-to-Face
- No physical attendance sheet
- Students join via Zoom or BBO (Bridge Base Online)
- Need to capture attendance from participant list
- Table assignments come from BBO

### Claude Code Prompt - Phase 6

```
Extend my attendance system for online bridge classes.

Online class workflow:
1. Create event with type="online"
2. Option A: Paste Zoom participant list for OCR
3. Option B: Manual entry of attendees
4. Option C: Import from BBO table assignments (future)

Please add:
1. Event type toggle (face_to_face vs online)
2. Text paste interface for Zoom participant lists
3. Simple name matching against known students
4. Fuzzy matching for name variations (Bob vs Robert)

The key insight: online classes don't have table photos or physical sheets, but we still want to track who attended.
```

### Deliverables
- [ ] Online event type support
- [ ] Zoom participant list parser
- [ ] Name fuzzy matching
- [ ] Unified attendance view (both types)

---

## Development Notes

### Local Development

```bash
# PDF Generator
cd attendance-pdf
cargo run -- --name "Test Class" --rows 20

# Worker (local)
cd worker
npm install
npx wrangler dev

# Worker (deploy)
npx wrangler deploy
```

### Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...
```

### DNS Setup

Add to Cloudflare DNS for harmonicsystems.com:
```
attendance  CNAME  {worker-subdomain}.workers.dev
```

Or use custom domain in wrangler.toml.
