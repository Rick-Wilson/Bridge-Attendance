import { Hono } from 'hono';
import type { Env } from '../types';
import { badRequest, notFound } from '../errors';
import { generateId } from '../utils/id';
import * as db from '../db/queries';

const app = new Hono<{ Bindings: Env }>();

// POST /api/events/:id/photos - Upload photo
app.post('/:id/photos', async (c) => {
  const eventId = c.req.param('id');

  const event = await db.getEventById(c.env.DB, eventId);
  if (!event) throw notFound('Event', eventId);

  const formData = await c.req.raw.formData();
  const photo = formData.get('photo');
  const type = formData.get('type') as string | null;
  const tableNumber = formData.get('table_number') as string | null;

  if (!photo || typeof photo === 'string') throw badRequest('photo file is required');
  const file = photo as unknown as { type: string; arrayBuffer(): Promise<ArrayBuffer> };
  if (!type || !['attendance-sheet', 'table-photo'].includes(type)) {
    throw badRequest('type must be "attendance-sheet" or "table-photo"');
  }
  if (type === 'table-photo' && !tableNumber) {
    throw badRequest('table_number is required for table-photo type');
  }

  // Determine file extension from content type
  const ext = file.type === 'image/png' ? 'png' : 'jpg';
  const timestamp = Math.floor(Date.now() / 1000);
  const r2Key = `${eventId}/${type}/${timestamp}-${generateId().slice(0, 8)}.${ext}`;

  // Upload to R2
  const bytes = await file.arrayBuffer();
  await c.env.PHOTOS.put(r2Key, bytes, {
    httpMetadata: { contentType: file.type },
  });

  // Create DB record
  let record;
  if (type === 'table-photo') {
    record = await db.insertTablePhoto(c.env.DB, {
      event_id: eventId,
      table_number: parseInt(tableNumber!),
      r2_key: r2Key,
    });
  } else {
    record = await db.insertOcrJob(c.env.DB, {
      event_id: eventId,
      r2_key: r2Key,
    });
  }

  return c.json({ data: { r2_key: r2Key, record } }, 201);
});

// GET /api/events/:id/photos - List photos for event
app.get('/:id/photos', async (c) => {
  const eventId = c.req.param('id');

  const event = await db.getEventById(c.env.DB, eventId);
  if (!event) throw notFound('Event', eventId);

  const photos = await db.listPhotosForEvent(c.env.DB, eventId);
  return c.json({ data: photos });
});

export default app;
