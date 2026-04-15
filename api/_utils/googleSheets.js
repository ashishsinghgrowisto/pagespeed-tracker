const { google } = require('googleapis');

function getAuth() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  if (!b64) throw new Error('GOOGLE_SERVICE_ACCOUNT_B64 env variable is missing');
  const credentials = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSpreadsheetId(url) {
  if (!url) return null;
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// ── Project sheet: append daily score rows ───────────────────────────────────
async function appendScoresToSheet(sheetUrl, rows) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = getSpreadsheetId(sheetUrl);
  if (!spreadsheetId) throw new Error('Invalid project sheet URL');

  await ensureProjectHeaders(sheets, spreadsheetId);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Sheet1!A:F',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });
}

// ── Project sheet: read existing scores (for difference calc) ─────────────
async function getExistingScores(sheetUrl) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = getSpreadsheetId(sheetUrl);
  if (!spreadsheetId) return [];

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:F',
    });
    return res.data.values || [];
  } catch {
    return [];
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
async function ensureProjectHeaders(sheets, spreadsheetId) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A1:F1',
    });
    const first = (res.data.values || [])[0] || [];
    if (first[0] !== 'Date') {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Sheet1!A1:F1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Date', 'Type', 'URL', 'Parameter', 'Value', 'Difference']],
        },
      });
    }
  } catch {
    // ignore
  }
}

module.exports = {
  appendScoresToSheet,
  getExistingScores,
};
