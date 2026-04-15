/**
 * Project storage + run-lock using Upstash Redis.
 *
 * Keys:
 *   "projects"  — JSON array of all project configs
 *   "run-lock"  — lock object while a cron/manual run is in progress
 *
 * Env vars (auto-set when you connect an Upstash Redis database in Vercel):
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 */
const { Redis } = require('@upstash/redis');

// Lock auto-expires after 20 min (safety valve for crashed runs)
const LOCK_TTL_SECONDS = 20 * 60;

const PROJECTS_KEY = 'projects';
const LOCK_KEY     = 'run-lock';

function getRedis() {
  return new Redis({
    url:   process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

// ── Projects ──────────────────────────────────────────────────────────────────
async function getProjects() {
  try {
    const redis = getRedis();
    const data = await redis.get(PROJECTS_KEY);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function saveProjects(projects) {
  const redis = getRedis();
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
    const redis = getRedis();
    const raw = await redis.get(LOCK_KEY);
    if (!raw) return null;
    // Upstash returns parsed JSON automatically if stored as JSON string
    const lock = typeof raw === 'string' ? JSON.parse(raw) : raw;
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
  const redis = getRedis();
  await redis.set(
    LOCK_KEY,
    JSON.stringify({ type, startedAt: new Date().toISOString() }),
    { ex: LOCK_TTL_SECONDS }
  );
  return true;
}

/**
 * Releases the lock.
 */
async function releaseLock() {
  try {
    const redis = getRedis();
    await redis.del(LOCK_KEY);
  } catch (e) {
    console.error('[lock] Failed to release lock:', e.message);
  }
}

module.exports = {
  getProjects,
  addProject,
  updateProject,
  getLock,
  acquireLock,
  releaseLock,
};
