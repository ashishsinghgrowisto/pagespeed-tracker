/**
 * Google Sheets API via direct REST + Web Crypto RS256 JWT.
 * Replaces the `googleapis` npm package — works natively in Cloudflare Workers.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function objB64url(obj) {
  return btoa(JSON.stringify(obj))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };
}

export function getSpreadsheetId(url) {
  if (!url) return null;
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// ── Service Account JWT + Access Token ───────────────────────────────────────

async function getAccessToken(env) {
  const b64 = env.GOOGLE_SERVICE_ACCOUNT_B64;
  if (!b64) throw new Error('GOOGLE_SERVICE_ACCOUNT_B64 env variable is missing');

  const sa = JSON.parse(atob(b64));
  const now = Math.floor(Date.now() / 1000);

  const header  = objB64url({ alg: 'RS256', typ: 'JWT' });
  const payload = objB64url({
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  });

  const signingInput = `${header}.${payload}`;

  // Import RSA-SHA256 private key (PKCS8 PEM → ArrayBuffer)
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const keyDer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput)
  );

  const assertion = `${signingInput}.${b64url(sig)}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Google auth failed: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

// ── Sheets API calls ──────────────────────────────────────────────────────────

async function sheetsGet(token, spreadsheetId, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const data = await res.json();
  return data.values || [];
}

async function sheetsUpdate(token, spreadsheetId, range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  return fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
}

async function sheetsAppend(token, spreadsheetId, range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets append failed (${res.status}): ${err.slice(0, 300)}`);
  }
}

async function ensureProjectHeaders(token, spreadsheetId) {
  try {
    const rows = await sheetsGet(token, spreadsheetId, 'Sheet1!A1:F1');
    if (!rows || !rows[0] || rows[0][0] !== 'Date') {
      await sheetsUpdate(token, spreadsheetId, 'Sheet1!A1:F1',
        [['Date', 'Type', 'URL', 'Parameter', 'Value', 'Difference']]);
    }
  } catch { /* ignore — sheet might not exist yet */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function appendScoresToSheet(env, sheetUrl, rows) {
  const spreadsheetId = getSpreadsheetId(sheetUrl);
  if (!spreadsheetId) throw new Error('Invalid project sheet URL');

  const token = await getAccessToken(env);
  await ensureProjectHeaders(token, spreadsheetId);
  await sheetsAppend(token, spreadsheetId, 'Sheet1!A:F', rows);
}

export async function getExistingScores(env, sheetUrl) {
  const spreadsheetId = getSpreadsheetId(sheetUrl);
  if (!spreadsheetId) return [];
  try {
    const token = await getAccessToken(env);
    return await sheetsGet(token, spreadsheetId, 'Sheet1!A:F') || [];
  } catch {
    return [];
  }
}
