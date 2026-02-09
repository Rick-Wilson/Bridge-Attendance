import { Hono } from 'hono';
import type { Env } from '../types';
import { badRequest, notFound } from '../errors';
import * as db from '../db/queries';

const app = new Hono<{ Bindings: Env }>();

// GET /api/members - List members
app.get('/', async (c) => {
  const limit = parseInt(c.req.query('limit') ?? '50');
  const offset = parseInt(c.req.query('offset') ?? '0');
  const search = c.req.query('search') || undefined;

  const { members, total } = await db.listMembers(c.env.DB, limit, offset, search);
  return c.json({ data: members, meta: { total, limit, offset } });
});

// POST /api/members - Add a member
app.post('/', async (c) => {
  const body = await c.req.json<{ name: string; email: string; joined_date?: string; declined?: boolean }>();
  if (!body.name?.trim()) throw badRequest('name is required');
  if (!body.email?.trim()) throw badRequest('email is required');

  const existing = await db.getMemberByEmail(c.env.DB, body.email.trim().toLowerCase());
  if (existing) {
    return c.json({ data: existing, meta: { status: 'already_exists' } }, 200);
  }

  const member = await db.insertMember(c.env.DB, {
    name: body.name.trim(),
    email: body.email.trim().toLowerCase(),
    joined_date: body.joined_date,
    declined: body.declined,
  });
  return c.json({ data: member }, 201);
});

// POST /api/members/batch - Batch import members
app.post('/batch', async (c) => {
  const body = await c.req.json<{
    members: Array<{ name: string; email: string; joined_date?: string }>;
  }>();
  if (!Array.isArray(body.members)) throw badRequest('members must be an array');

  let created = 0;
  let skipped = 0;

  for (const entry of body.members) {
    if (!entry.name?.trim() || !entry.email?.trim()) continue;
    const email = entry.email.trim().toLowerCase();
    const existing = await db.getMemberByEmail(c.env.DB, email);
    if (existing) {
      skipped++;
    } else {
      await db.insertMember(c.env.DB, {
        name: entry.name.trim(),
        email,
        joined_date: entry.joined_date,
      });
      created++;
    }
  }

  return c.json({ data: { created, skipped, total: created + skipped } });
});

// PATCH /api/members/:id - Update declined flag
app.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const member = await db.getMemberById(c.env.DB, id);
  if (!member) throw notFound('Member', id);

  const body = await c.req.json<{ declined?: boolean }>();
  if (typeof body.declined === 'boolean') {
    await db.updateMemberDeclined(c.env.DB, id, body.declined);
  }

  const updated = await db.getMemberById(c.env.DB, id);
  return c.json({ data: updated });
});

// DELETE /api/members/:id
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const deleted = await db.deleteMember(c.env.DB, id);
  if (!deleted) throw notFound('Member', id);
  return c.json({ data: { deleted: true } });
});

// GET /api/members/non-members/:eventId - Find attendees not on the mailing list
app.get('/non-members/:eventId', async (c) => {
  const eventId = c.req.param('eventId');
  const event = await db.getEventById(c.env.DB, eventId);
  if (!event) throw notFound('Event', eventId);

  const eventData = await db.getEventWithAttendance(c.env.DB, eventId);
  if (!eventData) throw notFound('Event', eventId);

  const studentIds = eventData.attendance.map((a) => a.student_id);
  const nonMembers = await db.findNonMembers(c.env.DB, studentIds);

  return c.json({ data: nonMembers });
});

export default app;
