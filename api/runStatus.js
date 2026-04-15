/**
 * GET /api/runStatus
 * Returns whether a cron or manual score run is currently in progress.
 * Requires a valid JWT.
 */
const { verifyToken } = require('./_utils/auth');
const { getLock } = require('./_utils/storage');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const lock = await getLock();

  return res.status(200).json({
    running: !!lock,
    lock: lock || null,
  });
};
