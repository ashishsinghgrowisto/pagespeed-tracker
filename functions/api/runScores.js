/**
 * POST /api/runScores — triggers a manual score run for ALL projects.
 * Synchronous (Cloudflare has a 30s CPU limit but network I/O is free).
 */

import { verifyToken } from '../_utils/auth.js';
import { acquireLock, releaseLock } from '../_utils/storage.js';
import { runAllProjects } from '../_utils/runner.js';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await verifyToken(request, env.JWT_SECRET || 'fallback-secret');
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const acquired = await acquireLock(env, 'manual');
  if (!acquired) {
    return json({
      error: 'A score run is already in progress. Please wait for it to finish.',
    }, 409);
  }

  try {
    const result = await runAllProjects(env, 'manual');
    const allSkipped = result.skipped === result.projects;
    return json({
      started: true,
      projects: result.projects,
      skipped: result.skipped,
      message: allSkipped
        ? `All ${result.projects} project(s) already have scores for today (${result.dateStr}).`
        : `Score run complete for ${result.projects - result.skipped} project(s). Results are in your Google Sheets.`,
    }, 202);
  } finally {
    await releaseLock(env);
  }
}
