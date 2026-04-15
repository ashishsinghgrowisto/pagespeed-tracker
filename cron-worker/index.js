/**
 * Cloudflare Worker — cron trigger for daily PageSpeed score runs.
 *
 * Schedule: 30 18 * * * (18:30 UTC = 12:00 AM IST)
 *
 * Environment variables (set via Cloudflare Workers dashboard):
 *   PAGES_URL    — e.g. https://pagespeed-tracker.pages.dev
 *   CRON_SECRET  — shared secret matching the Pages project's CRON_SECRET
 */

export default {
  async scheduled(event, env, ctx) {
    const url = `${env.PAGES_URL}/api/fetchScores`;
    console.log(`[cron] Triggering ${url}`);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Cron-Secret': env.CRON_SECRET,
          'Content-Type': 'application/json',
        },
      });

      const body = await res.text();
      console.log(`[cron] Response ${res.status}: ${body.slice(0, 200)}`);
    } catch (err) {
      console.error(`[cron] Failed to trigger fetchScores: ${err.message}`);
    }
  },
};
