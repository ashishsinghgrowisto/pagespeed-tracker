const { verifyToken } = require('./_utils/auth');
const { getProjects, addProject, updateProject } = require('./_utils/storage');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

module.exports = async (req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(204).end();

  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // GET /api/projects        — list all
    // GET /api/projects?id=xxx — get one by id
    if (req.method === 'GET') {
      const projects = await getProjects();
      const { id } = req.query || {};
      if (id) {
        const project = projects.find(p => p.id === id);
        if (!project) return res.status(404).json({ error: 'Not found' });
        return res.status(200).json(project);
      }
      return res.status(200).json(projects);
    }

    // POST /api/projects — create
    if (req.method === 'POST') {
      const data = req.body || {};
      if (!data.name || !data.sheetUrl || !Array.isArray(data.pages) || data.pages.length === 0) {
        return res.status(400).json({ error: 'name, sheetUrl and at least one page are required' });
      }
      const created = await addProject(data);
      return res.status(201).json(created);
    }

    // PUT /api/projects?id=xxx — update
    if (req.method === 'PUT') {
      const { id } = req.query || {};
      if (!id) return res.status(400).json({ error: 'id query param required' });
      const data = req.body || {};
      await updateProject(id, data);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('projects handler error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
