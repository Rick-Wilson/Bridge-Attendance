use std::fs;
use std::path::Path;
use std::process::Command;

fn cargo_bin() -> Command {
    Command::new(env!("CARGO_BIN_EXE_attendance-pdf"))
}

fn output_dir() -> &'static Path {
    Path::new("tests/output")
}

fn setup() {
    fs::create_dir_all(output_dir()).expect("Failed to create output directory");
}

fn cleanup_file(name: &str) {
    let path = output_dir().join(name);
    if path.exists() {
        fs::remove_file(&path).ok();
    }
}

#[test]
fn test_basic_blank_form() {
    setup();
    let output_file = "test-basic-blank.pdf";
    cleanup_file(output_file);

    let output = cargo_bin()
        .args([
            "-n", "Tuesday Beginner Bridge",
            "-t", "Rick",
            "-o", &format!("tests/output/{}", output_file),
        ])
        .output()
        .expect("Failed to execute command");

    assert!(output.status.success(), "Command failed: {:?}", output);

    let path = output_dir().join(output_file);
    assert!(path.exists(), "PDF file was not created");

    let metadata = fs::metadata(&path).expect("Failed to get file metadata");
    assert!(metadata.len() > 1000, "PDF file is too small, likely empty or corrupt");
}

#[test]
fn test_fewer_rows_no_mailing_list() {
    setup();
    let output_file = "test-fewer-rows.pdf";
    cleanup_file(output_file);

    let output = cargo_bin()
        .args([
            "-n", "Advanced Class",
            "--rows", "20",
            "--no-mailing-list",
            "-o", &format!("tests/output/{}", output_file),
        ])
        .output()
        .expect("Failed to execute command");

    assert!(output.status.success(), "Command failed: {:?}", output);

    let path = output_dir().join(output_file);
    assert!(path.exists(), "PDF file was not created");

    let metadata = fs::metadata(&path).expect("Failed to get file metadata");
    assert!(metadata.len() > 1000, "PDF file is too small");
}

#[test]
fn test_with_roster() {
    setup();
    let output_file = "test-with-roster.pdf";
    cleanup_file(output_file);

    let output = cargo_bin()
        .args([
            "-n", "Tuesday Beginner",
            "--roster", "examples/roster.json",
            "-o", &format!("tests/output/{}", output_file),
        ])
        .output()
        .expect("Failed to execute command");

    assert!(output.status.success(), "Command failed: {:?}", output);

    let path = output_dir().join(output_file);
    assert!(path.exists(), "PDF file was not created");

    let metadata = fs::metadata(&path).expect("Failed to get file metadata");
    assert!(metadata.len() > 1000, "PDF file is too small");
}

#[test]
fn test_with_location() {
    setup();
    let output_file = "test-with-location.pdf";
    cleanup_file(output_file);

    let output = cargo_bin()
        .args([
            "-n", "Test Class",
            "-l", "Community Center",
            "-t", "Jane",
            "-o", &format!("tests/output/{}", output_file),
        ])
        .output()
        .expect("Failed to execute command");

    assert!(output.status.success(), "Command failed: {:?}", output);

    let path = output_dir().join(output_file);
    assert!(path.exists(), "PDF file was not created");

    let metadata = fs::metadata(&path).expect("Failed to get file metadata");
    assert!(metadata.len() > 1000, "PDF file is too small");
}

#[test]
fn test_custom_date() {
    setup();
    let output_file = "test-custom-date.pdf";
    cleanup_file(output_file);

    let output = cargo_bin()
        .args([
            "-n", "Special Event",
            "-d", "2025-12-25",
            "-o", &format!("tests/output/{}", output_file),
        ])
        .output()
        .expect("Failed to execute command");

    assert!(output.status.success(), "Command failed: {:?}", output);

    let path = output_dir().join(output_file);
    assert!(path.exists(), "PDF file was not created");
}

#[test]
fn test_custom_mailing_rows() {
    setup();
    let output_file = "test-mailing-rows.pdf";
    cleanup_file(output_file);

    let output = cargo_bin()
        .args([
            "-n", "Mailing Test",
            "--mailing-rows", "4",
            "-o", &format!("tests/output/{}", output_file),
        ])
        .output()
        .expect("Failed to execute command");

    assert!(output.status.success(), "Command failed: {:?}", output);

    let path = output_dir().join(output_file);
    assert!(path.exists(), "PDF file was not created");
}

#[test]
fn test_invalid_roster_file() {
    let output = cargo_bin()
        .args([
            "-n", "Test",
            "--roster", "nonexistent.json",
            "-o", "tests/output/should-not-exist.pdf",
        ])
        .output()
        .expect("Failed to execute command");

    assert!(!output.status.success(), "Command should have failed for missing roster");
}

#[test]
fn test_invalid_date_format() {
    let output = cargo_bin()
        .args([
            "-n", "Test",
            "-d", "not-a-date",
            "-o", "tests/output/should-not-exist.pdf",
        ])
        .output()
        .expect("Failed to execute command");

    assert!(!output.status.success(), "Command should have failed for invalid date");
}
