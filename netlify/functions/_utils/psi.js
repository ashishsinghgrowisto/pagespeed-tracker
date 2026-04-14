/**
 * Fetch a PageSpeed Insights score for a given URL and strategy.
 * Returns the performance score (0–100).
 */
async function fetchPageSpeed(url, strategy) {
  const apiKey = process.env.PSI_API_KEY;
  if (!apiKey) throw new Error('PSI_API_KEY env variable is missing');

  const apiUrl =
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed` +
    `?url=${encodeURIComponent(url)}&strategy=${strategy}&key=${apiKey}`;

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
}

/** Sleep for ms milliseconds (used to avoid PSI rate-limit) */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { fetchPageSpeed, sleep };
