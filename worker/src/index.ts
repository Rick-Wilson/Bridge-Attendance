import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Env } from './types';
import { authMiddleware } from './middleware/auth';
import { AppError } from './errors';
import events from './api/events';
import students from './api/students';
import attendance from './api/attendance';
import mailingList from './api/mailing-list';
import photos from './api/photos';
import scan from './api/scan';
import ocr from './api/ocr';
import confirm from './api/confirm';
import members from './api/members';

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: ['https://attendance.harmonicsystems.com', 'http://localhost:8787'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowHeaders: ['Authorization', 'Content-Type', 'X-API-Key'],
  }),
);

// Enable foreign keys on every request
app.use('/api/*', async (c, next) => {
  await c.env.DB.prepare('PRAGMA foreign_keys = ON').run();
  await next();
});

// Health check (no auth)
app.get('/api/health', (c) =>
  c.json({ status: 'ok', timestamp: new Date().toISOString() }),
);

// Auth required for all other API routes
app.use('/api/*', authMiddleware);

// Mount route groups
app.route('/api/events', events);
app.route('/api/events', attendance); // attendance routes nest under /api/events/:id/attendance
app.route('/api/events', photos); // photo routes nest under /api/events/:id/photos
app.route('/api/events', scan); // scan routes nest under /api/events/:id/scan
app.route('/api/events', ocr); // OCR job routes nest under /api/events/:id/ocr
app.route('/api/events', confirm); // confirm routes nest under /api/events/:id/confirm
app.route('/api/students', students);
app.route('/api/mailing-list', mailingList);
app.route('/api/members', members);

// Serve photos from R2 (authenticated)
app.get('/photos/*', async (c) => {
  const key = c.req.path.slice('/photos/'.length);
  if (!key) return c.json({ error: { code: 'BAD_REQUEST', message: 'Photo key is required' } }, 400);

  const object = await c.env.PHOTOS.get(key);
  if (!object) return c.json({ error: { code: 'NOT_FOUND', message: 'Photo not found' } }, 404);

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType ?? 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=86400');

  return new Response(object.body, { headers });
});

// Global error handler
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
  }
  console.error('Unhandled error:', err);
  return c.json(
    { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
    500,
  );
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404);
});

export default app;
