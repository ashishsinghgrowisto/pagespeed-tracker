/**
 * POST /api/importProjects — bulk-creates projects from a CSV/Excel import.
 * Body: { projects: [{ name, sheetUrl, pages: [{ name, url }] }] }
 */

import { verifyToken } from '../_utils/auth.js';
import { getProjects, addProject } from '../_utils/storage.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await verifyToken(request, env.JWT_SECRET || 'fallback-secret');
  if (!user) return json({ error: 'Unauthorized' }, 401);

  try {
    const body = await request.json();
    const incoming = body.projects;

    if (!Array.isArray(incoming) || incoming.length === 0) {
      return json({ error: 'projects array is required' }, 400);
    }

    const existing = await getProjects(env);
    const existingNames = new Set(existing.map(p => p.name.toLowerCase().trim()));

    const results = { added: [], skipped: [], errors: [] };

    for (const project of incoming) {
      const name = (project.name || '').trim();

      if (!name || !project.sheetUrl || !Array.isArray(project.pages) || project.pages.length === 0) {
        results.errors.push({ name: name || '(unnamed)', reason: 'Missing required fields' });
        continue;
      }

      if (existingNames.has(name.toLowerCase())) {
        results.skipped.push(name);
        continue;
      }

      try {
        await addProject(env, { name, sheetUrl: project.sheetUrl, pages: project.pages });
        results.added.push(name);
        existingNames.add(name.toLowerCase());
      } catch (e) {
        results.errors.push({ name, reason: e.message || 'Unknown error' });
      }
    }

    console.log(`[importProjects] added=${results.added.length} skipped=${results.skipped.length} errors=${results.errors.length}`);
    return json(results);
  } catch (err) {
    console.error('[importProjects] error:', err);
    return json({ error: err.message || 'Internal server error' }, 500);
  }
}
