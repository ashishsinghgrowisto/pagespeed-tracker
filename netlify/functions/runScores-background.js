/**
 * Background Function — POST /.netlify/functions/runScores-background
 *
 * Guards:
 *  - Requires valid JWT.
 *  - Returns 409 if a cron or another manual run is already in progress.
 *  - Skips any project that already has rows for today's date.
 * Runs all PSI calls in parallel via Promise.allSettled.
 */

const { verifyToken } = require('./_utils/auth');
const { getProjects, acquireLock, releaseLock } = require('./_utils/storage');
const { getExistingScores, appendScoresToSheet } = require('./_utils/googleSheets');
const { fetchPageSpeed } = require('./_utils/psi');

function todayDateStr() {
  return new Date()
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .replace(/ /g, '-');
}

async function processProject(project, dateStr) {
  console.log(`[runScores-bg] → ${project.name}`);

  let existing = [];
  try {
    existing = await getExistingScores(project.sheetUrl);
  } catch (e) {
    console.warn(`  Could not read existing scores: ${e.message}`);
  }

  // ── Date-skip guard ───────────────────────────────────────────────────────
  const alreadyDone = existing.slice(1).some(r => r[0] === dateStr);
  if (alreadyDone) {
    console.log(`  ↩ Already has data for ${dateStr} — skipping`);
    return { project: project.name, skipped: true };
  }

  // ── Parallel PSI calls ────────────────────────────────────────────────────
  const tasks = [];
  for (const page of project.pages) {
    for (const strategy of ['mobile', 'desktop']) {
      tasks.push({ page, strategy });
    }
  }

  console.log(`  Firing ${tasks.length} PSI calls in parallel…`);
  const t0 = Date.now();

  const settled = await Promise.allSettled(
    tasks.map(({ page, strategy }) => fetchPageSpeed(page.url, strategy))
  );

  console.log(`  Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

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
          const p = parseFloat(r[4]);
          if (!isNaN(p)) { prevScore = p; break; }
        }
      }
      const diff = prevScore !== null ? score - prevScore : 0;
      rows.push([dateStr, page.name, page.url, paramName, score, diff]);
      console.log(`  ✓ ${page.name} | ${paramName}: ${score} (${diff >= 0 ? '+' : ''}${diff})`);
    } else {
      console.error(`  ✗ ${page.name} (${strategy}): ${result.reason?.message}`);
    }
  });

  if (rows.length) {
    await appendScoresToSheet(project.sheetUrl, rows);
    console.log(`  → Wrote ${rows.length} rows for "${project.name}"`);
  }

  return { project: project.name, skipped: false, rows: rows.length };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const user = verifyToken(event);
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  // ── Lock check ────────────────────────────────────────────────────────────
  const acquired = await acquireLock('manual');
  if (!acquired) {
    return {
      statusCode: 409,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'A score run is already in progress (cron or another manual trigger). Please wait for it to finish.',
      }),
    };
  }

  const dateStr = todayDateStr();
  console.log(`[runScores-bg] Manual run started — date: ${dateStr}`);

  try {
    const projects = await getProjects();

    if (!projects.length) {
      return { statusCode: 202, body: JSON.stringify({ started: true, message: 'No projects found.' }) };
    }

    const totalCalls = projects.reduce((s, p) => s + p.pages.length * 2, 0);
    console.log(`[runScores-bg] ${projects.length} project(s), up to ${totalCalls} PSI calls — all parallel`);

    const t0 = Date.now();
    await Promise.allSettled(projects.map(p => processProject(p, dateStr)));
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[runScores-bg] All done in ${elapsed}s`);

    return {
      statusCode: 202,
      body: JSON.stringify({
        started: true,
        projects: projects.length,
        message: `Score run complete for ${projects.length} project(s). Check your Google Sheets for updated data.`,
      }),
    };
  } finally {
    await releaseLock();
    console.log('[runScores-bg] Lock released.');
  }
};
