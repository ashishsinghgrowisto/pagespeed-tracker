/**
 * Fetch a PageSpeed Insights score for a given URL and strategy.
 * Returns the performance score (0–100).
 *
 * Retries up to MAX_RETRIES times on any error, with exponential back-off,
 * before throwing so the caller can record a failure.
 */

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 3000; // 3s → 6s → 12s

async function fetchPageSpeed(url, strategy) {
  const apiKey = process.env.PSI_API_KEY;
  if (!apiKey) throw new Error('PSI_API_KEY env variable is missing');

  const apiUrl =
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed` +
    `?url=${encodeURIComponent(url)}&strategy=${strategy}&key=${apiKey}`;

  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(apiUrl);

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`PSI API error ${res.status}: ${body.slice(0, 200)}`);
      }

      const data = await res.json();
      const rawScore = data?.lighthouseResult?.categories?.performance?.score;

      if (rawScore === undefined || rawScore === null) {
        throw new Error(`No performance score returned for ${url}`);
      }

      return Math.round(rawScore * 100);

    } catch (err) {
      lastError = err;

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1); // 3s, 6s, 12s
        console.warn(
          `[psi] Attempt ${attempt}/${MAX_RETRIES} failed for ${url} (${strategy}): ${err.message}` +
          ` — retrying in ${delay / 1000}s…`
        );
        await sleep(delay);
      } else {
        console.error(
          `[psi] All ${MAX_RETRIES} attempts failed for ${url} (${strategy}): ${err.message}`
        );
      }
    }
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { fetchPageSpeed, sleep };
