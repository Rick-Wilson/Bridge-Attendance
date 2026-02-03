# CLAUDE.md - Project Context for Claude Code

## Project Overview

Bridge Class Attendance System - a toolset for tracking attendance at bridge classes.

**Owner**: Rick
**Primary Use**: Face-to-face and online bridge class attendance tracking

## Architecture

- **PDF Generator**: Rust CLI (`attendance-pdf/`) - generates printable attendance sheets
- **Backend**: Cloudflare Workers + D1 + R2 (planned, `worker/`)
- **OCR**: Claude Vision API for processing photographed sheets
- **Hosting**: attendance.harmonicsystems.com (via Cloudflare)

## Current Phase

**Phase 1: PDF Generator** (PRIORITY - needed for today's classes)

## Key Commands

```bash
# Build and run PDF generator
cd attendance-pdf
cargo build --release
cargo run -- --name "Class Name" --teacher "Rick" --rows 32

# With roster
cargo run -- --name "Class Name" --roster examples/roster.json
```

## Code Style Preferences

- Rust: Use `thiserror` for error handling, prefer explicit types
- Keep functions small and focused
- Comprehensive CLI help text
- Comments for non-obvious logic

## File Locations

- `PROJECT_PLAN.md` - Detailed phases and Claude Code prompts
- `attendance-pdf/` - Rust CLI tool
- `worker/` - Cloudflare Worker (future)
- `docs/` - Additional documentation

## Dependencies (PDF Generator)

- `printpdf` - PDF generation
- `qrcode` + `image` - QR code generation
- `clap` - CLI parsing
- `chrono` - Date handling
- `serde` / `serde_json` - JSON serialization
- `uuid` - Event ID generation

## Testing

For the PDF generator, test with:
```bash
# Blank form (no roster)
cargo run -- -n "Tuesday Beginner" -t "Rick" -r 28 -o test-blank.pdf

# With mailing list disabled
cargo run -- -n "Tuesday Beginner" --mailing-list false -o test-no-mail.pdf
```

## Common Issues

- QR code sizing: Target 30mm square for reliable scanning
- Font: Using built-in Helvetica (no external font files needed)
- Page layout: US Letter (8.5" x 11"), 15mm margins

## Next Steps After Phase 1

1. Set up GitHub repo
2. Create Cloudflare Worker skeleton
3. Define D1 schema
4. Implement basic API
