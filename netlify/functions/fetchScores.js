/**
 * Scheduled Netlify Function — runs daily at 02:00 UTC.
 * Schedule is declared in netlify.toml: [functions."fetchScores"] schedule = "0 2 * * *"
 *
 * For each project it:
 *  1. Fetches PSI scores (mobile + desktop) for every page URL
 *  2. Calculates the difference vs the previous day's score
 *  3. Appends a row per page × strategy to the project's Google Sheet
 */

const { getProjects } = require('./_utils/storage');
const { getExistingScores, appendScoresToSheet } = require('./_utils/googleSheets');
const { fetchPageSpeed, sleep } = require('./_utils/psi');

exports.handler = async (event) => {
  console.log('[fetchScores] Starting daily PageSpeed score collection…');

  let projects;
  try {
    projects = await getProjects();
  } catch (err) {
    console.error('[fetchScores] Failed to read master sheet:', err.message);
    return { statusCode: 500, body: err.message };
  }

  if (!projects.length) {
    console.log('[fetchScores] No projects found — nothing to do.');
    return { statusCode: 200, body: 'No projects' };
  }

  const today = new Date();
  const dateStr = today
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .replace(/ /g, '-'); // e.g. "14-Apr-2026"

  for (const project of projects) {
    console.log(`[fetchScores] Processing project: ${project.name}`);
    try {
      const existing = await getExistingScores(project.sheetUrl);

      for (const page of project.pages) {
        const pageRows = [];

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
            pageRows.push([dateStr, page.name, page.url, paramName, score, difference]);

            console.log(`  ${page.name} ${paramName}: ${score} (${difference >= 0 ? '+' : ''}${difference})`);

            // Respect PSI rate limit: ~1 req/sec is safe
            await sleep(1200);
          } catch (pageErr) {
            console.error(`  Error for ${page.name} (${strategy}):`, pageErr.message);
          }
        }

        // Write after each page — prevents total data loss if the function times out
        if (pageRows.length) {
          await appendScoresToSheet(project.sheetUrl, pageRows);
          console.log(`[fetchScores] Wrote ${pageRows.length} row(s) for "${page.name}"`);
        }
      }
      console.log(`[fetchScores] Done with "${project.name}"`);
    } catch (projErr) {
      console.error(`[fetchScores] Error on project "${project.name}":`, projErr.message);
    }
  }

  console.log('[fetchScores] Done.');
  return { statusCode: 200, body: 'OK' };
};
