import { Hono } from 'hono';
import type { Env, AddMailingListBody } from '../types';
import { badRequest, conflict, notFound } from '../errors';
import * as db from '../db/queries';

const app = new Hono<{ Bindings: Env }>();

// POST /api/mailing-list - Add entry
app.post('/', async (c) => {
  const body = await c.req.json<AddMailingListBody>();

  if (!body.name) throw badRequest('name is required');
  if (!body.email) throw badRequest('email is required');

  // Check for existing email
  const existing = await db.getMailingListByEmail(c.env.DB, body.email);
  if (existing) {
    throw conflict(`Email ${body.email} is already on the mailing list`);
  }

  const entry = await db.addMailingListEntry(c.env.DB, {
    name: body.name,
    email: body.email,
    event_id: body.event_id,
  });

  return c.json({ data: entry }, 201);
});

// GET /api/mailing-list - Export list
app.get('/', async (c) => {
  const entries = await db.listMailingList(c.env.DB);
  const format = c.req.query('format');

  if (format === 'csv') {
    const csv = ['name,email,event_id,created_at']
      .concat(entries.map((e) => `"${e.name}","${e.email}","${e.event_id ?? ''}","${e.created_at}"`))
      .join('\n');

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="mailing-list.csv"',
      },
    });
  }

  return c.json({ data: entries });
});

// DELETE /api/mailing-list/:id - Remove entry
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const deleted = await db.deleteMailingListEntry(c.env.DB, id);
  if (!deleted) throw notFound('Mailing list entry', id);

  return c.body(null, 204);
});

export default app;
