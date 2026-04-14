/**
 * Background Function — POST /.netlify/functions/runScores-background
 *
 * Runs all PSI calls for all projects IN PARALLEL using Promise.allSettled().
 * For N pages × 2 strategies across P projects, total time ≈ slowest single
 * PSI call (~60-90s) instead of N×P×60s sequential.
 *
 * Netlify Background Functions return 202 to the client immediately and keep
 * the handler alive (up to 15 min) until it returns.
 *
 * Requires a valid JWT in the Authorization header.
 */

const { verifyToken } = require('./_utils/auth');
const { getProjects } = require('./_utils/storage');
const { getExistingScores, appendScoresToSheet } = require('./_utils/googleSheets');
const { fetchPageSpeed } = require('./_utils/psi');

// ── Core parallel runner ──────────────────────────────────────────────────────
async function processProject(project, dateStr) {
  console.log(`[runScores-bg] → ${project.name} (${project.pages.length} pages)`);

  // Read existing scores once per project (for diff calculation)
  let existing = [];
  try {
    existing = await getExistingScores(project.sheetUrl);
  } catch (e) {
    console.warn(`  Could not read existing scores: ${e.message}`);
  }

  // Build every (page × strategy) task
  const tasks = [];
  for (const page of project.pages) {
    for (const strategy of ['mobile', 'desktop']) {
      tasks.push({ page, strategy });
    }
  }

  console.log(`  Firing ${tasks.length} PSI calls in parallel…`);
  const startMs = Date.now();

  // Run ALL calls concurrently
  const settled = await Promise.allSettled(
    tasks.map(({ page, strategy }) => fetchPageSpeed(page.url, strategy))
  );

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log(`  All PSI calls finished in ${elapsed}s`);

  // Build rows from results
  const rows = [];
  settled.forEach((result, i) => {
    const { page, strategy } = tasks[i];
    const paramName = strategy === 'mobile' ? 'Mobile Score' : 'Desktop Score';

    if (result.status === 'fulfilled') {
      const score = result.value;

      // Find previous score for diff
      let prevScore = null;
      for (let j = existing.length - 1; j >= 1; j--) {
        const r = existing[j];
        if (r[1] === page.name && r[3] === paramName && r[4] !== undefined) {
          const parsed = parseFloat(r[4]);
          if (!isNaN(parsed)) { prevScore = parsed; break; }
        }
      }

      const difference = prevScore !== null ? score - prevScore : 0;
      rows.push([dateStr, page.name, page.url, paramName, score, difference]);
      console.log(`  ✓ ${page.name} | ${paramName}: ${score} (${difference >= 0 ? '+' : ''}${difference})`);
    } else {
      console.error(`  ✗ ${page.name} (${strategy}): ${result.reason?.message}`);
    }
  });

  if (rows.length) {
    await appendScoresToSheet(project.sheetUrl, rows);
    console.log(`  → Wrote ${rows.length} rows for "${project.name}"`);
  }

  return { project: project.name, rows: rows.length, elapsed };
}

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const user = verifyToken(event);
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  console.log('[runScores-bg] Manual run started');

  let projects;
  try {
    projects = await getProjects();
  } catch (err) {
    console.error('[runScores-bg] Failed to load projects:', err.message);
    return { statusCode: 202, body: JSON.stringify({ started: true }) };
  }

  if (!projects.length) {
    console.log('[runScores-bg] No projects — nothing to do.');
    return { statusCode: 202, body: JSON.stringify({ started: true }) };
  }

  const today = new Date();
  const dateStr = today
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .replace(/ /g, '-');

  const totalTasks = projects.reduce((s, p) => s + p.pages.length * 2, 0);
  console.log(`[runScores-bg] ${projects.length} project(s), ${totalTasks} total PSI calls — running all in parallel`);

  const overallStart = Date.now();

  // Process ALL projects in parallel too
  const projectResults = await Promise.allSettled(
    projects.map(project => processProject(project, dateStr))
  );

  const totalElapsed = ((Date.now() - overallStart) / 1000).toFixed(1);

  projectResults.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[runScores-bg] Project "${projects[i].name}" failed: ${r.reason?.message}`);
    }
  });

  console.log(`[runScores-bg] All done in ${totalElapsed}s total.`);

  return {
    statusCode: 202,
    body: JSON.stringify({ done: true, projects: projects.length, totalElapsed }),
  };
};
