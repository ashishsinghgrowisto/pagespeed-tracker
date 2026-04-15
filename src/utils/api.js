const BASE = '/api';

function headers() {
  const token = localStorage.getItem('pst_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export async function getRunStatus() {
  const res = await fetch(`${BASE}/runStatus`, { headers: headers() });
  return handleResponse(res);
}

export async function login(username, password) {
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return handleResponse(res);
}

export async function getProjects() {
  const res = await fetch(`${BASE}/projects`, { headers: headers() });
  return handleResponse(res);
}

export async function getProject(id) {
  const res = await fetch(`${BASE}/projects?id=${id}`, { headers: headers() });
  return handleResponse(res);
}

export async function createProject(project) {
  const res = await fetch(`${BASE}/projects`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(project),
  });
  return handleResponse(res);
}

export async function updateProject(id, project) {
  const res = await fetch(`${BASE}/projects?id=${id}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(project),
  });
  return handleResponse(res);
}

export async function runScoresNow() {
  const res = await fetch(`${BASE}/runScores`, {
    method: 'POST',
    headers: headers(),
  });
  // 202 = background started, 409 = already running — both handled as JSON
  if (res.status === 202) return res.json().catch(() => ({ started: true }));
  return handleResponse(res); // throws for 401, 409, etc.
}

/**
 * Bulk-imports projects from a parsed CSV/Excel file.
 * @param {Array<{name, sheetUrl, pages: [{name, url}]}>} projects
 */
export async function importProjects(projects) {
  const res = await fetch(`${BASE}/importProjects`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ projects }),
  });
  return handleResponse(res);
}

/**
 * Triggers a manual score run for a single project only.
 * Uses the background function (15-min timeout) to handle projects with many pages.
 * Other projects' sheets are never touched.
 */
export async function runProjectNow(projectId) {
  const res = await fetch(`${BASE}/runScores-background?id=${encodeURIComponent(projectId)}`, {
    method: 'POST',
    headers: headers(),
  });
  if (res.status === 202) {
    const data = await res.json().catch(() => ({}));
    return {
      started: true,
      message: data.message || 'Score run started — results will appear in your Google Sheet in a few minutes.',
    };
  }
  return handleResponse(res);
}
