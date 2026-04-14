/**
 * Scheduled Background Function — runs daily at 18:30 UTC (12:00 AM IST).
 * Declared in netlify.toml: [functions."fetchScores-background"] schedule = "30 18 * * *"
 *
 * Being a background function gives it up to 15 minutes of execution time,
 * which is necessary because PSI calls on real-world sites take 60-90s each.
 *
 * Guards:
 *  - Acquires a run-lock so manual triggers are blocked while this runs.
 *  - Skips projects already scored today (idempotent).
 *  - Caps PSI concurrency at 10 to avoid Google rate limits.
 */

const { acquireLock, releaseLock } = require('./_utils/storage');
const { runAllProjects } = require('./_utils/runner');

exports.handler = async () => {
  console.log('[fetchScores-bg] Cron fired — acquiring lock...');

  const acquired = await acquireLock('cron');
  if (!acquired) {
    console.warn('[fetchScores-bg] Another run already in progress — aborting.');
    return { statusCode: 200, body: 'Skipped — already running' };
  }

  try {
    const result = await runAllProjects('cron');
    console.log('[fetchScores-bg] Done:', JSON.stringify(result));
    return { statusCode: 200, body: 'OK' };
  } finally {
    await releaseLock();
    console.log('[fetchScores-bg] Lock released.');
  }
};
