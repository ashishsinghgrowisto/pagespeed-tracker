/**
 * Project storage + run-lock using Redis (redis npm package, v4+).
 *
 * Keys:
 *   "projects"  — JSON array of all project configs
 *   "run-lock"  — lock object while a cron/manual run is in progress
 *
 * Env vars (auto-set when you connect a Redis database in Vercel):
 *   REDIS_URL   — e.g. redis://default:password@host:port
 */
const { createClient } = require('redis');

// Lock auto-expires after 20 min (safety valve for crashed runs)
const LOCK_TTL_SECONDS = 20 * 60;

const PROJECTS_KEY = 'projects';
const LOCK_KEY     = 'run-lock';

let _client = null;

async function getRedis() {
  if (_client && _client.isOpen) return _client;
  _client = createClient({ url: process.env.REDIS_URL });
  _client.on('error', (err) => console.error('[redis] Client error:', err));
  await _client.connect();
  return _client;
}

// ── Projects ──────────────────────────────────────────────────────────────────
async function getProjects() {
  try {
    const redis = await getRedis();
    const data = await redis.get(PROJECTS_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveProjects(projects) {
  const redis = await getRedis();
  await redis.set(PROJECTS_KEY, JSON.stringify(projects));
}

async function addProject(project) {
  const projects = await getProjects();
  const id = Date.now().toString();
  const created = { id, ...project, createdAt: new Date().toISOString() };
  projects.push(created);
  await saveProjects(projects);
  return created;
}

async function updateProject(id, project) {
  const projects = await getProjects();
  const idx = projects.findIndex(p => p.id === id);
  if (idx === -1) throw new Error('Project not found');
  projects[idx] = { ...projects[idx], ...project, id };
  await saveProjects(projects);
  return projects[idx];
}

// ── Run Lock ──────────────────────────────────────────────────────────────────
/**
 * Returns the current lock object, or null if not locked.
 * Uses Redis TTL for automatic expiry — no manual stale-lock check needed.
 */
async function getLock() {
  try {
    const redis = await getRedis();
    const raw = await redis.get(LOCK_KEY);
    if (!raw) return null;
    const lock = JSON.parse(raw);
    if (!lock || !lock.type) return null;
    return lock;
  } catch {
    return null;
  }
}

/**
 * Acquires the lock. Returns true on success, false if already locked.
 * Lock auto-expires after LOCK_TTL_SECONDS via Redis TTL.
 */
async function acquireLock(type) {
  const existing = await getLock();
  if (existing) return false;
  const redis = await getRedis();
  await redis.set(
    LOCK_KEY,
    JSON.stringify({ type, startedAt: new Date().toISOString() }),
    { EX: LOCK_TTL_SECONDS }
  );
  return true;
}

/**
 * Releases the lock.
 */
async function releaseLock() {
  try {
    const redis = await getRedis();
    await redis.del(LOCK_KEY);
  } catch (e) {
    console.error('[lock] Failed to release lock:', e.message);
  }
}

// ── Per-Project Locks ─────────────────────────────────────────────────────────
// Uses separate Redis keys so individual project runs don't block each other.

function projectLockKey(projectId) {
  return `run-lock:${projectId}`;
}

async function getProjectLock(projectId) {
  try {
    const redis = await getRedis();
    const raw = await redis.get(projectLockKey(projectId));
    if (!raw) return null;
    const lock = JSON.parse(raw);
    return lock && lock.type ? lock : null;
  } catch {
    return null;
  }
}

async function acquireProjectLock(projectId) {
  const existing = await getProjectLock(projectId);
  if (existing) return false;
  const redis = await getRedis();
  await redis.set(
    projectLockKey(projectId),
    JSON.stringify({ type: 'manual', startedAt: new Date().toISOString() }),
    { EX: LOCK_TTL_SECONDS }
  );
  return true;
}

async function releaseProjectLock(projectId) {
  try {
    const redis = await getRedis();
    await redis.del(projectLockKey(projectId));
  } catch (e) {
    console.error(`[lock] Failed to release project lock for ${projectId}:`, e.message);
  }
}

module.exports = {
  getProjects,
  addProject,
  updateProject,
  getLock,
  acquireLock,
  releaseLock,
  getProjectLock,
  acquireProjectLock,
  releaseProjectLock,
};
