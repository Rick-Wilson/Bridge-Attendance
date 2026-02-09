import type {
  EventRow,
  StudentRow,
  AttendanceRow,
  AttendanceWithStudent,
  MailingListRow,
  MemberRow,
  TablePhotoRow,
  OcrJobRow,
} from '../types';
import { generateId } from '../utils/id';

// ============================================================================
// Events
// ============================================================================

export async function insertEvent(
  db: D1Database,
  event: { id: string; name: string; date: string; teacher: string; location: string; type: string },
): Promise<EventRow> {
  await db
    .prepare(
      'INSERT INTO events (id, name, date, teacher, location, type) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(event.id, event.name, event.date, event.teacher, event.location, event.type)
    .run();
  return (await getEventById(db, event.id))!;
}

export async function listEvents(
  db: D1Database,
  limit: number,
  offset: number,
): Promise<{ events: EventRow[]; total: number }> {
  const countResult = await db.prepare('SELECT COUNT(*) as total FROM events').first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const { results } = await db
    .prepare('SELECT * FROM events ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?')
    .bind(limit, offset)
    .all<EventRow>();

  return { events: results, total };
}

export async function getEventById(db: D1Database, id: string): Promise<EventRow | null> {
  return db.prepare('SELECT * FROM events WHERE id = ?').bind(id).first<EventRow>();
}

export async function getEventWithAttendance(
  db: D1Database,
  id: string,
): Promise<{ event: EventRow; attendance: AttendanceWithStudent[] } | null> {
  const event = await getEventById(db, id);
  if (!event) return null;

  const { results: attendance } = await db
    .prepare(
      `SELECT a.*, s.name as student_name, s.email as student_email
       FROM attendance a
       JOIN students s ON a.student_id = s.id
       WHERE a.event_id = ?
       ORDER BY a.table_number, a.seat`,
    )
    .bind(id)
    .all<AttendanceWithStudent>();

  return { event, attendance };
}

// ============================================================================
// Students
// ============================================================================

export async function insertStudent(
  db: D1Database,
  student: { name: string; email?: string; first_event_id?: string },
): Promise<StudentRow> {
  const id = generateId();
  await db
    .prepare('INSERT INTO students (id, name, email, first_event_id) VALUES (?, ?, ?, ?)')
    .bind(id, student.name, student.email ?? null, student.first_event_id ?? null)
    .run();
  return (await getStudentById(db, id))!;
}

export async function listStudents(
  db: D1Database,
  limit: number,
  offset: number,
  search?: string,
): Promise<{ students: (StudentRow & { event_count: number })[]; total: number }> {
  const where = search ? "WHERE name LIKE '%' || ? || '%'" : '';
  const binds = search ? [search] : [];

  const countResult = await db
    .prepare(`SELECT COUNT(*) as total FROM students ${where}`)
    .bind(...binds)
    .first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const { results } = await db
    .prepare(
      `SELECT s.*, COUNT(a.id) as event_count
       FROM students s
       LEFT JOIN attendance a ON s.id = a.student_id
       ${where}
       GROUP BY s.id
       ORDER BY s.name
       LIMIT ? OFFSET ?`,
    )
    .bind(...binds, limit, offset)
    .all<StudentRow & { event_count: number }>();

  return { students: results, total };
}

export async function getStudentById(db: D1Database, id: string): Promise<StudentRow | null> {
  return db.prepare('SELECT * FROM students WHERE id = ?').bind(id).first<StudentRow>();
}

export async function getStudentByName(db: D1Database, name: string): Promise<StudentRow | null> {
  return db.prepare('SELECT * FROM students WHERE name = ?').bind(name).first<StudentRow>();
}

export async function getStudentWithHistory(
  db: D1Database,
  id: string,
): Promise<{
  student: StudentRow;
  attendance: Array<{
    event_id: string;
    event_name: string;
    event_date: string;
    table_number: number | null;
    seat: string | null;
  }>;
} | null> {
  const student = await getStudentById(db, id);
  if (!student) return null;

  const { results: attendance } = await db
    .prepare(
      `SELECT a.event_id, e.name as event_name, e.date as event_date,
              a.table_number, a.seat
       FROM attendance a
       JOIN events e ON a.event_id = e.id
       WHERE a.student_id = ?
       ORDER BY e.date DESC`,
    )
    .bind(id)
    .all();

  return {
    student,
    attendance: attendance as Array<{
      event_id: string;
      event_name: string;
      event_date: string;
      table_number: number | null;
      seat: string | null;
    }>,
  };
}

/** Look up student by exact name; create if not found */
export async function getOrCreateStudentByName(
  db: D1Database,
  name: string,
  eventId: string,
): Promise<StudentRow> {
  const existing = await getStudentByName(db, name);
  if (existing) return existing;
  return insertStudent(db, { name, first_event_id: eventId });
}

// ============================================================================
// Attendance
// ============================================================================

export async function recordAttendance(
  db: D1Database,
  record: {
    event_id: string;
    student_id: string;
    table_number?: number;
    seat?: string;
    source?: string;
  },
): Promise<AttendanceRow> {
  const id = generateId();
  await db
    .prepare(
      `INSERT INTO attendance (id, event_id, student_id, table_number, seat, source)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      record.event_id,
      record.student_id,
      record.table_number ?? null,
      record.seat ?? null,
      record.source ?? 'manual',
    )
    .run();
  return db.prepare('SELECT * FROM attendance WHERE id = ?').bind(id).first<AttendanceRow>() as Promise<AttendanceRow>;
}

export async function deleteAttendance(
  db: D1Database,
  eventId: string,
  studentId: string,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM attendance WHERE event_id = ? AND student_id = ?')
    .bind(eventId, studentId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

// ============================================================================
// Mailing List
// ============================================================================

export async function addMailingListEntry(
  db: D1Database,
  entry: { name: string; email: string; event_id?: string },
): Promise<MailingListRow> {
  const id = generateId();
  await db
    .prepare('INSERT INTO mailing_list (id, name, email, event_id) VALUES (?, ?, ?, ?)')
    .bind(id, entry.name, entry.email, entry.event_id ?? null)
    .run();
  return db.prepare('SELECT * FROM mailing_list WHERE id = ?').bind(id).first<MailingListRow>() as Promise<MailingListRow>;
}

export async function listMailingList(db: D1Database): Promise<MailingListRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM mailing_list ORDER BY name')
    .all<MailingListRow>();
  return results;
}

export async function deleteMailingListEntry(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM mailing_list WHERE id = ?').bind(id).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function getMailingListByEmail(db: D1Database, email: string): Promise<MailingListRow | null> {
  return db.prepare('SELECT * FROM mailing_list WHERE email = ?').bind(email).first<MailingListRow>();
}

// ============================================================================
// Photos (R2 metadata in D1)
// ============================================================================

export async function insertTablePhoto(
  db: D1Database,
  photo: { event_id: string; table_number: number; r2_key: string },
): Promise<TablePhotoRow> {
  const id = generateId();
  await db
    .prepare('INSERT INTO table_photos (id, event_id, table_number, r2_key) VALUES (?, ?, ?, ?)')
    .bind(id, photo.event_id, photo.table_number, photo.r2_key)
    .run();
  return db.prepare('SELECT * FROM table_photos WHERE id = ?').bind(id).first<TablePhotoRow>() as Promise<TablePhotoRow>;
}

export async function insertOcrJob(
  db: D1Database,
  job: { event_id: string; r2_key: string },
): Promise<OcrJobRow> {
  const id = generateId();
  await db
    .prepare('INSERT INTO ocr_jobs (id, event_id, r2_key) VALUES (?, ?, ?)')
    .bind(id, job.event_id, job.r2_key)
    .run();
  return db.prepare('SELECT * FROM ocr_jobs WHERE id = ?').bind(id).first<OcrJobRow>() as Promise<OcrJobRow>;
}

export async function listPhotosForEvent(
  db: D1Database,
  eventId: string,
): Promise<{ table_photos: TablePhotoRow[]; ocr_jobs: OcrJobRow[] }> {
  const { results: tablePhotos } = await db
    .prepare('SELECT * FROM table_photos WHERE event_id = ? ORDER BY table_number')
    .bind(eventId)
    .all<TablePhotoRow>();

  const { results: ocrJobs } = await db
    .prepare('SELECT * FROM ocr_jobs WHERE event_id = ? ORDER BY created_at')
    .bind(eventId)
    .all<OcrJobRow>();

  return { table_photos: tablePhotos, ocr_jobs: ocrJobs };
}

// ============================================================================
// OCR Job Management
// ============================================================================

export async function getOcrJobById(db: D1Database, id: string): Promise<OcrJobRow | null> {
  return db.prepare('SELECT * FROM ocr_jobs WHERE id = ?').bind(id).first<OcrJobRow>();
}

export async function listOcrJobsForEvent(db: D1Database, eventId: string): Promise<OcrJobRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM ocr_jobs WHERE event_id = ? ORDER BY created_at DESC')
    .bind(eventId)
    .all<OcrJobRow>();
  return results;
}

export async function updateOcrJobProcessing(db: D1Database, id: string): Promise<void> {
  await db
    .prepare("UPDATE ocr_jobs SET status = 'processing' WHERE id = ?")
    .bind(id)
    .run();
}

export async function updateOcrJobComplete(
  db: D1Database,
  id: string,
  resultJson: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE ocr_jobs SET status = 'complete', result_json = ?, processed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?",
    )
    .bind(resultJson, id)
    .run();
}

export async function updateOcrJobFailed(
  db: D1Database,
  id: string,
  errorMessage: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE ocr_jobs SET status = 'failed', error_message = ?, processed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?",
    )
    .bind(errorMessage, id)
    .run();
}

// ============================================================================
// Members (groups.io roster)
// ============================================================================

export async function insertMember(
  db: D1Database,
  member: { name: string; email: string; joined_date?: string; declined?: boolean },
): Promise<MemberRow> {
  const id = generateId();
  await db
    .prepare('INSERT INTO members (id, name, email, joined_date, declined) VALUES (?, ?, ?, ?, ?)')
    .bind(id, member.name, member.email, member.joined_date ?? null, member.declined ? 1 : 0)
    .run();
  return db.prepare('SELECT * FROM members WHERE id = ?').bind(id).first<MemberRow>() as Promise<MemberRow>;
}

export async function listMembers(
  db: D1Database,
  limit: number,
  offset: number,
  search?: string,
): Promise<{ members: MemberRow[]; total: number }> {
  const where = search ? "WHERE name LIKE '%' || ? || '%' OR email LIKE '%' || ? || '%'" : '';
  const binds = search ? [search, search] : [];

  const countResult = await db
    .prepare(`SELECT COUNT(*) as total FROM members ${where}`)
    .bind(...binds)
    .first<{ total: number }>();
  const total = countResult?.total ?? 0;

  const { results } = await db
    .prepare(`SELECT * FROM members ${where} ORDER BY name LIMIT ? OFFSET ?`)
    .bind(...binds, limit, offset)
    .all<MemberRow>();

  return { members: results, total };
}

export async function getMemberByEmail(db: D1Database, email: string): Promise<MemberRow | null> {
  return db.prepare('SELECT * FROM members WHERE email = ?').bind(email).first<MemberRow>();
}

export async function getMemberById(db: D1Database, id: string): Promise<MemberRow | null> {
  return db.prepare('SELECT * FROM members WHERE id = ?').bind(id).first<MemberRow>();
}

export async function updateMemberDeclined(db: D1Database, id: string, declined: boolean): Promise<void> {
  await db.prepare('UPDATE members SET declined = ? WHERE id = ?').bind(declined ? 1 : 0, id).run();
}

export async function deleteMember(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM members WHERE id = ?').bind(id).run();
  return (result.meta.changes ?? 0) > 0;
}

/** Check which students from a list are NOT in the members table */
export async function findNonMembers(
  db: D1Database,
  studentIds: string[],
): Promise<Array<{ student_id: string; student_name: string }>> {
  if (studentIds.length === 0) return [];
  const placeholders = studentIds.map(() => '?').join(',');
  const { results } = await db
    .prepare(
      `SELECT s.id as student_id, s.name as student_name
       FROM students s
       LEFT JOIN members m ON LOWER(s.name) = LOWER(m.name)
       WHERE s.id IN (${placeholders}) AND m.id IS NULL`,
    )
    .bind(...studentIds)
    .all<{ student_id: string; student_name: string }>();
  return results;
}
