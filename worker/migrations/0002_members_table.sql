-- Members table: canonical mailing list roster (imported from groups.io)
-- Distinct from mailing_list table which captures sign-up requests from attendance sheets.
CREATE TABLE members (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    joined_date TEXT,
    declined INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_members_name ON members(name);
CREATE INDEX idx_members_email ON members(email);
