/**
 * Background Function — POST /.netlify/functions/runScores-background
 *
 * Netlify Background Functions return 202 immediately and continue
 * running for up to 15 minutes, so long PSI runs never time out.
 *
 * Requires a valid JWT in the Authorization header.
 */

const { verifyToken } = require('./_utils/auth');
const { getProjects } = require('./_utils/storage');
const { getExistingScores, appendScoresToSheet } = require('./_utils/googleSheets');
const { fetchPageSpeed, sleep } = require('./_utils/psi');

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // Auth check — must happen BEFORE returning 202, so the caller knows immediately
  const user = verifyToken(event);
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  // ── Everything below this point runs in the background ───────────────────
  // Netlify will return 202 to the client after the handler returns the first
  // response. Any async work continues until the function exits or 15 min pass.

  console.log('[runScores-bg] Background run started');

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

  // Process after response is sent (background execution)
  const processAll = async () => {
    for (const project of projects) {
      console.log(`[runScores-bg] Processing: ${project.name}`);
      try {
        const existing = await getExistingScores(project.sheetUrl);
        const rows = [];

        for (const page of project.pages) {
          for (const strategy of ['mobile', 'desktop']) {
            const paramName = strategy === 'mobile' ? 'Mobile Score' : 'Desktop Score';
            try {
              const score = await fetchPageSpeed(page.url, strategy);

              let prevScore = null;
              for (let i = existing.length - 1; i >= 1; i--) {
                const r = existing[i];
                if (r[1] === page.name && r[3] === paramName && r[4] !== undefined) {
                  const parsed = parseFloat(r[4]);
                  if (!isNaN(parsed)) { prevScore = parsed; break; }
                }
              }

              const difference = prevScore !== null ? score - prevScore : 0;
              rows.push([dateStr, page.name, page.url, paramName, score, difference]);
              console.log(`  ${page.name} ${paramName}: ${score} (${difference >= 0 ? '+' : ''}${difference})`);
              await sleep(1200);
            } catch (pageErr) {
              console.error(`  Error ${page.name} (${strategy}):`, pageErr.message);
            }
          }
        }

        if (rows.length) {
          await appendScoresToSheet(project.sheetUrl, rows);
          console.log(`[runScores-bg] Saved ${rows.length} rows for "${project.name}"`);
        }
      } catch (projErr) {
        console.error(`[runScores-bg] Error on "${project.name}":`, projErr.message);
      }
    }
    console.log('[runScores-bg] All done.');
  };

  // Kick off async processing — Netlify keeps the function alive until it resolves
  processAll().catch(err => console.error('[runScores-bg] Unhandled:', err.message));

  return {
    statusCode: 202,
    body: JSON.stringify({
      started: true,
      projects: projects.length,
      message: `Score run started for ${projects.length} project(s). Results will appear in your Google Sheets in a few minutes.`,
    }),
  };
};
