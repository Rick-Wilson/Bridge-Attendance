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

export default app;
