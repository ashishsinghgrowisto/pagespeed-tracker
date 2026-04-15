/**
 * Manual trigger — POST /api/runScores
 *
 * Guards:
 *  - Requires valid JWT.
 *  - Returns 409 if another run (cron or manual) is already in progress.
 *  - Skips projects already scored today (idempotent).
 *  - Caps PSI concurrency at 10 to avoid Google rate limits.
 *
 * Note: Unlike Netlify Background Functions, this runs synchronously and
 * returns 202 when the work is complete. The button spinner stays active
 * until the response arrives.
 */
const { verifyToken } = require('./_utils/auth');
const { acquireLock, releaseLock } = require('./_utils/storage');
const { runAllProjects } = require('./_utils/runner');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const acquired = await acquireLock('manual');
  if (!acquired) {
    return res.status(409).json({
      error: 'A score run is already in progress (cron or another manual trigger). Please wait for it to finish.',
    });
  }

  console.log('[runScores] Manual run started');

  try {
    const result = await runAllProjects('manual');
    console.log('[runScores] Done:', JSON.stringify(result));

    const allSkipped = result.skipped === result.projects;

    return res.status(202).json({
      started: true,
      projects: result.projects,
      skipped: result.skipped,
      message: allSkipped
        ? `All ${result.projects} project(s) already have scores for today (${result.dateStr}). Nothing to update.`
        : `Score run complete for ${result.projects - result.skipped} project(s). Results are in your Google Sheets.`,
    });
  } finally {
    await releaseLock();
    console.log('[runScores] Lock released.');
  }
};
