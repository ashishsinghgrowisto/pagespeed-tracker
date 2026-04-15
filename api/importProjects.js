/**
 * POST /api/importProjects
 * Bulk-creates multiple projects from a parsed CSV/Excel import.
 *
 * Body: { projects: [{ name, sheetUrl, pages: [{ name, url }] }] }
 * Response: { added: string[], skipped: string[], errors: [{ name, reason }] }
 */

const { verifyToken } = require('./_utils/auth');
const { getProjects, addProject } = require('./_utils/storage');

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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const incoming = (req.body || {}).projects;

    if (!Array.isArray(incoming) || incoming.length === 0) {
      return res.status(400).json({ error: 'projects array is required' });
    }

    const existing = await getProjects();
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
        await addProject({ name, sheetUrl: project.sheetUrl, pages: project.pages });
        results.added.push(name);
        existingNames.add(name.toLowerCase());
      } catch (e) {
        results.errors.push({ name, reason: e.message || 'Unknown error' });
      }
    }

    console.log(`[importProjects] added=${results.added.length} skipped=${results.skipped.length} errors=${results.errors.length}`);
    return res.status(200).json(results);
  } catch (err) {
    console.error('[importProjects] error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
