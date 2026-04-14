/**
 * Background Function — POST /.netlify/functions/runScores-background
 *
 * How Netlify Background Functions work:
 *  - The client gets a 202 immediately (Netlify intercepts it).
 *  - The handler keeps running until it RETURNS — up to 15 minutes.
 *  - So we MUST await all the work inside the handler (not fire-and-forget).
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

  // Auth check happens before the 202 is sent — client gets 401 if invalid
  const user = verifyToken(event);
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

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

  console.log(`[runScores-bg] Processing ${projects.length} project(s) for ${dateStr}`);

  // IMPORTANT: await everything — the handler must not return until all work is done.
  // Netlify keeps the function alive and has already sent 202 to the client.
  for (const project of projects) {
    console.log(`[runScores-bg] → Project: ${project.name}`);
    try {
      const existing = await getExistingScores(project.sheetUrl);

      for (const page of project.pages) {
        const pageRows = [];

        for (const strategy of ['mobile', 'desktop']) {
          const paramName = strategy === 'mobile' ? 'Mobile Score' : 'Desktop Score';
          try {
            console.log(`  Fetching ${paramName} for ${page.name}…`);
            const score = await fetchPageSpeed(page.url, strategy);

            // Find previous score for this page + strategy
            let prevScore = null;
            for (let i = existing.length - 1; i >= 1; i--) {
              const r = existing[i];
              if (r[1] === page.name && r[3] === paramName && r[4] !== undefined) {
                const parsed = parseFloat(r[4]);
                if (!isNaN(parsed)) { prevScore = parsed; break; }
              }
            }

            const difference = prevScore !== null ? score - prevScore : 0;
            pageRows.push([dateStr, page.name, page.url, paramName, score, difference]);
            console.log(`  ✓ ${page.name} ${paramName}: ${score} (${difference >= 0 ? '+' : ''}${difference})`);
            await sleep(1200);
          } catch (pageErr) {
            console.error(`  ✗ ${page.name} (${strategy}): ${pageErr.message}`);
          }
        }

        // Write after each page — so a timeout can't wipe all results
        if (pageRows.length) {
          await appendScoresToSheet(project.sheetUrl, pageRows);
          console.log(`  → Wrote ${pageRows.length} row(s) for "${page.name}" to sheet`);
        }
      }
      console.log(`[runScores-bg] ✓ All pages saved for "${project.name}"`);
    } catch (projErr) {
      console.error(`[runScores-bg] Error on "${project.name}": ${projErr.message}`);
    }
  }

  console.log('[runScores-bg] All done.');

  // Return value is largely ignored (202 was already sent), but we return 202 anyway.
  return {
    statusCode: 202,
    body: JSON.stringify({ done: true, projects: projects.length }),
  };
};
