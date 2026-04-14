const BASE = '/.netlify/functions';

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
  return handleResponse(res);
}
