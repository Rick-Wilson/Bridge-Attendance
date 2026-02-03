# Bridge Class Attendance System

A toolset for tracking attendance at bridge classes, supporting both face-to-face and online sessions.

## Overview

This system consists of three main components:

1. **PDF Generator** (Rust CLI) - Creates printable attendance sheets with QR codes
2. **Web App** (Cloudflare Workers) - Camera-based capture and OCR processing
3. **Flashcard App** - Student name memorization tool using table photos

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge                          │
│                 attendance.harmonicsystems.com              │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Worker    │───▶│     D1      │    │     R2      │     │
│  │  (API +     │    │  (SQLite)   │    │  (Photos)   │     │
│  │  Web App)   │    │             │    │             │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│        │                                                    │
│        │ calls Claude API for OCR                          │
│        ▼                                                    │
│  ┌─────────────┐                                           │
│  │  Anthropic  │                                           │
│  │    API      │                                           │
│  └─────────────┘                                           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────┐
│  PDF Generator  │  (Local Rust CLI)
│  attendance-pdf │
└─────────────────┘
```

## Project Structure

```
bridge-attendance/
├── README.md
├── PROJECT_PLAN.md
├── attendance-pdf/          # Rust CLI for PDF generation
│   ├── Cargo.toml
│   ├── src/
│   │   └── main.rs
│   └── examples/
│       └── roster.json
├── worker/                  # Cloudflare Worker (API + Web App)
│   ├── package.json
│   ├── wrangler.toml
│   ├── src/
│   │   ├── index.ts
│   │   ├── api/
│   │   └── ocr/
│   └── frontend/
│       └── index.html
└── docs/
    ├── PDF_LAYOUT.md
    ├── API_SPEC.md
    └── DATA_MODEL.md
```

## Quick Start

### Generate an Attendance Sheet (today)

```bash
cd attendance-pdf
cargo run -- --name "Tuesday Beginner Bridge" --teacher "Rick" --rows 32
```

### With an existing roster

```bash
cargo run -- --name "Tuesday Beginner Bridge" --roster roster.json
```

## Development Phases

See [PROJECT_PLAN.md](PROJECT_PLAN.md) for detailed development phases and Claude Code prompts.

## License

MIT
