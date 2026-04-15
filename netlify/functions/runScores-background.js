/**
 * Background manual trigger — POST /.netlify/functions/runScores-background
 *
 * Same as runScores.js but runs as a Netlify Background Function
 * (15-minute timeout). Use this for large deployments where the standard
 * 26s limit of runScores might not be enough.
 *
 * Modes:
 *  - POST /api/runScores-background          → runs ALL projects
 *  - POST /api/runScores-background?id=<id>  → runs ONE project only
 */

const { verifyToken } = require('./_utils/auth');
const {
  acquireLock,
  releaseLock,
  acquireProjectLock,
  releaseProjectLock,
} = require('./_utils/storage');
const { runAllProjects, runProjectScores } = require('./_utils/runner');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const user = verifyToken(event);
  if (!user) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const projectId = event.queryStringParameters && event.queryStringParameters.id;

  // ── Per-project run ─────────────────────────────────────────────────────────
  if (projectId) {
    const acquired = await acquireProjectLock(projectId);
    if (!acquired) {
      return {
        statusCode: 409,
        headers: CORS,
        body: JSON.stringify({
          error: 'A score run is already in progress for this project. Please wait for it to finish.',
        }),
      };
    }

    console.log(`[runScores-bg] Per-project run started: ${projectId}`);

    try {
      const result = await runProjectScores(projectId, 'manual');
      if (!result.found) {
        return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Project not found.' }) };
      }
      return {
        statusCode: 202,
        headers: CORS,
        body: JSON.stringify({
          started: true,
          projectId,
          projectName: result.projectName,
          skipped: result.skipped,
          message: result.skipped
            ? `"${result.projectName}" already has scores for today (${result.dateStr}). Nothing to update.`
            : `Score run complete for "${result.projectName}". Results are in your Google Sheet.`,
        }),
      };
    } finally {
      await releaseProjectLock(projectId);
    }
  }

  // ── All-projects run ────────────────────────────────────────────────────────
  const acquired = await acquireLock('manual');
  if (!acquired) {
    return {
      statusCode: 409,
      headers: CORS,
      body: JSON.stringify({
        error: 'A score run is already in progress (cron or another manual trigger). Please wait for it to finish.',
      }),
    };
  }

  console.log('[runScores-bg] Manual run started (all projects)');

  try {
    const result = await runAllProjects('manual');
    console.log('[runScores-bg] Done:', JSON.stringify(result));

    const allSkipped = result.skipped === result.projects;

    return {
      statusCode: 202,
      headers: CORS,
      body: JSON.stringify({
        started: true,
        projects: result.projects,
        skipped: result.skipped,
        message: allSkipped
          ? `All ${result.projects} project(s) already have scores for today (${result.dateStr}). Nothing to update.`
          : `Score run complete for ${result.projects - result.skipped} project(s). Results are in your Google Sheets.`,
      }),
    };
  } finally {
    await releaseLock();
    console.log('[runScores-bg] Lock released.');
  }
};
