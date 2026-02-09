# Bridge Attendance - Backend Worker

Cloudflare Worker backend for the Bridge Class Attendance system. Provides a REST API backed by D1 (SQLite) for data storage and R2 for photo uploads.

## Current Status

**Phase 3 complete — local development only.** The worker runs locally via `wrangler dev` with emulated D1 and R2. It has not been deployed to Cloudflare yet.

### What's implemented

- Event CRUD (create, list, get with attendance)
- Student management (create, list with search, detail with history)
- Attendance recording (single + batch, auto-creates students by name)
- Mailing list (add, list, CSV export, delete)
- Photo upload to R2 (attendance sheets and table photos)
- OCR processing with Claude Vision API (scan, review, confirm workflow)
- API key authentication
- D1 schema with 6 tables, CHECK constraints, indexes, and cascading deletes

### What's not yet implemented

- Web UI (Phase 4)
- Flashcard app (Phase 5)
- Online class support (Phase 6)
- Production deployment

## Local Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
cd worker
npm install
npm run db:migrate:local
```

### Run the dev server

```bash
npm run dev
```

The server starts at `http://localhost:8787`. Local D1 and R2 are emulated by Miniflare — no Cloudflare account needed.

Auth key for local dev is set in `.dev.vars` (not committed to git).

### Test it

```bash
# Health check (no auth)
curl http://localhost:8787/api/health

# Create an event
curl -X POST http://localhost:8787/api/events \
  -H "Authorization: Bearer dev-secret-key-for-testing" \
  -H "Content-Type: application/json" \
  -d '{"id":"A1B2C3D4","name":"Tuesday Beginner Bridge","date":"2026-02-10","teacher":"Rick"}'

# Record attendance (auto-creates student)
curl -X POST http://localhost:8787/api/events/A1B2C3D4/attendance \
  -H "Authorization: Bearer dev-secret-key-for-testing" \
  -H "Content-Type: application/json" \
  -d '{"student_name":"Alice Johnson","table_number":1,"seat":"N"}'

# Get event with attendance
curl http://localhost:8787/api/events/A1B2C3D4 \
  -H "Authorization: Bearer dev-secret-key-for-testing"
```

### Reset local database

Delete the `.wrangler/` directory and re-run migrations:

```bash
rm -rf .wrangler
npm run db:migrate:local
```

## Production Deployment

> **Not yet done.** These are the steps for when we're ready to go live.

### 1. Create Cloudflare resources

```bash
npx wrangler d1 create bridge-attendance
npx wrangler r2 bucket create bridge-attendance-photos
```

### 2. Update wrangler.toml

Replace `database_id = "local-dev-placeholder"` with the real ID printed by the `d1 create` command. Uncomment the `routes` section and update if needed.

### 3. Set secrets

```bash
npx wrangler secret put API_KEY
# Enter a strong secret when prompted
```

### 4. Apply remote migrations

```bash
npm run db:migrate
```

### 5. Deploy

```bash
npm run deploy
```

### 6. Configure DNS

Add a CNAME record for `attendance.harmonicsystems.com` pointing to the worker, or rely on the route pattern in `wrangler.toml`.

## API Reference

All endpoints (except health check) require `Authorization: Bearer <API_KEY>` header.

### Events

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/events` | Create event. Body: `{id?, name, date, teacher?, location?, type?}` |
| `GET` | `/api/events` | List events. Query: `?limit=20&offset=0` |
| `GET` | `/api/events/:id` | Get event with attendance records |

Event IDs are 8-char uppercase hex (e.g., `A1B2C3D4`). If `id` is omitted on create, the API generates one. The PDF tool generates these IDs, so you'll typically pass the ID from the printed sheet.

### Attendance

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/events/:id/attendance` | Record single. Body: `{student_name, table_number?, seat?}` |
| `POST` | `/api/events/:id/attendance/batch` | Batch record. Body: `{records: [...]}` |
| `DELETE` | `/api/events/:id/attendance/:studentId` | Remove record |

Students are auto-created by name if they don't exist yet.

### Students

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/students` | Create student. Body: `{name, email?}` |
| `GET` | `/api/students` | List students. Query: `?search=alice&limit=50&offset=0` |
| `GET` | `/api/students/:id` | Get student with attendance history |

### Mailing List

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/mailing-list` | Add entry. Body: `{name, email, event_id?}` |
| `GET` | `/api/mailing-list` | List all. Query: `?format=csv` for CSV export |
| `DELETE` | `/api/mailing-list/:id` | Remove entry |

### Photos

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/events/:id/photos` | Upload photo. Multipart: `photo` (file), `type` (attendance-sheet\|table-photo), `table_number` (if table-photo) |
| `GET` | `/api/events/:id/photos` | List photos for event |
| `GET` | `/photos/:key` | Serve photo from R2 |

### OCR / Scan

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/events/:id/scan` | Upload photo + run OCR synchronously. Multipart: `photo` (file). Returns extracted attendance data. |
| `GET` | `/api/events/:id/ocr` | List OCR jobs for event (with parsed results) |
| `GET` | `/api/events/:id/ocr/:jobId` | Get single OCR job with results |
| `POST` | `/api/events/:id/confirm` | Commit reviewed OCR results to attendance + mailing list. Body: `{ocr_job_id?, attendance: [{student_name, table_number?, seat?}], mailing_list: [{name, email}]}` |

The scan workflow:
1. `POST /scan` — upload a photo of an attendance sheet, get back extracted names/tables/seats
2. Review and edit the results (client-side)
3. `POST /confirm` — commit the reviewed data to the database

Requires `ANTHROPIC_API_KEY` in `.dev.vars` (or as a Cloudflare secret in production).

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check (no auth required) |

## Project Structure

```
worker/
├── package.json
├── tsconfig.json
├── wrangler.toml
├── .dev.vars              # Local secrets (not in git)
├── migrations/
│   └── 0001_initial_schema.sql
└── src/
    ├── index.ts           # Hono app entry point
    ├── types.ts           # TypeScript interfaces
    ├── errors.ts          # Error handling
    ├── middleware/
    │   └── auth.ts        # API key auth
    ├── api/
    │   ├── events.ts      # Event CRUD
    │   ├── students.ts    # Student CRUD
    │   ├── attendance.ts  # Attendance recording
    │   ├── mailing-list.ts
    │   ├── photos.ts      # R2 upload
    │   ├── scan.ts        # Photo upload + OCR
    │   ├── ocr.ts         # OCR job listing
    │   └── confirm.ts     # Commit OCR results
    ├── ocr/
    │   └── claude-vision.ts  # Claude Vision API integration
    ├── db/
    │   └── queries.ts     # All D1 queries
    └── utils/
        └── id.ts          # ID generation
```
