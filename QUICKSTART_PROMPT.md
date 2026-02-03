# Quick Start Prompt for Claude Code - Phase 1

Copy this prompt into Claude Code to implement the PDF generator:

---

I need to implement the PDF generation for my bridge class attendance system. The CLI structure is already in place in `src/main.rs` with clap argument parsing.

Please implement the full PDF generation with these requirements:

## PDF Layout (US Letter, 8.5" x 11")

1. **Header section** (top):
   - QR code (30mm square, top-left) encoding JSON: `{app: "bridge-attendance", event_id, name, date, teacher}`
   - Title "CLASS ATTENDANCE" in bold
   - Class name, date formatted nicely, teacher name
   - Location (if provided)
   - Short event ID for reference

2. **Attendance grid**:
   - Columns: NAME | TABLE | SEAT
   - Two modes based on whether --roster is provided:
     - **Blank mode**: Numbered rows (1, 2, 3...) with lines for writing names
     - **Roster mode**: Pre-printed names with checkboxes, plus 8 blank rows at bottom for new students
   - TABLE column: short line for writing table number
   - SEAT column: "N  S  E  W" text where students circle their position

3. **Mailing list section** (bottom, optional):
   - Header "JOIN OUR MAILING LIST"
   - Rows with "Name: _______ Email: _______" format
   - Number of rows controlled by --mailing-rows

## Technical Requirements

- Use `printpdf` for PDF generation
- Use `qrcode` crate to generate QR code, convert to image for embedding
- Built-in Helvetica fonts (no external font files)
- 15mm margins
- Row height should auto-adjust to fit available space (cap at 7mm)
- Output file defaults to `attendance-{date}.pdf` if not specified

## Dependencies (already in Cargo.toml)

```toml
printpdf = "0.7"
qrcode = "0.14"
image = "0.25"
chrono = "0.4"
clap = { version = "4", features = ["derive"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4"] }
thiserror = "1"
```

## Roster JSON Format

```json
[
  {"name": "Alice Johnson"},
  {"name": "Bob Smith"}
]
```

Please implement the complete `src/main.rs` with clean, well-organized code. Use helper functions for the different PDF sections.

---

## Testing Commands

After implementation, test with:

```bash
# Basic blank form
cargo run -- -n "Tuesday Beginner Bridge" -t "Rick"

# Fewer rows, no mailing list
cargo run -- -n "Advanced Class" --rows 20 --mailing-list false

# With roster
cargo run -- -n "Tuesday Beginner" --roster examples/roster.json

# Custom output file
cargo run -- -n "Test" -o my-attendance.pdf
```
