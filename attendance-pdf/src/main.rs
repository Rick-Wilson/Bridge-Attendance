// attendance-pdf: Generate attendance sheets for bridge classes

use chrono::{Local, NaiveDate};
use clap::Parser;
use ::image::{DynamicImage, Luma, Rgba, RgbImage};
use printpdf::*;
use qrcode::QrCode;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufWriter, Read};
use thiserror::Error;
use uuid::Uuid;

// ============================================================================
// Constants
// ============================================================================

/// US Letter dimensions in mm
const PAGE_WIDTH_MM: f32 = 215.9;
const PAGE_HEIGHT_MM: f32 = 279.4;

/// Margins
const MARGIN_MM: f32 = 15.0;

/// QR code size
const QR_SIZE_MM: f32 = 30.0;

/// Maximum row height for roster mode
const MAX_ROW_HEIGHT_MM: f32 = 9.0;

/// Row height for blank table/seat mode (larger for writing)
const TABLE_SEAT_ROW_HEIGHT_MM: f32 = 12.0;

/// Font sizes in points
const TITLE_FONT_SIZE: f32 = 18.0;
const HEADER_FONT_SIZE: f32 = 12.0;
const NORMAL_FONT_SIZE: f32 = 11.0;
const SMALL_FONT_SIZE: f32 = 9.0;

/// Column widths (proportional)
const NAME_COL_RATIO: f32 = 0.60;
const TABLE_COL_RATIO: f32 = 0.15;
const SEAT_COL_RATIO: f32 = 0.25;

// ============================================================================
// Error Handling
// ============================================================================

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Failed to create PDF: {0}")]
    PdfError(String),
    #[error("Failed to read roster file: {0}")]
    RosterError(String),
    #[error("Failed to generate QR code: {0}")]
    QrError(String),
    #[error("Invalid date format: {0}")]
    DateError(String),
    #[error("Failed to load logo: {0}")]
    LogoError(String),
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}

// ============================================================================
// Data Structures
// ============================================================================

/// CLI Arguments
#[derive(Parser, Debug)]
#[command(author, version, about = "Generate attendance sheets for bridge classes")]
struct Args {
    /// Class/event name
    #[arg(short, long)]
    name: String,

    /// Teacher name
    #[arg(short, long, default_value = "Rick")]
    teacher: String,

    /// Date (YYYY-MM-DD format, defaults to today)
    #[arg(short, long)]
    date: Option<String>,

    /// Location
    #[arg(short, long, default_value = "")]
    location: String,

    /// Number of blank rows for students (default 32)
    #[arg(short, long, default_value = "32")]
    rows: u32,

    /// Disable mailing list signup section
    #[arg(long)]
    no_mailing_list: bool,

    /// Number of mailing list signup rows (default 4)
    #[arg(long, default_value = "4")]
    mailing_rows: u32,

    /// Output filename (defaults to attendance-{date}.pdf)
    #[arg(short, long)]
    output: Option<String>,

    /// Student roster file (JSON array of names, optional)
    #[arg(long)]
    roster: Option<String>,

    /// Logo image (file path or URL) to display in header top-right
    #[arg(long)]
    logo: Option<String>,
}

/// Roster entry from JSON file
#[derive(Debug, Deserialize)]
struct RosterEntry {
    name: String,
}

/// QR code data payload
#[derive(Debug, Serialize)]
struct QrPayload {
    app: String,
    event_id: String,
    name: String,
    date: String,
    teacher: String,
}

/// Attendance sheet configuration
struct AttendanceConfig {
    class_name: String,
    teacher: String,
    date: NaiveDate,
    location: String,
    event_id: String,
    roster: Option<Vec<String>>,
    blank_rows: u32,
    mailing_list: bool,
    mailing_rows: u32,
    logo: Option<DynamicImage>,
}

// ============================================================================
// Main Entry Point
// ============================================================================

fn main() {
    if let Err(e) = run() {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}

fn run() -> Result<(), AppError> {
    let args = Args::parse();

    // Parse date
    let date = parse_date(&args.date)?;

    // Generate event ID
    let event_id = generate_short_id();

    // Load roster if provided
    let roster = load_roster(&args.roster)?;

    // Load logo if provided
    let logo = load_logo(&args.logo)?;

    // Create config
    let config = AttendanceConfig {
        class_name: args.name,
        teacher: args.teacher,
        date,
        location: args.location,
        event_id,
        roster,
        blank_rows: args.rows,
        mailing_list: !args.no_mailing_list,
        mailing_rows: args.mailing_rows,
        logo,
    };

    // Determine output filename
    let output_file = args.output.unwrap_or_else(|| {
        let sanitized_name = config
            .class_name
            .to_lowercase()
            .replace(' ', "-")
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '-')
            .collect::<String>();
        format!("attendance-{}-{}.pdf", config.date.format("%Y-%m-%d"), sanitized_name)
    });

    // Generate PDF
    generate_pdf(&config, &output_file)?;

    println!("✓ Generated: {}", output_file);
    println!("  Class: {}", config.class_name);
    println!("  Date: {}", format_date_display(&config.date));
    println!("  Event ID: {}", config.event_id);

    Ok(())
}

// ============================================================================
// Helper Functions
// ============================================================================

fn parse_date(date_str: &Option<String>) -> Result<NaiveDate, AppError> {
    match date_str {
        Some(s) => NaiveDate::parse_from_str(s, "%Y-%m-%d")
            .map_err(|_| AppError::DateError(s.clone())),
        None => Ok(Local::now().date_naive()),
    }
}

fn generate_short_id() -> String {
    let uuid = Uuid::new_v4();
    let hex = format!("{:x}", uuid);
    hex[..8].to_uppercase()
}

fn format_date_display(date: &NaiveDate) -> String {
    date.format("%A, %B %-d, %Y").to_string()
}

fn load_roster(path: &Option<String>) -> Result<Option<Vec<String>>, AppError> {
    match path {
        Some(p) => {
            let content = std::fs::read_to_string(p)
                .map_err(|e| AppError::RosterError(format!("{}: {}", p, e)))?;
            let entries: Vec<RosterEntry> = serde_json::from_str(&content)
                .map_err(|e| AppError::RosterError(format!("Invalid JSON: {}", e)))?;
            Ok(Some(entries.into_iter().map(|e| e.name).collect()))
        }
        None => Ok(None),
    }
}

fn load_logo(path: &Option<String>) -> Result<Option<DynamicImage>, AppError> {
    match path {
        Some(p) => {
            let image_bytes = if p.starts_with("http://") || p.starts_with("https://") {
                // Load from URL
                let response = ureq::get(p)
                    .call()
                    .map_err(|e| AppError::LogoError(format!("Failed to fetch URL: {}", e)))?;

                let mut bytes = Vec::new();
                response.into_reader()
                    .read_to_end(&mut bytes)
                    .map_err(|e| AppError::LogoError(format!("Failed to read response: {}", e)))?;
                bytes
            } else {
                // Load from file
                std::fs::read(p)
                    .map_err(|e| AppError::LogoError(format!("{}: {}", p, e)))?
            };

            let img = ::image::load_from_memory(&image_bytes)
                .map_err(|e| AppError::LogoError(format!("Failed to decode image: {}", e)))?;

            Ok(Some(img))
        }
        None => Ok(None),
    }
}

// ============================================================================
// QR Code Generation
// ============================================================================

fn generate_qr_image(config: &AttendanceConfig) -> Result<DynamicImage, AppError> {
    let payload = QrPayload {
        app: "bridge-attendance".to_string(),
        event_id: config.event_id.clone(),
        name: config.class_name.clone(),
        date: config.date.format("%Y-%m-%d").to_string(),
        teacher: config.teacher.clone(),
    };

    let json = serde_json::to_string(&payload)
        .map_err(|e| AppError::QrError(e.to_string()))?;

    let code = QrCode::new(json.as_bytes())
        .map_err(|e| AppError::QrError(e.to_string()))?;

    let image = code.render::<Luma<u8>>().build();
    Ok(DynamicImage::ImageLuma8(image))
}

// ============================================================================
// PDF Generation
// ============================================================================

fn generate_pdf(config: &AttendanceConfig, output_path: &str) -> Result<(), AppError> {
    // Create document
    let (doc, page1, layer1) = PdfDocument::new(
        "Attendance Sheet",
        Mm(PAGE_WIDTH_MM),
        Mm(PAGE_HEIGHT_MM),
        "Layer 1",
    );

    let mut current_layer = doc.get_page(page1).get_layer(layer1);

    // Load built-in fonts
    let font_regular = doc.add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| AppError::PdfError(e.to_string()))?;
    let font_bold = doc.add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| AppError::PdfError(e.to_string()))?;

    // Calculate layout
    let content_width = PAGE_WIDTH_MM - 2.0 * MARGIN_MM;
    let mut y_pos = PAGE_HEIGHT_MM - MARGIN_MM;

    // Draw header section (QR code + title + info)
    y_pos = draw_header_section(
        &doc,
        &current_layer,
        &font_regular,
        &font_bold,
        config,
        y_pos,
        content_width,
    )?;

    // Calculate available space for attendance grid and mailing list
    let mailing_height = if config.mailing_list {
        calculate_mailing_section_height(config.mailing_rows)
    } else {
        0.0
    };

    // For blank mode, use fixed row height and support multiple pages
    if config.roster.is_none() {
        let row_height = TABLE_SEAT_ROW_HEIGHT_MM;
        let first_page_available = y_pos - MARGIN_MM - mailing_height - 5.0;
        let continuation_page_available = PAGE_HEIGHT_MM - 2.0 * MARGIN_MM;

        let seats = ["North", "South", "East", "West"];
        let num_tables = (config.blank_rows + 3) / 4;
        let table_height = row_height * 4.0; // Height needed for one complete table

        let mut space_remaining = first_page_available;

        for table in 1..=num_tables {
            // Check if we need a new page before starting this table
            // Keep tables together - don't split across pages
            if space_remaining < table_height {
                let (new_page, new_layer) = doc.add_page(
                    Mm(PAGE_WIDTH_MM),
                    Mm(PAGE_HEIGHT_MM),
                    "Layer 1",
                );
                current_layer = doc.get_page(new_page).get_layer(new_layer);
                y_pos = PAGE_HEIGHT_MM - MARGIN_MM;
                space_remaining = continuation_page_available;
            }

            // Draw all 4 seats for this table
            for (seat_idx, seat) in seats.iter().enumerate() {
                let current_row = (table - 1) * 4 + seat_idx as u32;
                if current_row >= config.blank_rows {
                    break;
                }

                let is_first_seat = seat_idx == 0;
                let is_last_seat = seat_idx == 3;
                draw_table_seat_row(
                    &current_layer,
                    &font_regular,
                    y_pos,
                    MARGIN_MM,
                    content_width,
                    row_height,
                    table,
                    seat,
                    is_first_seat,
                    is_last_seat,
                );
                y_pos -= row_height;
                space_remaining -= row_height;
            }
        }
    } else {
        // Roster mode - single page with adaptive row height
        let grid_available_height = y_pos - MARGIN_MM - mailing_height - 5.0;
        let _ = draw_attendance_grid(
            &current_layer,
            &font_regular,
            &font_bold,
            config,
            y_pos,
            content_width,
            grid_available_height,
        )?;
    }

    // Draw mailing list section if enabled (always on first page)
    if config.mailing_list {
        let has_starred = config.roster.as_ref()
            .map(|r| r.iter().any(|name| name.contains('*')))
            .unwrap_or(false);
        let first_layer = doc.get_page(page1).get_layer(layer1);
        draw_mailing_section(
            &first_layer,
            &font_regular,
            &font_bold,
            config.mailing_rows,
            MARGIN_MM,
            content_width,
            has_starred,
        )?;
    }

    // Save PDF
    let file = File::create(output_path)?;
    let mut writer = BufWriter::new(file);
    doc.save(&mut writer)
        .map_err(|e| AppError::PdfError(e.to_string()))?;

    Ok(())
}

// ============================================================================
// Header Section
// ============================================================================

fn draw_header_section(
    doc: &PdfDocumentReference,
    layer: &PdfLayerReference,
    font_regular: &IndirectFontRef,
    font_bold: &IndirectFontRef,
    config: &AttendanceConfig,
    start_y: f32,
    content_width: f32,
) -> Result<f32, AppError> {
    let y_pos = start_y;

    // Generate and embed QR code
    let qr_image = generate_qr_image(config)?;
    embed_qr_code(doc, layer, &qr_image, MARGIN_MM, y_pos - QR_SIZE_MM)?;

    // Title and info to the right of QR code
    let text_x = MARGIN_MM + QR_SIZE_MM + 8.0;
    let _text_width = content_width - QR_SIZE_MM - 8.0;

    // Title
    layer.use_text(
        "CLASS ATTENDANCE",
        TITLE_FONT_SIZE,
        Mm(text_x),
        Mm(y_pos - 6.0),
        font_bold,
    );

    // Class name
    layer.use_text(
        &config.class_name,
        HEADER_FONT_SIZE,
        Mm(text_x),
        Mm(y_pos - 14.0),
        font_bold,
    );

    // Date
    layer.use_text(
        &format_date_display(&config.date),
        NORMAL_FONT_SIZE,
        Mm(text_x),
        Mm(y_pos - 20.0),
        font_regular,
    );

    // Teacher
    layer.use_text(
        &format!("Instructor: {}", config.teacher),
        NORMAL_FONT_SIZE,
        Mm(text_x),
        Mm(y_pos - 26.0),
        font_regular,
    );

    // Location (if provided)
    let mut info_y = y_pos - 26.0;
    if !config.location.is_empty() {
        info_y -= 5.0;
        layer.use_text(
            &format!("Location: {}", config.location),
            NORMAL_FONT_SIZE,
            Mm(text_x),
            Mm(info_y),
            font_regular,
        );
    }

    // Logo in top-right (if provided)
    let logo_max_width = 50.0;
    let logo_max_height = QR_SIZE_MM;
    let right_edge = MARGIN_MM + content_width;

    if let Some(ref logo) = config.logo {
        embed_logo(
            layer,
            logo,
            logo_max_width,
            logo_max_height,
            right_edge,
            y_pos,
        )?;
    }

    // Event ID (right-aligned, below logo area)
    let event_id_text = format!("ID: {}", config.event_id);
    let right_x = MARGIN_MM + content_width - 25.0;
    layer.use_text(
        &event_id_text,
        SMALL_FONT_SIZE,
        Mm(right_x),
        Mm(y_pos - QR_SIZE_MM - 2.0),
        font_regular,
    );

    // Return Y position after header (below QR code with some spacing)
    Ok(y_pos - QR_SIZE_MM - 8.0)
}

fn embed_qr_code(
    _doc: &PdfDocumentReference,
    layer: &PdfLayerReference,
    qr_image: &DynamicImage,
    x: f32,
    y: f32,
) -> Result<(), AppError> {
    let rgb_image = qr_image.to_rgb8();
    let (width, height) = rgb_image.dimensions();

    // Convert to raw RGB bytes
    let raw_pixels = rgb_image.into_raw();

    // Create image for printpdf
    let image = Image::from(ImageXObject {
        width: Px(width as usize),
        height: Px(height as usize),
        color_space: ColorSpace::Rgb,
        bits_per_component: ColorBits::Bit8,
        interpolate: false,
        image_data: raw_pixels,
        image_filter: None,
        clipping_bbox: None,
        smask: None,
    });

    // Calculate DPI to achieve desired physical size
    // QR_SIZE_MM is the desired size, image dimensions are in pixels
    // DPI = pixels / (mm / 25.4)
    let dpi = (width as f32) / (QR_SIZE_MM / 25.4);

    image.add_to_layer(
        layer.clone(),
        ImageTransform {
            translate_x: Some(Mm(x)),
            translate_y: Some(Mm(y)),
            dpi: Some(dpi),
            ..Default::default()
        },
    );

    Ok(())
}

fn embed_logo(
    layer: &PdfLayerReference,
    logo_image: &DynamicImage,
    max_width_mm: f32,
    max_height_mm: f32,
    right_edge_x: f32,
    top_y: f32,
) -> Result<(), AppError> {
    // Convert to RGBA first to handle transparency
    let rgba_image = logo_image.to_rgba8();
    let (width_px, height_px) = rgba_image.dimensions();

    // Composite against white background
    let mut rgb_image = RgbImage::new(width_px, height_px);
    for (x, y, pixel) in rgba_image.enumerate_pixels() {
        let Rgba([r, g, b, a]) = *pixel;
        let alpha = a as f32 / 255.0;
        let bg = 255.0; // White background
        let out_r = (r as f32 * alpha + bg * (1.0 - alpha)) as u8;
        let out_g = (g as f32 * alpha + bg * (1.0 - alpha)) as u8;
        let out_b = (b as f32 * alpha + bg * (1.0 - alpha)) as u8;
        rgb_image.put_pixel(x, y, ::image::Rgb([out_r, out_g, out_b]));
    }

    // Calculate dimensions preserving aspect ratio
    let aspect_ratio = width_px as f32 / height_px as f32;
    let (final_width_mm, final_height_mm) = if max_width_mm / max_height_mm > aspect_ratio {
        // Height-constrained
        (max_height_mm * aspect_ratio, max_height_mm)
    } else {
        // Width-constrained
        (max_width_mm, max_width_mm / aspect_ratio)
    };

    // Calculate position (right-aligned, top-aligned)
    let x = right_edge_x - final_width_mm;
    let y = top_y - final_height_mm;

    // Convert to raw RGB bytes
    let raw_pixels = rgb_image.into_raw();

    // Create image for printpdf
    let image = Image::from(ImageXObject {
        width: Px(width_px as usize),
        height: Px(height_px as usize),
        color_space: ColorSpace::Rgb,
        bits_per_component: ColorBits::Bit8,
        interpolate: true,
        image_data: raw_pixels,
        image_filter: None,
        clipping_bbox: None,
        smask: None,
    });

    // Calculate DPI to achieve desired physical size
    let dpi = (width_px as f32) / (final_width_mm / 25.4);

    image.add_to_layer(
        layer.clone(),
        ImageTransform {
            translate_x: Some(Mm(x)),
            translate_y: Some(Mm(y)),
            dpi: Some(dpi),
            ..Default::default()
        },
    );

    Ok(())
}

// ============================================================================
// Attendance Grid
// ============================================================================

fn draw_attendance_grid(
    layer: &PdfLayerReference,
    font_regular: &IndirectFontRef,
    font_bold: &IndirectFontRef,
    config: &AttendanceConfig,
    start_y: f32,
    content_width: f32,
    available_height: f32,
) -> Result<f32, AppError> {
    match &config.roster {
        Some(roster) => {
            // Two-column roster layout
            let col_gap = 6.0; // Gap between columns
            let col_width = (content_width - col_gap) / 2.0;
            let header_row_height = 6.0;
            let blank_rows = 4; // Blank rows per column for walk-ins

            // Split roster into two columns
            let total_roster = roster.len();
            let left_count = (total_roster + 1) / 2; // Left gets the extra one if odd
            let right_count = total_roster - left_count;

            // Total rows per column = roster names + blank rows
            let left_total = left_count as u32 + blank_rows;
            let right_total = right_count as u32 + blank_rows;
            let max_rows = left_total.max(right_total);

            let available_for_data = available_height - header_row_height;
            let row_height = (available_for_data / max_rows as f32).min(MAX_ROW_HEIGHT_MM);

            // Draw left column
            let left_x = MARGIN_MM;
            draw_roster_column(
                layer,
                font_regular,
                font_bold,
                &roster[..left_count],
                left_x,
                col_width,
                start_y,
                row_height,
                header_row_height,
                blank_rows,
            );

            // Draw right column
            let right_x = MARGIN_MM + col_width + col_gap;
            draw_roster_column(
                layer,
                font_regular,
                font_bold,
                &roster[left_count..],
                right_x,
                col_width,
                start_y,
                row_height,
                header_row_height,
                blank_rows,
            );

            let rows_drawn = max_rows as f32 + 1.0; // +1 for header
            Ok(start_y - header_row_height - rows_drawn * row_height)
        }
        None => {
            // Blank mode is now handled directly in generate_pdf for multi-page support
            unreachable!("Blank mode should be handled in generate_pdf");
        }
    }
}

fn draw_roster_column(
    layer: &PdfLayerReference,
    font_regular: &IndirectFontRef,
    font_bold: &IndirectFontRef,
    names: &[String],
    x_start: f32,
    col_width: f32,
    start_y: f32,
    row_height: f32,
    header_row_height: f32,
    blank_rows: u32,
) {
    let name_width = col_width * NAME_COL_RATIO;
    let table_width = col_width * TABLE_COL_RATIO;
    let seat_width = col_width * SEAT_COL_RATIO;

    let col_name_x = x_start;
    let col_table_x = x_start + name_width;
    let col_seat_x = col_table_x + table_width;

    let mut y_pos = start_y;

    // Draw header
    draw_grid_header(
        layer,
        font_bold,
        y_pos,
        col_name_x,
        col_table_x,
        col_seat_x,
        name_width,
        table_width,
        seat_width,
        header_row_height,
    );
    y_pos -= header_row_height;

    // Draw roster names
    for name in names.iter() {
        draw_roster_row(
            layer,
            font_regular,
            y_pos,
            col_name_x,
            col_table_x,
            col_seat_x,
            name_width,
            table_width,
            seat_width,
            row_height,
            name,
        );
        y_pos -= row_height;
    }

    // Draw blank rows for walk-ins
    for i in 0..blank_rows {
        draw_blank_row(
            layer,
            font_regular,
            y_pos,
            col_name_x,
            col_table_x,
            col_seat_x,
            name_width,
            table_width,
            seat_width,
            row_height,
            names.len() as u32 + i + 1,
            false,
        );
        y_pos -= row_height;
    }
}

fn draw_grid_header(
    layer: &PdfLayerReference,
    font_bold: &IndirectFontRef,
    y: f32,
    col_name_x: f32,
    col_table_x: f32,
    col_seat_x: f32,
    _name_width: f32,
    _table_width: f32,
    seat_width: f32,
    row_height: f32,
) {
    let text_y = y - row_height / 2.0 - 1.5;

    // Column headers
    layer.use_text("NAME", NORMAL_FONT_SIZE, Mm(col_name_x + 2.0), Mm(text_y), font_bold);
    layer.use_text("TABLE", SMALL_FONT_SIZE, Mm(col_table_x + 2.0), Mm(text_y), font_bold);
    layer.use_text("SEAT", SMALL_FONT_SIZE, Mm(col_seat_x + 2.0), Mm(text_y), font_bold);

    // Draw header border
    let line_color = Color::Rgb(Rgb::new(0.0, 0.0, 0.0, None));
    layer.set_outline_color(line_color);
    layer.set_outline_thickness(0.5);

    // Bottom line of header
    draw_line(layer, col_name_x, y - row_height, col_seat_x + seat_width, y - row_height);
}

fn draw_roster_row(
    layer: &PdfLayerReference,
    font_regular: &IndirectFontRef,
    y: f32,
    col_name_x: f32,
    col_table_x: f32,
    col_seat_x: f32,
    _name_width: f32,
    table_width: f32,
    seat_width: f32,
    row_height: f32,
    name: &str,
) {
    let text_y = y - row_height / 2.0 - 1.5;
    let checkbox_size = 3.0;

    // Draw checkbox
    draw_checkbox(layer, col_name_x + 1.0, text_y - 0.5, checkbox_size);

    // Draw name
    layer.use_text(
        name,
        NORMAL_FONT_SIZE,
        Mm(col_name_x + checkbox_size + 3.0),
        Mm(text_y),
        font_regular,
    );

    // Draw table column line
    draw_line(layer, col_table_x + 2.0, text_y - 0.5, col_table_x + table_width - 1.0, text_y - 0.5);

    // Draw seat options
    layer.use_text("N  S  E  W", NORMAL_FONT_SIZE, Mm(col_seat_x + 1.0), Mm(text_y), font_regular);

    // Draw row bottom line
    let line_color = Color::Rgb(Rgb::new(0.8, 0.8, 0.8, None));
    layer.set_outline_color(line_color);
    layer.set_outline_thickness(0.3);
    draw_line(layer, col_name_x, y - row_height, col_seat_x + seat_width, y - row_height);
}

fn draw_blank_row(
    layer: &PdfLayerReference,
    font_regular: &IndirectFontRef,
    y: f32,
    col_name_x: f32,
    _col_table_x: f32,
    col_seat_x: f32,
    _name_width: f32,
    _table_width: f32,
    seat_width: f32,
    row_height: f32,
    row_num: u32,
    show_number: bool,
) {
    let text_y = y - row_height / 2.0 - 1.5;

    // Row number or empty
    if show_number {
        layer.use_text(
            &format!("{}.", row_num),
            SMALL_FONT_SIZE,
            Mm(col_name_x + 1.0),
            Mm(text_y),
            font_regular,
        );
    }

    // Seat options
    layer.use_text("N  S  E  W", NORMAL_FONT_SIZE, Mm(col_seat_x + 1.0), Mm(text_y), font_regular);

    // Row bottom line
    let line_color = Color::Rgb(Rgb::new(0.8, 0.8, 0.8, None));
    layer.set_outline_color(line_color);
    layer.set_outline_thickness(0.3);
    draw_line(layer, col_name_x, y - row_height, col_seat_x + seat_width, y - row_height);
}

fn draw_table_seat_row(
    layer: &PdfLayerReference,
    font_regular: &IndirectFontRef,
    y: f32,
    x_start: f32,
    content_width: f32,
    row_height: f32,
    table_num: u32,
    seat: &str,
    is_first_seat: bool,
    is_last_seat: bool,
) {
    let text_y = y - row_height / 2.0 - 1.5; // Center text vertically in row
    let table_col_width = 22.0; // Width for "Table X" column
    let seat_col_start = x_start + table_col_width;

    // Draw table number only on first seat (North)
    if is_first_seat {
        layer.use_text(
            &format!("Table {}", table_num),
            NORMAL_FONT_SIZE,
            Mm(x_start + 2.0),
            Mm(text_y),
            font_regular,
        );
    }

    // Draw seat name
    layer.use_text(
        seat,
        NORMAL_FONT_SIZE,
        Mm(seat_col_start + 2.0),
        Mm(text_y),
        font_regular,
    );

    // Draw row separator line (starts at seat column, not table column)
    // For last seat (West), draw full-width line as table separator
    let line_color = Color::Rgb(Rgb::new(0.7, 0.7, 0.7, None));
    layer.set_outline_color(line_color);
    layer.set_outline_thickness(0.3);

    let line_start = if is_last_seat { x_start } else { seat_col_start };
    draw_line(layer, line_start, y - row_height, x_start + content_width, y - row_height);
}

fn draw_checkbox(layer: &PdfLayerReference, x: f32, y: f32, size: f32) {
    let line_color = Color::Rgb(Rgb::new(0.0, 0.0, 0.0, None));
    layer.set_outline_color(line_color);
    layer.set_outline_thickness(0.4);

    // Draw square
    draw_line(layer, x, y, x + size, y);
    draw_line(layer, x + size, y, x + size, y + size);
    draw_line(layer, x + size, y + size, x, y + size);
    draw_line(layer, x, y + size, x, y);
}

// ============================================================================
// Mailing List Section
// ============================================================================

fn calculate_mailing_section_height(_rows: u32) -> f32 {
    // Fixed height regardless of row count (equivalent to old 6-row layout)
    // This keeps the section size consistent while allowing variable row counts
    47.0
}

fn draw_mailing_section(
    layer: &PdfLayerReference,
    font_regular: &IndirectFontRef,
    font_bold: &IndirectFontRef,
    rows: u32,
    x_start: f32,
    content_width: f32,
    has_starred: bool,
) -> Result<(), AppError> {
    let section_height = calculate_mailing_section_height(rows);
    let y_bottom = MARGIN_MM;
    let y_top = y_bottom + section_height;

    // Draw section border
    let line_color = Color::Rgb(Rgb::new(0.0, 0.0, 0.0, None));
    layer.set_outline_color(line_color);
    layer.set_outline_thickness(0.5);

    // Top line
    draw_line(layer, x_start, y_top, x_start + content_width, y_top);

    // Section header
    let header_y = y_top - 6.0;
    let header_text = if has_starred {
        "* JOIN MY MAILING LIST"
    } else {
        "JOIN MY MAILING LIST"
    };
    layer.use_text(
        header_text,
        NORMAL_FONT_SIZE,
        Mm(x_start + content_width / 2.0 - 20.0),
        Mm(header_y),
        font_bold,
    );

    // Draw rows - spread evenly in available space
    let header_space = 10.0; // Space used by header
    let available_for_rows = section_height - header_space - 3.0; // minus padding
    let row_height = available_for_rows / rows as f32;
    let mut y = y_top - header_space;

    for _ in 0..rows {
        // Name field
        layer.use_text(
            "Name:",
            SMALL_FONT_SIZE,
            Mm(x_start + 2.0),
            Mm(y),
            font_regular,
        );
        draw_line(layer, x_start + 15.0, y - 0.5, x_start + content_width * 0.45, y - 0.5);

        // Email field
        layer.use_text(
            "Email:",
            SMALL_FONT_SIZE,
            Mm(x_start + content_width * 0.48),
            Mm(y),
            font_regular,
        );
        draw_line(
            layer,
            x_start + content_width * 0.48 + 12.0,
            y - 0.5,
            x_start + content_width - 2.0,
            y - 0.5,
        );

        y -= row_height;
    }

    Ok(())
}

// ============================================================================
// Drawing Utilities
// ============================================================================

fn draw_line(layer: &PdfLayerReference, x1: f32, y1: f32, x2: f32, y2: f32) {
    let points = vec![
        (Point::new(Mm(x1), Mm(y1)), false),
        (Point::new(Mm(x2), Mm(y2)), false),
    ];
    let line = Line {
        points,
        is_closed: false,
    };
    layer.add_line(line);
}
