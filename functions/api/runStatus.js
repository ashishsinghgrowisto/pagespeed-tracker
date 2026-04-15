import { verifyToken } from '../_utils/auth.js';
import { getLock } from '../_utils/storage.js';

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const user = await verifyToken(request, env.JWT_SECRET || 'fallback-secret');
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const lock = await getLock(env);
  return json({ running: !!lock, lock: lock || null });
}
