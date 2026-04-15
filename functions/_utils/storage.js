/**
 * Project storage + run-lock using Cloudflare Workers KV.
 *
 * All functions receive `env` (the Cloudflare Pages Function context env)
 * and access the KV namespace via `env.KV`.
 *
 * Keys:
 *   "projects"        — JSON array of all project configs
 *   "run-lock"        — global run lock object (type, startedAt)
 *   "run-lock:<id>"   — per-project run lock
 */

const PROJECTS_KEY = 'projects';
const LOCK_KEY = 'run-lock';
const LOCK_TTL = 1200; // 20 min (seconds)

// ── Projects ──────────────────────────────────────────────────────────────────

export async function getProjects(env) {
  try {
    const data = await env.KV.get(PROJECTS_KEY, 'json');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function saveProjects(env, projects) {
  await env.KV.put(PROJECTS_KEY, JSON.stringify(projects));
}

export async function addProject(env, project) {
  const projects = await getProjects(env);
  const id = Date.now().toString();
  const created = { id, ...project, createdAt: new Date().toISOString() };
  projects.push(created);
  await saveProjects(env, projects);
  return created;
}

export async function updateProject(env, id, project) {
  const projects = await getProjects(env);
  const idx = projects.findIndex(p => p.id === id);
  if (idx === -1) throw new Error('Project not found');
  projects[idx] = { ...projects[idx], ...project, id };
  await saveProjects(env, projects);
  return projects[idx];
}

// ── Global Run Lock ───────────────────────────────────────────────────────────

export async function getLock(env) {
  try {
    const data = await env.KV.get(LOCK_KEY, 'json');
    return (data && data.type) ? data : null;
  } catch {
    return null;
  }
}

export async function acquireLock(env, type) {
  if (await getLock(env)) return false;
  await env.KV.put(
    LOCK_KEY,
    JSON.stringify({ type, startedAt: new Date().toISOString() }),
    { expirationTtl: LOCK_TTL }
  );
  return true;
}

export async function releaseLock(env) {
  try { await env.KV.delete(LOCK_KEY); } catch { /* ignore */ }
}

// ── Per-Project Locks ─────────────────────────────────────────────────────────

const projectLockKey = (id) => `run-lock:${id}`;

export async function acquireProjectLock(env, projectId) {
  try {
    const existing = await env.KV.get(projectLockKey(projectId), 'json');
    if (existing) return false;
    await env.KV.put(
      projectLockKey(projectId),
      JSON.stringify({ type: 'manual', startedAt: new Date().toISOString() }),
      { expirationTtl: LOCK_TTL }
    );
    return true;
  } catch {
    return false;
  }
}

export async function releaseProjectLock(env, projectId) {
  try { await env.KV.delete(projectLockKey(projectId)); } catch { /* ignore */ }
}
