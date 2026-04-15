/**
 * Project storage + run-lock using Vercel KV (Redis).
 *
 * Keys:
 *   "projects"  — JSON array of all project configs
 *   "run-lock"  — lock object while a cron/manual run is in progress
 *
 * @vercel/kv stores and retrieves JSON natively — no manual stringify/parse needed.
 */
const { kv } = require('@vercel/kv');

const PROJECTS_KEY = 'projects';
const LOCK_KEY     = 'run-lock';

// Lock auto-expires after 20 min (safety valve for crashed runs)
const LOCK_TTL_MS = 20 * 60 * 1000;

// ── Projects ──────────────────────────────────────────────────────────────────
async function getProjects() {
  try {
    const data = await kv.get(PROJECTS_KEY);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function saveProjects(projects) {
  await kv.set(PROJECTS_KEY, projects);
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
 * Returns the current lock object, or null if not locked / lock is stale.
 */
async function getLock() {
  try {
    const lock = await kv.get(LOCK_KEY);
    if (!lock || !lock.type) return null;
    // Auto-expire stale locks
    if (Date.now() - new Date(lock.startedAt).getTime() > LOCK_TTL_MS) {
      await kv.del(LOCK_KEY).catch(() => {});
      return null;
    }
    return lock;
  } catch {
    return null;
  }
}

/**
 * Acquires the lock. Returns true on success, false if already locked.
 */
async function acquireLock(type) {
  const existing = await getLock();
  if (existing) return false;
  await kv.set(LOCK_KEY, { type, startedAt: new Date().toISOString() });
  return true;
}

/**
 * Releases the lock.
 */
async function releaseLock() {
  try {
    await kv.del(LOCK_KEY);
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
