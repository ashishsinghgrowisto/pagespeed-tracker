/**
 * Project storage + run-lock using Netlify Blobs.
 *
 * Keys in the "pagespeed-tracker" store:
 *   "projects"  — JSON array of all project configs
 *   "run-lock"  — JSON lock object while a cron/manual run is in progress
 */
const { getStore } = require('@netlify/blobs');

const STORE_NAME  = 'pagespeed-tracker';
const PROJECTS_KEY = 'projects';
const LOCK_KEY    = 'run-lock';

// Lock expires after 20 min (safety valve so a crashed run never permanently blocks)
const LOCK_TTL_MS = 20 * 60 * 1000;

function getProjectStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) {
    return getStore({ name: STORE_NAME, siteID, token });
  }
  return getStore(STORE_NAME);
}

// ── Projects ──────────────────────────────────────────────────────────────────
async function getProjects() {
  const store = getProjectStore();
  try {
    const raw = await store.get(PROJECTS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function saveProjects(projects) {
  const store = getProjectStore();
  await store.set(PROJECTS_KEY, JSON.stringify(projects));
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
 * { type: 'cron'|'manual', startedAt: ISO string }
 */
async function getLock() {
  const store = getProjectStore();
  try {
    const raw = await store.get(LOCK_KEY);
    if (!raw) return null;
    const lock = JSON.parse(raw);
    // Auto-expire stale locks so a crash can't block runs forever
    if (Date.now() - new Date(lock.startedAt).getTime() > LOCK_TTL_MS) {
      await store.delete(LOCK_KEY).catch(() => {});
      return null;
    }
    return lock;
  } catch {
    return null;
  }
}

/**
 * Acquires the lock. Returns true on success, false if already locked.
 * @param {'cron'|'manual'} type
 */
async function acquireLock(type) {
  const existing = await getLock();
  if (existing) return false; // already locked
  const store = getProjectStore();
  await store.set(LOCK_KEY, JSON.stringify({
    type,
    startedAt: new Date().toISOString(),
  }));
  return true;
}

/** Releases the lock unconditionally. */
async function releaseLock() {
  const store = getProjectStore();
  await store.delete(LOCK_KEY).catch(() => {});
}

module.exports = {
  getProjects,
  addProject,
  updateProject,
  getLock,
  acquireLock,
  releaseLock,
};
