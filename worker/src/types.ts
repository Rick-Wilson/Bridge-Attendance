// Cloudflare Worker bindings
export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  API_KEY: string;
  ANTHROPIC_API_KEY: string;
  ENVIRONMENT: string;
}

// Database row types

export interface EventRow {
  id: string;
  name: string;
  date: string;
  teacher: string;
  location: string;
  type: string;
  created_at: string;
}

export interface StudentRow {
  id: string;
  name: string;
  email: string | null;
  photo_url: string | null;
  first_event_id: string | null;
  created_at: string;
}

export interface AttendanceRow {
  id: string;
  event_id: string;
  student_id: string;
  table_number: number | null;
  seat: string | null;
  source: string;
  created_at: string;
}

export interface TablePhotoRow {
  id: string;
  event_id: string;
  table_number: number;
  r2_key: string;
  processed: number;
  created_at: string;
}

export interface MailingListRow {
  id: string;
  name: string;
  email: string;
  event_id: string | null;
  created_at: string;
}

export interface OcrJobRow {
  id: string;
  event_id: string;
  r2_key: string;
  status: string;
  result_json: string | null;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

// API request bodies

export interface CreateEventBody {
  id?: string;
  name: string;
  date: string;
  teacher?: string;
  location?: string;
  type?: 'face_to_face' | 'online';
}

export interface CreateStudentBody {
  name: string;
  email?: string;
  first_event_id?: string;
}

export interface RecordAttendanceBody {
  student_name: string;
  table_number?: number;
  seat?: string;
  source?: string;
}

export interface BatchAttendanceBody {
  records: RecordAttendanceBody[];
}

export interface AddMailingListBody {
  name: string;
  email: string;
  event_id?: string;
}

// API response types

export interface AttendanceWithStudent extends AttendanceRow {
  student_name: string;
  student_email: string | null;
}

export interface EventWithAttendance extends EventRow {
  attendance: AttendanceWithStudent[];
}

export interface StudentWithHistory extends StudentRow {
  attendance: Array<{
    event_id: string;
    event_name: string;
    event_date: string;
    table_number: number | null;
    seat: string | null;
  }>;
}

// ============================================================================
// OCR Types
// ============================================================================

/** QR code payload encoded on attendance sheets */
export interface QrPayload {
  app: string;
  event_id: string;
  name: string;
  date: string;
  teacher: string;
}

/** Structured result from Claude Vision OCR */
export interface OcrResult {
  qr_data: QrPayload | null;
  form_type: 'blank' | 'roster';
  attendance: OcrAttendanceEntry[];
  mailing_list: OcrMailingListEntry[];
  confidence: number;
  notes: string;
}

export interface OcrAttendanceEntry {
  name: string;
  table_number: number | null;
  seat: string | null;
  is_checked: boolean | null;
  confidence: number;
}

export interface OcrMailingListEntry {
  name: string;
  email: string;
  confidence: number;
}

/** Request body for POST /api/events/:id/confirm */
export interface ConfirmOcrBody {
  ocr_job_id?: string;
  attendance: Array<{
    student_name: string;
    table_number?: number;
    seat?: string;
  }>;
  mailing_list: Array<{
    name: string;
    email: string;
  }>;
}
