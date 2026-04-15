/**
 * POST /api/fetchScores — called by the Cloudflare cron Worker on schedule.
 * Authenticated via X-Cron-Secret header (not JWT — cron doesn't have a user session).
 *
 * The cron Worker sends: X-Cron-Secret: <env.CRON_SECRET>
 */

import { acquireLock, releaseLock } from '../_utils/storage.js';
import { runAllProjects } from '../_utils/runner.js';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function onRequest(context) {
  const { request, env, waitUntil } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Authenticate with the shared cron secret
  const cronSecret = env.CRON_SECRET;
  const incoming   = request.headers.get('X-Cron-Secret') || '';

  if (!cronSecret || incoming !== cronSecret) {
    return json({ error: 'Forbidden' }, 403);
  }

  const acquired = await acquireLock(env, 'cron');
  if (!acquired) {
    console.warn('[fetchScores] Another run already in progress — skipping.');
    return json({ skipped: true, reason: 'Run already in progress' });
  }

  waitUntil((async () => {
    try {
      const result = await runAllProjects(env, 'cron');
      console.log('[fetchScores] Cron done:', JSON.stringify(result));
    } finally {
      await releaseLock(env);
    }
  })());

  return json({ started: true, message: 'Cron score run started.' });
}
