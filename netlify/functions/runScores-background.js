/**
 * Manual trigger — POST /.netlify/functions/runScores-background
 *
 * Guards:
 *  - Requires valid JWT.
 *  - Returns 409 if another run (cron or manual) is already in progress.
 *  - Skips projects already scored today (idempotent).
 *  - Caps PSI concurrency at 10 to avoid Google rate limits.
 */

const { verifyToken } = require('./_utils/auth');
const { acquireLock, releaseLock } = require('./_utils/storage');
const { runAllProjects } = require('./_utils/runner');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const user = verifyToken(event);
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const acquired = await acquireLock('manual');
  if (!acquired) {
    return {
      statusCode: 409,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'A score run is already in progress (cron or another manual trigger). Please wait for it to finish.',
      }),
    };
  }

  console.log('[runScores-bg] Manual run started');

  try {
    const result = await runAllProjects('manual');
    console.log('[runScores-bg] Done:', JSON.stringify(result));

    const allSkipped = result.skipped === result.projects;

    return {
      statusCode: 202,
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
