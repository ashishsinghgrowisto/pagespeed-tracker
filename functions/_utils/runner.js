/**
 * Score runner — shared logic for cron and manual triggers.
 * All functions accept `env` as the first parameter for KV + API key access.
 */

import { getProjects } from './storage.js';
import { getExistingScores, appendScoresToSheet } from './googleSheets.js';
import { fetchPageSpeed } from './psi.js';

const MAX_CONCURRENT = 10;

/** Bounded-concurrency Promise runner (like p-limit). */
async function pLimit(taskFactories, limit) {
  const results = new Array(taskFactories.length);
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < taskFactories.length) {
      const i = nextIdx++;
      try {
        results[i] = { status: 'fulfilled', value: await taskFactories[i]() };
      } catch (err) {
        results[i] = { status: 'rejected', reason: err };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, taskFactories.length) }, worker));
  return results;
}

function todayDateStr() {
  const d = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const day   = String(d.getUTCDate()).padStart(2, '0');
  const month = months[d.getUTCMonth()];
  const year  = d.getUTCFullYear();
  return `${day}-${month}-${year}`; // e.g. "15-Apr-2026"
}

/**
 * Runs scores for ALL projects.
 * Projects already scored today are skipped (idempotent for cron).
 */
export async function runAllProjects(env, context = 'manual') {
  const dateStr = todayDateStr();
  const tag = `[runner:${context}]`;

  const projects = await getProjects(env);
  if (!projects.length) {
    console.log(`${tag} No projects found.`);
    return { projects: 0, skipped: 0, dateStr };
  }

  console.log(`${tag} ${projects.length} project(s) | date: ${dateStr}`);

  // Check which projects already have today's data
  const projectData = await Promise.all(
    projects.map(async (project) => {
      let existing = [];
      try { existing = await getExistingScores(env, project.sheetUrl); } catch { /* ignore */ }
      const alreadyDone = existing.slice(1).some(r => r[0] === dateStr);
      return { project, existing, alreadyDone };
    })
  );

  let skipped = 0;
  const allTasks = [];

  for (const { project, existing, alreadyDone } of projectData) {
    if (alreadyDone) {
      console.log(`${tag} ↩ "${project.name}" already scored for ${dateStr} — skipping`);
      skipped++;
      continue;
    }
    for (const page of project.pages) {
      for (const strategy of ['mobile', 'desktop']) {
        allTasks.push({ project, existing, page, strategy });
      }
    }
  }

  if (!allTasks.length) {
    return { projects: projects.length, skipped, dateStr };
  }

  console.log(`${tag} ${allTasks.length} PSI calls queued`);
  const t0 = Date.now();

  const taskFactories = allTasks.map(({ project, existing, page, strategy }) => async () => {
    const paramName = strategy === 'mobile' ? 'Mobile Score' : 'Desktop Score';
    const score = await fetchPageSpeed(page.url, strategy, env);
    const diff  = calcDiff(existing, page.name, paramName, score);
    console.log(`${tag} ✓ [${project.name}] ${page.name} | ${paramName}: ${score} (${diff >= 0 ? '+' : ''}${diff})`);
    return { project, page, row: [dateStr, page.name, page.url, paramName, score, diff] };
  });

  const results = await pLimit(taskFactories, MAX_CONCURRENT);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`${tag} All PSI calls done in ${elapsed}s`);

  // Group rows by project and write to sheets
  const rowsByProject = new Map();
  results.forEach((result, i) => {
    const { project, page, strategy } = allTasks[i];
    const paramName = strategy === 'mobile' ? 'Mobile Score' : 'Desktop Score';
    if (!rowsByProject.has(project.id)) {
      rowsByProject.set(project.id, { project, rows: [] });
    }
    if (result.status === 'fulfilled') {
      rowsByProject.get(project.id).rows.push(result.value.row);
    } else {
      console.error(`${tag} ✗ [${project.name}] ${page.name} | ${paramName}: ${result.reason?.message}`);
      rowsByProject.get(project.id).rows.push([dateStr, page.name, page.url, paramName, 'FAILED', '']);
    }
  });

  await Promise.all(
    [...rowsByProject.values()].map(async ({ project, rows }) => {
      try {
        await appendScoresToSheet(env, project.sheetUrl, rows);
        console.log(`${tag} ✓ Wrote ${rows.length} rows for "${project.name}"`);
      } catch (e) {
        console.error(`${tag} ✗ Sheet write failed for "${project.name}": ${e.message}`);
      }
    })
  );

  return { projects: projects.length, skipped, tasks: allTasks.length, elapsed, dateStr };
}

/**
 * Runs scores for a SINGLE project only.
 * Always appends (no date-skip guard) — for manual "Run Now" triggers.
 */
export async function runProjectScores(env, projectId, context = 'manual') {
  const dateStr = todayDateStr();
  const tag = `[runner:${context}:${projectId}]`;

  const projects = await getProjects(env);
  const project = projects.find(p => p.id === projectId);
  if (!project) {
    console.log(`${tag} Project not found.`);
    return { found: false, projectId, dateStr };
  }

  console.log(`${tag} Running scores for "${project.name}" | date: ${dateStr}`);

  let existing = [];
  try { existing = await getExistingScores(env, project.sheetUrl); } catch { /* ignore */ }

  const allTasks = [];
  for (const page of project.pages) {
    for (const strategy of ['mobile', 'desktop']) {
      allTasks.push({ page, strategy });
    }
  }

  if (!allTasks.length) {
    return { found: true, skipped: true, projectName: project.name, dateStr };
  }

  const t0 = Date.now();

  const taskFactories = allTasks.map(({ page, strategy }) => async () => {
    const paramName = strategy === 'mobile' ? 'Mobile Score' : 'Desktop Score';
    const score = await fetchPageSpeed(page.url, strategy, env);
    const diff  = calcDiff(existing, page.name, paramName, score);
    console.log(`${tag} ✓ ${page.name} | ${paramName}: ${score} (${diff >= 0 ? '+' : ''}${diff})`);
    return { row: [dateStr, page.name, page.url, paramName, score, diff] };
  });

  const results = await pLimit(taskFactories, MAX_CONCURRENT);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const rows = results.map((result, i) => {
    const { page, strategy } = allTasks[i];
    const paramName = strategy === 'mobile' ? 'Mobile Score' : 'Desktop Score';
    if (result.status === 'fulfilled') return result.value.row;
    console.error(`${tag} ✗ ${page.name} | ${paramName}: ${result.reason?.message}`);
    return [dateStr, page.name, page.url, paramName, 'FAILED', ''];
  });

  await appendScoresToSheet(env, project.sheetUrl, rows);
  console.log(`${tag} ✓ Wrote ${rows.length} rows for "${project.name}"`);

  return { found: true, skipped: false, projectName: project.name, tasks: allTasks.length, elapsed, dateStr };
}

/** Finds the previous score for a given page+param and returns the diff. */
function calcDiff(existing, pageName, paramName, score) {
  for (let j = existing.length - 1; j >= 1; j--) {
    const r = existing[j];
    if (r[1] === pageName && r[3] === paramName && r[4] !== undefined) {
      const prev = parseFloat(r[4]);
      if (!isNaN(prev)) return score - prev;
    }
  }
  return 0;
}
