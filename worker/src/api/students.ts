import { Hono } from 'hono';
import type { Env, CreateStudentBody } from '../types';
import { badRequest, notFound } from '../errors';
import * as db from '../db/queries';

const app = new Hono<{ Bindings: Env }>();

// POST /api/students - Create student
app.post('/', async (c) => {
  const body = await c.req.json<CreateStudentBody>();
  if (!body.name) throw badRequest('name is required');

  const student = await db.insertStudent(c.env.DB, {
    name: body.name,
    email: body.email,
    first_event_id: body.first_event_id,
  });

  return c.json({ data: student }, 201);
});

// GET /api/students - List students
app.get('/', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50'), 100);
  const offset = parseInt(c.req.query('offset') ?? '0');
  const search = c.req.query('search');

  const { students, total } = await db.listStudents(c.env.DB, limit, offset, search);

  return c.json({
    data: students,
    meta: { total, limit, offset },
  });
});

// GET /api/students/:id - Student with attendance history
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await db.getStudentWithHistory(c.env.DB, id);
  if (!result) throw notFound('Student', id);

  return c.json({
    data: { ...result.student, attendance: result.attendance },
  });
});

export default app;
