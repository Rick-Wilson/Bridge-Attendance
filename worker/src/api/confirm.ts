import { Hono } from 'hono';
import type { Env, ConfirmOcrBody } from '../types';
import { badRequest, notFound } from '../errors';
import * as db from '../db/queries';

const app = new Hono<{ Bindings: Env }>();

// POST /api/events/:id/confirm - Commit reviewed OCR results to DB
app.post('/:id/confirm', async (c) => {
  const eventId = c.req.param('id');

  const event = await db.getEventById(c.env.DB, eventId);
  if (!event) throw notFound('Event', eventId);

  const body = await c.req.json<ConfirmOcrBody>();

  if (!Array.isArray(body.attendance)) {
    throw badRequest('attendance must be an array');
  }
  if (!Array.isArray(body.mailing_list)) {
    throw badRequest('mailing_list must be an array');
  }

  // Process attendance records
  const attendanceResults: Array<{ student_name: string; student_id: string; status: 'created' | 'skipped' }> = [];

  for (const entry of body.attendance) {
    if (!entry.student_name?.trim()) continue;

    const student = await db.getOrCreateStudentByName(c.env.DB, entry.student_name.trim(), eventId);

    // Check for existing attendance record
    const existing = await db.getEventWithAttendance(c.env.DB, eventId);
    const alreadyRecorded = existing?.attendance.some((a) => a.student_id === student.id);

    if (alreadyRecorded) {
      attendanceResults.push({ student_name: entry.student_name, student_id: student.id, status: 'skipped' });
    } else {
      await db.recordAttendance(c.env.DB, {
        event_id: eventId,
        student_id: student.id,
        table_number: entry.table_number,
        seat: entry.seat,
        source: 'ocr',
      });
      attendanceResults.push({ student_name: entry.student_name, student_id: student.id, status: 'created' });
    }
  }

  // Process mailing list entries
  const mailingListResults: Array<{ name: string; email: string; status: 'created' | 'skipped' }> = [];

  for (const entry of body.mailing_list) {
    if (!entry.name?.trim() || !entry.email?.trim()) continue;

    const email = entry.email.trim().toLowerCase();
    const existing = await db.getMailingListByEmail(c.env.DB, email);

    if (existing) {
      mailingListResults.push({ name: entry.name, email, status: 'skipped' });
    } else {
      await db.addMailingListEntry(c.env.DB, {
        name: entry.name.trim(),
        email,
        event_id: eventId,
      });
      mailingListResults.push({ name: entry.name, email, status: 'created' });
    }
  }

  return c.json({
    data: {
      attendance: {
        created: attendanceResults.filter((r) => r.status === 'created').length,
        skipped: attendanceResults.filter((r) => r.status === 'skipped').length,
        results: attendanceResults,
      },
      mailing_list: {
        created: mailingListResults.filter((r) => r.status === 'created').length,
        skipped: mailingListResults.filter((r) => r.status === 'skipped').length,
        results: mailingListResults,
      },
    },
  });
});

export default app;
