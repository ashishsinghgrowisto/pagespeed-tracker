/**
 * POST /api/runScores-background — manual score run for one OR all projects.
 *
 * Modes:
 *   POST /api/runScores-background          → run ALL projects
 *   POST /api/runScores-background?id=<id>  → run ONE project only
 *
 * Note: Cloudflare Workers use waitUntil() for background work so the HTTP
 * response returns immediately (202) while the score run continues.
 */

import { verifyToken } from '../_utils/auth.js';
import {
  acquireLock, releaseLock,
  acquireProjectLock, releaseProjectLock,
} from '../_utils/storage.js';
import { runAllProjects, runProjectScores } from '../_utils/runner.js';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function onRequest(context) {
  const { request, env, waitUntil } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await verifyToken(request, env.JWT_SECRET || 'fallback-secret');
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const url       = new URL(request.url);
  const projectId = url.searchParams.get('id');

  // ── Per-project run ────────────────────────────────────────────────────────
  if (projectId) {
    const acquired = await acquireProjectLock(env, projectId);
    if (!acquired) {
      return json({
        error: 'A score run is already in progress for this project. Please wait.',
      }, 409);
    }

    // Use waitUntil so the Worker stays alive past the response
    waitUntil((async () => {
      try {
        await runProjectScores(env, projectId, 'manual');
      } finally {
        await releaseProjectLock(env, projectId);
      }
    })());

    return json({
      started: true,
      projectId,
      message: 'Score run started — results will appear in your Google Sheet in a few minutes.',
    }, 202);
  }

  // ── All-projects run ───────────────────────────────────────────────────────
  const acquired = await acquireLock(env, 'manual');
  if (!acquired) {
    return json({
      error: 'A score run is already in progress. Please wait for it to finish.',
    }, 409);
  }

  waitUntil((async () => {
    try {
      const result = await runAllProjects(env, 'manual');
      console.log('[runScores-bg] Done:', JSON.stringify(result));
    } finally {
      await releaseLock(env);
    }
  })());

  return json({
    started: true,
    message: 'Score run started for all projects — results will appear in your Google Sheets in a few minutes.',
  }, 202);
}
