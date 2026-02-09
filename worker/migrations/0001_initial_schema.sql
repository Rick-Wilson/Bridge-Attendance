-- Events (class sessions)
CREATE TABLE events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    teacher TEXT NOT NULL DEFAULT 'Rick',
    location TEXT DEFAULT '',
    type TEXT NOT NULL DEFAULT 'face_to_face'
        CHECK(type IN ('face_to_face', 'online')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Students (built up over time from attendance)
CREATE TABLE students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    photo_url TEXT,
    first_event_id TEXT REFERENCES events(id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_students_name ON students(name);

-- Attendance records
CREATE TABLE attendance (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    table_number INTEGER,
    seat TEXT CHECK(seat IS NULL OR seat IN ('N', 'S', 'E', 'W')),
    source TEXT NOT NULL DEFAULT 'manual'
        CHECK(source IN ('ocr', 'manual', 'online')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE(event_id, student_id)
);
CREATE INDEX idx_attendance_event ON attendance(event_id);
CREATE INDEX idx_attendance_student ON attendance(student_id);

-- Table photos (for flashcard feature)
CREATE TABLE table_photos (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    table_number INTEGER NOT NULL,
    r2_key TEXT NOT NULL,
    processed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Mailing list signups
CREATE TABLE mailing_list (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    event_id TEXT REFERENCES events(id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- OCR processing queue
CREATE TABLE ocr_jobs (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    r2_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'processing', 'complete', 'failed')),
    result_json TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    processed_at TEXT
);
