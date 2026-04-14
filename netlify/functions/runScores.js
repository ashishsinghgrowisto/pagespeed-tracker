/**
 * Manual score-fetch trigger — POST /.netlify/functions/runScores
 * Requires a valid JWT in the Authorization header.
 * Runs the same logic as the daily scheduled fetchScores function and
 * returns a JSON summary of every page processed.
 */

const { verifyToken } = require('./_utils/auth');
const { getProjects } = require('./_utils/storage');
const { getExistingScores, appendScoresToSheet } = require('./_utils/googleSheets');
const { fetchPageSpeed, sleep } = require('./_utils/psi');

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // Require valid JWT
  const authError = verifyToken(event);
  if (authError) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  console.log('[runScores] Manual trigger started');

  let projects;
  try {
    projects = await getProjects();
  } catch (err) {
    console.error('[runScores] Failed to load projects:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to load projects: ' + err.message }),
    };
  }

  if (!projects.length) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'No projects found — nothing to do.',
        summary: [],
      }),
    };
  }

  const today = new Date();
  const dateStr = today
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .replace(/ /g, '-'); // e.g. "14-Apr-2026"

  const summary = []; // Returned to the client

  for (const project of projects) {
    console.log(`[runScores] Processing project: ${project.name}`);
    const projectResult = {
      project: project.name,
      pages: [],
      error: null,
    };

    try {
      const existing = await getExistingScores(project.sheetUrl);
      const rows = [];

      for (const page of project.pages) {
        for (const strategy of ['mobile', 'desktop']) {
          const paramName = strategy === 'mobile' ? 'Mobile Score' : 'Desktop Score';

          try {
            const score = await fetchPageSpeed(page.url, strategy);

            // Find the most recent previous score for this page + strategy
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

            projectResult.pages.push({
              page: page.name,
              strategy: paramName,
              score,
              difference,
            });

            console.log(`  ${page.name} ${paramName}: ${score} (${difference >= 0 ? '+' : ''}${difference})`);
            await sleep(1200);
          } catch (pageErr) {
            console.error(`  Error for ${page.name} (${strategy}):`, pageErr.message);
            projectResult.pages.push({
              page: page.name,
              strategy: paramName,
              score: null,
              error: pageErr.message,
            });
          }
        }
      }

      if (rows.length) {
        await appendScoresToSheet(project.sheetUrl, rows);
        console.log(`[runScores] Saved ${rows.length} rows for "${project.name}"`);
      }
    } catch (projErr) {
      console.error(`[runScores] Error on project "${project.name}":`, projErr.message);
      projectResult.error = projErr.message;
    }

    summary.push(projectResult);
  }

  console.log('[runScores] Manual run complete.');
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Scores fetched for ${projects.length} project(s) on ${dateStr}.`,
      date: dateStr,
      summary,
    }),
  };
};
