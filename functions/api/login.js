import { generateToken } from '../_utils/auth.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { username, password } = body;
  const validUser = env.ADMIN_USERNAME || 'admin';
  const validPass = env.ADMIN_PASSWORD || 'changeme';

  if (username === validUser && password === validPass) {
    const token = await generateToken({ username }, env.JWT_SECRET || 'fallback-secret');
    return json({ token, username });
  }

  return json({ error: 'Invalid username or password' }, 401);
}
