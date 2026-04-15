/**
 * Shared score-fetch runner used by both the scheduled cron and the
 * manual trigger function.
 *
 * Key design:
 *  - All PSI calls across ALL projects run concurrently but capped at
 *    MAX_CONCURRENT (10) to avoid Google PSI rate limits.
 *  - Projects already scored today are skipped automatically.
 *  - Results are written to each project's Google Sheet as they arrive.
 */

const { getProjects } = require('./storage');
const { getExistingScores, appendScoresToSheet } = require('./googleSheets');
const { fetchPageSpeed } = require('./psi');

const MAX_CONCURRENT = 10; // max simultaneous PSI API calls

/**
 * Runs an array of async task-factories with a concurrency cap.
 * Returns results in the same order as tasks (like Promise.allSettled).
 */
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

  // Spin up `limit` workers in parallel
  await Promise.all(Array.from({ length: Math.min(limit, taskFactories.length) }, worker));
  return results;
}

function todayDateStr() {
  return new Date()
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .replace(/ /g, '-'); // e.g. "14-Apr-2026"
}

/**
 * Main runner: fetches scores for all projects, respecting the date-skip guard.
 * @param {string} context  - 'cron' | 'manual' (used only for logging)
 */
async function runAllProjects(context = 'manual') {
  const dateStr = todayDateStr();
  const tag = `[runner:${context}]`;

  const projects = await getProjects();
  if (!projects.length) {
    console.log(`${tag} No projects found.`);
    return { projects: 0, skipped: 0, dateStr };
  }

  console.log(`${tag} ${projects.length} project(s) | date: ${dateStr} | concurrency: ${MAX_CONCURRENT}`);

  // ── Build a flat list of (project, page, strategy) tasks ─────────────────
  // But first, read existing scores for each project in parallel to check skip
  const projectData = await Promise.all(
    projects.map(async (project) => {
      let existing = [];
      try {
        existing = await getExistingScores(project.sheetUrl);
      } catch (e) {
        console.warn(`${tag} Could not read scores for "${project.name}": ${e.message}`);
      }

      const alreadyDone = existing.slice(1).some(r => r[0] === dateStr);
      return { project, existing, alreadyDone };
    })
  );

  let skipped = 0;
  const allTasks = []; // { project, existing, page, strategy }

  for (const { project, existing, alreadyDone } of projectData) {
    if (alreadyDone) {
      console.log(`${tag} ↩ "${project.name}" already has data for ${dateStr} — skipping`);
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
    console.log(`${tag} All projects already scored for today — nothing to do.`);
    return { projects: projects.length, skipped, dateStr };
  }

  console.log(`${tag} ${allTasks.length} PSI calls queued (max ${MAX_CONCURRENT} concurrent)`);
  const t0 = Date.now();

  // ── Run with bounded concurrency ─────────────────────────────────────────
  const taskFactories = allTasks.map(({ project, existing, page, strategy }) => async () => {
    const paramName = strategy === 'mobile' ? 'Mobile Score' : 'Desktop Score';
    const score = await fetchPageSpeed(page.url, strategy);

    let prevScore = null;
    for (let j = existing.length - 1; j >= 1; j--) {
      const r = existing[j];
      if (r[1] === page.name && r[3] === paramName && r[4] !== undefined) {
        const p = parseFloat(r[4]);
        if (!isNaN(p)) { prevScore = p; break; }
      }
    }

    const diff = prevScore !== null ? score - prevScore : 0;
    console.log(`${tag} ✓ [${project.name}] ${page.name} | ${paramName}: ${score} (${diff >= 0 ? '+' : ''}${diff})`);
    return { project, page, paramName, row: [dateStr, page.name, page.url, paramName, score, diff] };
  });

  const results = await pLimit(taskFactories, MAX_CONCURRENT);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`${tag} All PSI calls done in ${elapsed}s`);

  // ── Group rows by project and write to sheets ────────────────────────────
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
      // All 3 retries exhausted — write FAILED so it's visible in the sheet
      console.error(`${tag} ✗ [${project.name}] ${page.name} | ${paramName}: FAILED — ${result.reason?.message}`);
      rowsByProject.get(project.id).rows.push(
        [dateStr, page.name, page.url, paramName, 'FAILED', '']
      );
    }
  });

  await Promise.all(
    [...rowsByProject.values()].map(async ({ project, rows }) => {
      try {
        await appendScoresToSheet(project.sheetUrl, rows);
        console.log(`${tag} ✓ Wrote ${rows.length} rows for "${project.name}"`);
      } catch (e) {
        console.error(`${tag} Failed to write sheet for "${project.name}": ${e.message}`);
      }
    })
  );

  return { projects: projects.length, skipped, tasks: allTasks.length, elapsed, dateStr };
}

/**
 * Runs scores for a single project only.
 * Uses the same PSI fetching and sheet-writing logic as runAllProjects
 * but scoped to one project — so other projects' sheets are never touched.
 *
 * @param {string} projectId  - ID of the project to run
 * @param {string} context    - 'manual' (always, for per-project runs)
 */
async function runProjectScores(projectId, context = 'manual') {
  const dateStr = todayDateStr();
  const tag = `[runner:${context}:${projectId}]`;

  const projects = await getProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) {
    console.log(`${tag} Project not found.`);
    return { found: false, projectId, dateStr };
  }

  console.log(`${tag} Running scores for "${project.name}" | date: ${dateStr}`);

  // Check if already scored today
  let existing = [];
  try {
    existing = await getExistingScores(project.sheetUrl);
  } catch (e) {
    console.warn(`${tag} Could not read existing scores: ${e.message}`);
  }

  const alreadyDone = existing.slice(1).some(r => r[0] === dateStr);
  if (alreadyDone) {
    console.log(`${tag} ↩ Already has data for ${dateStr} — skipping`);
    return { found: true, skipped: true, projectName: project.name, dateStr };
  }

  // Build task list for this project only
  const allTasks = [];
  for (const page of project.pages) {
    for (const strategy of ['mobile', 'desktop']) {
      allTasks.push({ project, existing, page, strategy });
    }
  }

  if (!allTasks.length) {
    return { found: true, skipped: true, projectName: project.name, dateStr };
  }

  console.log(`${tag} ${allTasks.length} PSI calls queued (max ${MAX_CONCURRENT} concurrent)`);
  const t0 = Date.now();

  const taskFactories = allTasks.map(({ page, strategy }) => async () => {
    const paramName = strategy === 'mobile' ? 'Mobile Score' : 'Desktop Score';
    const score = await fetchPageSpeed(page.url, strategy);

    let prevScore = null;
    for (let j = existing.length - 1; j >= 1; j--) {
      const r = existing[j];
      if (r[1] === page.name && r[3] === paramName && r[4] !== undefined) {
        const p = parseFloat(r[4]);
        if (!isNaN(p)) { prevScore = p; break; }
      }
    }

    const diff = prevScore !== null ? score - prevScore : 0;
    console.log(`${tag} ✓ ${page.name} | ${paramName}: ${score} (${diff >= 0 ? '+' : ''}${diff})`);
    return { page, paramName, row: [dateStr, page.name, page.url, paramName, score, diff] };
  });

  const results = await pLimit(taskFactories, MAX_CONCURRENT);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`${tag} All PSI calls done in ${elapsed}s`);

  // Write rows to this project's sheet only
  const rows = [];
  results.forEach((result, i) => {
    const { page, strategy } = allTasks[i];
    const paramName = strategy === 'mobile' ? 'Mobile Score' : 'Desktop Score';
    if (result.status === 'fulfilled') {
      rows.push(result.value.row);
    } else {
      console.error(`${tag} ✗ ${page.name} | ${paramName}: FAILED — ${result.reason?.message}`);
      rows.push([dateStr, page.name, page.url, paramName, 'FAILED', '']);
    }
  });

  try {
    await appendScoresToSheet(project.sheetUrl, rows);
    console.log(`${tag} ✓ Wrote ${rows.length} rows for "${project.name}"`);
  } catch (e) {
    console.error(`${tag} Failed to write sheet: ${e.message}`);
    throw e;
  }

  return { found: true, skipped: false, projectName: project.name, tasks: allTasks.length, elapsed, dateStr };
}

module.exports = { runAllProjects, runProjectScores };
