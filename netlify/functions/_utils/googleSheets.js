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

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };
}

// ── Master sheet: read all projects ────────────────────────────────────────
async function getProjects() {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = getSpreadsheetId(process.env.MASTER_SHEET_URL);
  if (!spreadsheetId) throw new Error('Invalid MASTER_SHEET_URL');

  // Ensure headers exist
  await ensureMasterHeaders(sheets, spreadsheetId);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Projects!A2:E',
  });

  const rows = res.data.values || [];
  return rows
    .filter(r => r[0]) // skip empty rows
    .map(r => ({
      id: r[0] || '',
      name: r[1] || '',
      sheetUrl: r[2] || '',
      pages: safeParseJSON(r[3], []),
      createdAt: r[4] || '',
    }));
}

// ── Master sheet: add a project ─────────────────────────────────────────────
async function addProject(project) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = getSpreadsheetId(process.env.MASTER_SHEET_URL);
  if (!spreadsheetId) throw new Error('Invalid MASTER_SHEET_URL');

  await ensureMasterHeaders(sheets, spreadsheetId);

  const id = Date.now().toString();
  const createdAt = new Date().toISOString();
  const row = [id, project.name, project.sheetUrl, JSON.stringify(project.pages), createdAt];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Projects!A:E',
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });

  // Ensure the project's own sheet has headers too
  const projSheetId = getSpreadsheetId(project.sheetUrl);
  if (projSheetId) {
    await ensureProjectHeaders(sheets, projSheetId);
  }

  return { id, ...project, createdAt };
}

// ── Master sheet: update a project ──────────────────────────────────────────
async function updateProject(id, project) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = getSpreadsheetId(process.env.MASTER_SHEET_URL);
  if (!spreadsheetId) throw new Error('Invalid MASTER_SHEET_URL');

  // Find the row index
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Projects!A:A',
  });
  const rows = res.data.values || [];
  const rowIndex = rows.findIndex(r => r[0] === id);
  if (rowIndex === -1) throw new Error('Project not found');

  const rowNum = rowIndex + 1;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Projects!A${rowNum}:E${rowNum}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        id,
        project.name,
        project.sheetUrl,
        JSON.stringify(project.pages),
        project.createdAt || new Date().toISOString(),
      ]],
    },
  });
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
async function ensureMasterHeaders(sheets, spreadsheetId) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Projects!A1:E1',
    });
    const first = (res.data.values || [])[0] || [];
    if (first[0] !== 'ID') {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Projects!A1:E1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [['ID', 'Project Name', 'Sheet URL', 'Pages', 'Created At']],
        },
      });
    }
  } catch {
    // Sheet might not have a "Projects" tab yet — ignore, user must create it
  }
}

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

function safeParseJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = {
  getProjects,
  addProject,
  updateProject,
  appendScoresToSheet,
  getExistingScores,
  corsHeaders,
};
