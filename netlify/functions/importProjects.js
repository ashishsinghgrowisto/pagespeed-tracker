/**
 * POST /api/importProjects
 * Bulk-creates multiple projects from a parsed CSV/Excel import.
 *
 * Body: { projects: [{ name, sheetUrl, pages: [{ name, url }] }] }
 * Response: { added: string[], skipped: string[], errors: [{ name, reason }] }
 *
 * Projects whose name already exists in Redis are skipped (not duplicated).
 */

const { verifyToken } = require('./_utils/auth');
const { getProjects, addProject } = require('./_utils/storage');
const { corsHeaders } = require('./_utils/googleSheets');

const CORS = {
  ...corsHeaders(),
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  const user = verifyToken(event);
  if (!user) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const incoming = body.projects;

    if (!Array.isArray(incoming) || incoming.length === 0) {
      return {
        statusCode: 400,
        headers: CORS,
        body: JSON.stringify({ error: 'projects array is required' }),
      };
    }

    // Build set of existing project names to avoid duplicates
    const existing = await getProjects();
    const existingNames = new Set(existing.map(p => p.name.toLowerCase().trim()));

    const results = { added: [], skipped: [], errors: [] };

    for (const project of incoming) {
      const name = (project.name || '').trim();

      if (!name || !project.sheetUrl || !Array.isArray(project.pages) || project.pages.length === 0) {
        results.errors.push({ name: name || '(unnamed)', reason: 'Missing required fields (name, sheetUrl, or pages)' });
        continue;
      }

      if (existingNames.has(name.toLowerCase())) {
        results.skipped.push(name);
        continue;
      }

      try {
        await addProject({ name, sheetUrl: project.sheetUrl, pages: project.pages });
        results.added.push(name);
        // Prevent duplicates within the same batch
        existingNames.add(name.toLowerCase());
      } catch (e) {
        results.errors.push({ name, reason: e.message || 'Unknown error' });
      }
    }

    console.log(`[importProjects] added=${results.added.length} skipped=${results.skipped.length} errors=${results.errors.length}`);
    return { statusCode: 200, headers: CORS, body: JSON.stringify(results) };
  } catch (err) {
    console.error('[importProjects] error:', err);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message || 'Internal server error' }),
    };
  }
};
