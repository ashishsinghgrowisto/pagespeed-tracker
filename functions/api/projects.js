import { verifyToken } from '../_utils/auth.js';
import { getProjects, addProject, updateProject } from '../_utils/storage.js';

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

  const user = await verifyToken(request, env.JWT_SECRET || 'fallback-secret');
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const url = new URL(request.url);
  const id  = url.searchParams.get('id');

  try {
    // GET /api/projects        — list all
    // GET /api/projects?id=xxx — get one
    if (request.method === 'GET') {
      const projects = await getProjects(env);
      if (id) {
        const project = projects.find(p => p.id === id);
        if (!project) return json({ error: 'Not found' }, 404);
        return json(project);
      }
      return json(projects);
    }

    // POST /api/projects — create
    if (request.method === 'POST') {
      const data = await request.json();
      if (!data.name || !data.sheetUrl || !Array.isArray(data.pages) || data.pages.length === 0) {
        return json({ error: 'name, sheetUrl and at least one page are required' }, 400);
      }
      const created = await addProject(env, data);
      return json(created, 201);
    }

    // PUT /api/projects?id=xxx — update
    if (request.method === 'PUT') {
      if (!id) return json({ error: 'id query param required' }, 400);
      const data = await request.json();
      await updateProject(env, id, data);
      return json({ success: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('[projects] error:', err);
    return json({ error: err.message || 'Internal server error' }, 500);
  }
}
