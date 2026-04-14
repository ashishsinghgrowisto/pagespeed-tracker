/**
 * GET /.netlify/functions/runStatus
 * Returns whether a cron or manual score run is currently in progress.
 * Requires a valid JWT.
 */

const { verifyToken } = require('./_utils/auth');
const { getLock } = require('./_utils/storage');

const CORS = { 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, body: '' };
  }

  const user = verifyToken(event);
  if (!user) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const lock = await getLock();

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({
      running: !!lock,
      lock: lock || null,
    }),
  };
};
