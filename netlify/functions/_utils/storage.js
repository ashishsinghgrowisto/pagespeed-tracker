/**
 * Project storage using Netlify Blobs.
 * Projects are stored as a single JSON blob under the key "projects".
 * No master Google Sheet is required — the service account only needs
 * write access to each project's individual score sheet.
 */
const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'pagespeed-tracker';
const PROJECTS_KEY = 'projects';

function getProjectStore() {
  // When running inside a Netlify function, NETLIFY_BLOBS_CONTEXT is set automatically.
  // When deployed via CLI, we fall back to explicit siteID + token from env vars.
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;

  if (siteID && token) {
    return getStore({ name: STORE_NAME, siteID, token });
  }
  // Automatic context (standard Netlify deploy)
  return getStore(STORE_NAME);
}

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

module.exports = { getProjects, addProject, updateProject };
