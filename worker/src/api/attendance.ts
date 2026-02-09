import { Hono } from 'hono';
import type { Env, RecordAttendanceBody, BatchAttendanceBody } from '../types';
import { badRequest, conflict, notFound } from '../errors';
import * as db from '../db/queries';

const app = new Hono<{ Bindings: Env }>();

// POST /api/events/:id/attendance - Record single attendance
app.post('/:id/attendance', async (c) => {
  const eventId = c.req.param('id');
  const body = await c.req.json<RecordAttendanceBody>();

  if (!body.student_name) throw badRequest('student_name is required');
  if (body.seat && !['N', 'S', 'E', 'W'].includes(body.seat)) {
    throw badRequest('seat must be N, S, E, or W');
  }

  const event = await db.getEventById(c.env.DB, eventId);
  if (!event) throw notFound('Event', eventId);

  const student = await db.getOrCreateStudentByName(c.env.DB, body.student_name, eventId);

  try {
    const attendance = await db.recordAttendance(c.env.DB, {
      event_id: eventId,
      student_id: student.id,
      table_number: body.table_number,
      seat: body.seat,
      source: body.source ?? 'manual',
    });

    return c.json({ data: { ...attendance, student_name: student.name } }, 201);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('UNIQUE constraint')) {
      throw conflict(`${body.student_name} is already recorded for this event`);
    }
    throw e;
  }
});

// POST /api/events/:id/attendance/batch - Batch record attendance
app.post('/:id/attendance/batch', async (c) => {
  const eventId = c.req.param('id');
  const body = await c.req.json<BatchAttendanceBody>();

  if (!body.records?.length) throw badRequest('records array is required and must not be empty');

  const event = await db.getEventById(c.env.DB, eventId);
  if (!event) throw notFound('Event', eventId);

  let created = 0;
  let skipped = 0;
  const results: Array<{ student_name: string; status: string }> = [];

  for (const record of body.records) {
    if (!record.student_name) {
      results.push({ student_name: '(empty)', status: 'skipped' });
      skipped++;
      continue;
    }

    const student = await db.getOrCreateStudentByName(c.env.DB, record.student_name, eventId);

    try {
      await db.recordAttendance(c.env.DB, {
        event_id: eventId,
        student_id: student.id,
        table_number: record.table_number,
        seat: record.seat,
        source: record.source ?? 'manual',
      });
      results.push({ student_name: record.student_name, status: 'created' });
      created++;
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('UNIQUE constraint')) {
        results.push({ student_name: record.student_name, status: 'skipped' });
        skipped++;
      } else {
        throw e;
      }
    }
  }

  return c.json({
    data: { created, skipped, results },
  }, 201);
});

// DELETE /api/events/:id/attendance/:studentId - Remove attendance record
app.delete('/:id/attendance/:studentId', async (c) => {
  const eventId = c.req.param('id');
  const studentId = c.req.param('studentId');

  const deleted = await db.deleteAttendance(c.env.DB, eventId, studentId);
  if (!deleted) throw notFound('Attendance record', `${eventId}/${studentId}`);

  return c.body(null, 204);
});

export default app;
