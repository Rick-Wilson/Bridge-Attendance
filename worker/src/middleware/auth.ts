import type { Context, Next } from 'hono';
import type { Env } from '../types';
import { unauthorized } from '../errors';

export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  const apiKeyHeader = c.req.header('X-API-Key');

  let key: string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    key = authHeader.slice(7);
  } else if (apiKeyHeader) {
    key = apiKeyHeader;
  }

  if (!key || key !== c.env.API_KEY) {
    throw unauthorized();
  }

  await next();
}
