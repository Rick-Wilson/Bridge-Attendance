import { Hono } from 'hono';
import type { Env } from '../types';
import { badRequest, notFound } from '../errors';
import { generateId } from '../utils/id';
import * as db from '../db/queries';
import { processAttendanceSheet, bufferToBase64 } from '../ocr/claude-vision';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const app = new Hono<{ Bindings: Env }>();

// POST /api/events/:id/scan - Upload photo and run OCR synchronously
app.post('/:id/scan', async (c) => {
  const eventId = c.req.param('id');

  const event = await db.getEventById(c.env.DB, eventId);
  if (!event) throw notFound('Event', eventId);

  if (!c.env.ANTHROPIC_API_KEY) {
    throw badRequest('ANTHROPIC_API_KEY is not configured');
  }

  const formData = await c.req.raw.formData();
  const photo = formData.get('photo');
  if (!photo || typeof photo === 'string') throw badRequest('photo file is required');
  const file = photo as unknown as { type: string; arrayBuffer(): Promise<ArrayBuffer>; size?: number };

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw badRequest(`Unsupported image type: ${file.type}. Allowed: ${ALLOWED_TYPES.join(', ')}`);
  }

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_SIZE) {
    throw badRequest(`Image too large (${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB). Max: 5MB`);
  }

  // Upload to R2
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : file.type === 'image/gif' ? 'gif' : 'jpg';
  const timestamp = Math.floor(Date.now() / 1000);
  const r2Key = `${eventId}/attendance-sheet/${timestamp}-${generateId().slice(0, 8)}.${ext}`;

  await c.env.PHOTOS.put(r2Key, bytes, {
    httpMetadata: { contentType: file.type },
  });

  // Create OCR job record
  const ocrJob = await db.insertOcrJob(c.env.DB, {
    event_id: eventId,
    r2_key: r2Key,
  });

  // Run OCR synchronously
  await db.updateOcrJobProcessing(c.env.DB, ocrJob.id);

  try {
    const imageBase64 = bufferToBase64(bytes);
    const result = await processAttendanceSheet(c.env.ANTHROPIC_API_KEY, imageBase64, file.type);

    await db.updateOcrJobComplete(c.env.DB, ocrJob.id, JSON.stringify(result));

    return c.json({
      data: {
        ocr_job_id: ocrJob.id,
        r2_key: r2Key,
        status: 'complete',
        result,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown OCR error';
    await db.updateOcrJobFailed(c.env.DB, ocrJob.id, message);

    // Return 200 — the photo upload succeeded, only OCR failed
    return c.json({
      data: {
        ocr_job_id: ocrJob.id,
        r2_key: r2Key,
        status: 'failed',
        error: message,
      },
    });
  }
});

export default app;
