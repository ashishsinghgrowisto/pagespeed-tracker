/**
 * Scheduled Netlify Function — runs daily at 18:30 UTC (12:00 AM IST).
 * Schedule declared in netlify.toml: [functions."fetchScores"] schedule = "30 18 * * *"
 *
 * Guards:
 *  - Acquires a run-lock so manual triggers are blocked while this runs.
 *  - Skips any project that already has rows for today's date in its sheet.
 * Runs all PSI calls in parallel via Promise.allSettled.
 */

const { getProjects, acquireLock, releaseLock } = require('./_utils/storage');
const { getExistingScores, appendScoresToSheet } = require('./_utils/googleSheets');
const { fetchPageSpeed } = require('./_utils/psi');

function todayDateStr() {
  return new Date()
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .replace(/ /g, '-'); // e.g. "14-Apr-2026"
}

async function processProject(project, dateStr) {
  console.log(`[fetchScores] → ${project.name}`);

  let existing = [];
  try {
    existing = await getExistingScores(project.sheetUrl);
  } catch (e) {
    console.warn(`  Could not read existing scores: ${e.message}`);
  }

  // ── Date-skip guard ───────────────────────────────────────────────────────
  // Skip if ANY data row already has today's date (row[0] === dateStr).
  // Row index 0 is the header, so we check from index 1 onward.
  const alreadyDone = existing.slice(1).some(r => r[0] === dateStr);
  if (alreadyDone) {
    console.log(`  ↩ Already has data for ${dateStr} — skipping`);
    return;
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
    console.log(`  → Wrote ${rows.length} rows`);
  }
}

exports.handler = async () => {
  const dateStr = todayDateStr();
  console.log(`[fetchScores] Cron fired — date: ${dateStr}`);

  // ── Acquire lock ──────────────────────────────────────────────────────────
  const acquired = await acquireLock('cron');
  if (!acquired) {
    console.warn('[fetchScores] Another run is already in progress — aborting.');
    return { statusCode: 200, body: 'Skipped — already running' };
  }

  try {
    const projects = await getProjects();
    if (!projects.length) {
      console.log('[fetchScores] No projects.');
      return { statusCode: 200, body: 'No projects' };
    }

    const totalCalls = projects.reduce((s, p) => s + p.pages.length * 2, 0);
    console.log(`[fetchScores] ${projects.length} project(s), up to ${totalCalls} PSI calls — all parallel`);

    const t0 = Date.now();
    await Promise.allSettled(projects.map(p => processProject(p, dateStr)));
    console.log(`[fetchScores] Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    return { statusCode: 200, body: 'OK' };
  } finally {
    await releaseLock();
    console.log('[fetchScores] Lock released.');
  }
};
