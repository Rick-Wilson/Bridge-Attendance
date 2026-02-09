import { Hono } from 'hono';
import type { Env, CreateEventBody } from '../types';
import { badRequest, conflict, notFound } from '../errors';
import { generateEventId, isValidEventId } from '../utils/id';
import * as db from '../db/queries';

const app = new Hono<{ Bindings: Env }>();

// POST /api/events - Create event
app.post('/', async (c) => {
  const body = await c.req.json<CreateEventBody>();

  if (!body.name) throw badRequest('name is required');
  if (!body.date) throw badRequest('date is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) throw badRequest('date must be YYYY-MM-DD format');

  const id = body.id ?? generateEventId();
  if (!isValidEventId(id)) throw badRequest('id must be 8 uppercase hex characters');

  const existing = await db.getEventById(c.env.DB, id);
  if (existing) throw conflict(`Event with ID ${id} already exists`);

  const event = await db.insertEvent(c.env.DB, {
    id,
    name: body.name,
    date: body.date,
    teacher: body.teacher ?? 'Rick',
    location: body.location ?? '',
    type: body.type ?? 'face_to_face',
  });

  return c.json({ data: event }, 201);
});

// GET /api/events - List events
app.get('/', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20'), 100);
  const offset = parseInt(c.req.query('offset') ?? '0');

  const { events, total } = await db.listEvents(c.env.DB, limit, offset);

  return c.json({
    data: events,
    meta: { total, limit, offset },
  });
});

// GET /api/events/:id - Get event with attendance
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await db.getEventWithAttendance(c.env.DB, id);
  if (!result) throw notFound('Event', id);

  return c.json({
    data: { ...result.event, attendance: result.attendance },
  });
});

// GET /api/events/:id/roster - Get roster for this class (all students who've ever attended)
app.get('/:id/roster', async (c) => {
  const id = c.req.param('id');
  const event = await db.getEventById(c.env.DB, id);
  if (!event) throw notFound('Event', id);

  const roster = await db.getRosterForClass(c.env.DB, event.name);

  const students = roster.map((r) => ({
    student_id: r.student_id,
    name: r.student_name,
    is_member: r.is_member === 1,
    declined: r.declined === 1,
    needs_mailing_list: r.is_member === 0 && r.declined === 0,
    events_attended: r.events_attended,
  }));

  return c.json({
    data: {
      class_name: event.name,
      teacher: event.teacher,
      total_students: students.length,
      needs_mailing_list: students.filter((s) => s.needs_mailing_list).length,
      students,
    },
  });
});

export default app;
