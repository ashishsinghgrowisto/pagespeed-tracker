/**
 * Scheduled Netlify Function — runs daily at 02:00 UTC.
 * Schedule declared in netlify.toml: [functions."fetchScores"] schedule = "0 2 * * *"
 *
 * Runs ALL PSI calls in parallel (Promise.allSettled) so total runtime is
 * bounded by the slowest single call (~60-90s) not by N × calls × 60s.
 */

const { getProjects } = require('./_utils/storage');
const { getExistingScores, appendScoresToSheet } = require('./_utils/googleSheets');
const { fetchPageSpeed } = require('./_utils/psi');

async function processProject(project, dateStr) {
  console.log(`[fetchScores] → ${project.name} (${project.pages.length} pages)`);

  let existing = [];
  try {
    existing = await getExistingScores(project.sheetUrl);
  } catch (e) {
    console.warn(`  Could not read existing scores: ${e.message}`);
  }

  const tasks = [];
  for (const page of project.pages) {
    for (const strategy of ['mobile', 'desktop']) {
      tasks.push({ page, strategy });
    }
  }

  console.log(`  Firing ${tasks.length} PSI calls in parallel…`);
  const startMs = Date.now();

  const settled = await Promise.allSettled(
    tasks.map(({ page, strategy }) => fetchPageSpeed(page.url, strategy))
  );

  console.log(`  Done in ${((Date.now() - startMs) / 1000).toFixed(1)}s`);

  const rows = [];
  settled.forEach((result, i) => {
    const { page, strategy } = tasks[i];
    const paramName = strategy === 'mobile' ? 'Mobile Score' : 'Desktop Score';

    if (result.status === 'fulfilled') {
      const score = result.value;
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
}

exports.handler = async (event) => {
  console.log('[fetchScores] Daily run started');

  let projects;
  try {
    projects = await getProjects();
  } catch (err) {
    console.error('[fetchScores] Failed to read projects:', err.message);
    return { statusCode: 500, body: err.message };
  }

  if (!projects.length) {
    console.log('[fetchScores] No projects — nothing to do.');
    return { statusCode: 200, body: 'No projects' };
  }

  const today = new Date();
  const dateStr = today
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .replace(/ /g, '-');

  const totalTasks = projects.reduce((s, p) => s + p.pages.length * 2, 0);
  console.log(`[fetchScores] ${projects.length} project(s), ${totalTasks} PSI calls — all parallel`);

  const overallStart = Date.now();

  await Promise.allSettled(
    projects.map(project => processProject(project, dateStr))
  );

  console.log(`[fetchScores] Done in ${((Date.now() - overallStart) / 1000).toFixed(1)}s`);
  return { statusCode: 200, body: 'OK' };
};
