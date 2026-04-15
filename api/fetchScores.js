/**
 * Scheduled cron function — runs daily at 18:30 UTC (12:00 AM IST).
 * Configured in vercel.json: { "crons": [{ "path": "/api/fetchScores", "schedule": "30 18 * * *" }] }
 *
 * Vercel calls this with GET and injects Authorization: Bearer $CRON_SECRET.
 * We verify that header to block unauthorised external calls.
 *
 * Guards:
 *  - Acquires a run-lock so manual triggers are blocked while this runs.
 *  - Skips projects already scored today (idempotent).
 *  - Caps PSI concurrency at 10 to avoid Google rate limits.
 */
const { acquireLock, releaseLock } = require('./_utils/storage');
const { runAllProjects } = require('./_utils/runner');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  // Vercel automatically adds Authorization: Bearer $CRON_SECRET on cron calls.
  // Reject any requests that don't carry the secret (protects against direct hits).
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = (req.headers.authorization || '').replace('Bearer ', '');
    if (auth !== cronSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  console.log('[fetchScores] Cron fired — acquiring lock...');

  const acquired = await acquireLock('cron');
  if (!acquired) {
    console.warn('[fetchScores] Another run already in progress — aborting.');
    return res.status(200).json({ message: 'Skipped — already running' });
  }

  try {
    const result = await runAllProjects('cron');
    console.log('[fetchScores] Done:', JSON.stringify(result));
    return res.status(200).json({ message: 'OK', ...result });
  } finally {
    await releaseLock();
    console.log('[fetchScores] Lock released.');
  }
};
