/**
 * Manual trigger — POST /api/runScores
 *
 * Modes:
 *  - POST /api/runScores          → runs ALL projects (global lock)
 *  - POST /api/runScores?id=<id>  → runs ONE project only (per-project lock)
 *
 * Guards:
 *  - Requires valid JWT.
 *  - Returns 409 if the target run is already in progress.
 *  - Skips projects/pages already scored today (idempotent).
 *  - Caps PSI concurrency at 10 to avoid Google rate limits.
 */
const { verifyToken } = require('./_utils/auth');
const {
  acquireLock,
  releaseLock,
  acquireProjectLock,
  releaseProjectLock,
} = require('./_utils/storage');
const { runAllProjects, runProjectScores } = require('./_utils/runner');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const projectId = req.query && req.query.id;

  // ── Per-project run ─────────────────────────────────────────────────────────
  if (projectId) {
    const acquired = await acquireProjectLock(projectId);
    if (!acquired) {
      return res.status(409).json({
        error: 'A score run is already in progress for this project. Please wait for it to finish.',
      });
    }

    console.log(`[runScores] Per-project manual run started: ${projectId}`);

    try {
      const result = await runProjectScores(projectId, 'manual');
      console.log('[runScores] Per-project done:', JSON.stringify(result));

      if (!result.found) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      return res.status(202).json({
        started: true,
        projectId,
        projectName: result.projectName,
        skipped: result.skipped,
        message: result.skipped
          ? `"${result.projectName}" already has scores for today (${result.dateStr}). Nothing to update.`
          : `Score run complete for "${result.projectName}". Results are in your Google Sheet.`,
      });
    } finally {
      await releaseProjectLock(projectId);
      console.log(`[runScores] Project lock released: ${projectId}`);
    }
  }

  // ── All-projects run ────────────────────────────────────────────────────────
  const acquired = await acquireLock('manual');
  if (!acquired) {
    return res.status(409).json({
      error: 'A score run is already in progress (cron or another manual trigger). Please wait for it to finish.',
    });
  }

  console.log('[runScores] Manual run started (all projects)');

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
