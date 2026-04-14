const { verifyToken } = require('./_utils/auth');
const { getProjects, addProject, updateProject, corsHeaders } = require('./_utils/googleSheets');

const CORS = {
  ...corsHeaders(),
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

exports.handler = async (event) => {
  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  // Auth check
  const user = verifyToken(event);
  if (!user) {
    return {
      statusCode: 401,
      headers: CORS,
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  try {
    // GET /projects  — list all
    // GET /projects?id=xxx  — get one by id
    if (event.httpMethod === 'GET') {
      const projects = await getProjects();
      const { id } = event.queryStringParameters || {};
      if (id) {
        const project = projects.find(p => p.id === id);
        if (!project) {
          return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Not found' }) };
        }
        return { statusCode: 200, headers: CORS, body: JSON.stringify(project) };
      }
      return { statusCode: 200, headers: CORS, body: JSON.stringify(projects) };
    }

    // POST /projects  — create
    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body || '{}');
      if (!data.name || !data.sheetUrl || !Array.isArray(data.pages) || data.pages.length === 0) {
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ error: 'name, sheetUrl and at least one page are required' }),
        };
      }
      const created = await addProject(data);
      return { statusCode: 201, headers: CORS, body: JSON.stringify(created) };
    }

    // PUT /projects?id=xxx  — update
    if (event.httpMethod === 'PUT') {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'id query param required' }) };
      }
      const data = JSON.parse(event.body || '{}');
      await updateProject(id, data);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('projects handler error:', err);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message || 'Internal server error' }),
    };
  }
};
