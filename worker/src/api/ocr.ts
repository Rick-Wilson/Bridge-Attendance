import { Hono } from 'hono';
import type { Env, OcrResult } from '../types';
import { notFound } from '../errors';
import * as db from '../db/queries';

const app = new Hono<{ Bindings: Env }>();

// GET /api/events/:id/ocr - List OCR jobs for event
app.get('/:id/ocr', async (c) => {
  const eventId = c.req.param('id');

  const event = await db.getEventById(c.env.DB, eventId);
  if (!event) throw notFound('Event', eventId);

  const jobs = await db.listOcrJobsForEvent(c.env.DB, eventId);

  const data = jobs.map((job) => ({
    ...job,
    result: job.result_json ? (JSON.parse(job.result_json) as OcrResult) : null,
    result_json: undefined,
  }));

  return c.json({ data });
});

// GET /api/events/:id/ocr/:jobId - Get single OCR job
app.get('/:id/ocr/:jobId', async (c) => {
  const eventId = c.req.param('id');
  const jobId = c.req.param('jobId');

  const event = await db.getEventById(c.env.DB, eventId);
  if (!event) throw notFound('Event', eventId);

  const job = await db.getOcrJobById(c.env.DB, jobId);
  if (!job || job.event_id !== eventId) throw notFound('OCR job', jobId);

  return c.json({
    data: {
      ...job,
      result: job.result_json ? (JSON.parse(job.result_json) as OcrResult) : null,
      result_json: undefined,
    },
  });
});

export default app;
