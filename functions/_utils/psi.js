/**
 * PageSpeed Insights API — pure fetch, no external dependencies.
 * Retries up to MAX_RETRIES times with exponential back-off.
 */

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 3000; // 3s → 6s → 12s

export async function fetchPageSpeed(url, strategy, env) {
  const apiKey = env.PSI_API_KEY;
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
        const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
        console.warn(
          `[psi] Attempt ${attempt}/${MAX_RETRIES} failed for ${url} (${strategy}): ${err.message}` +
          ` — retrying in ${delay / 1000}s`
        );
        await new Promise(r => setTimeout(r, delay));
      } else {
        console.error(`[psi] All ${MAX_RETRIES} attempts failed for ${url} (${strategy}): ${err.message}`);
      }
    }
  }

  throw lastError;
}
