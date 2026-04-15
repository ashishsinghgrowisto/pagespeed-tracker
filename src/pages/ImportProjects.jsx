import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import Navbar from '../components/Navbar';
import { importProjects } from '../utils/api';

/**
 * Parses a flat rows array (header row + data rows) into projects grouped
 * by Project Name + Sheet URL.
 *
 * Expected columns (case-insensitive):
 *   Project Name | Sheet URL | Page Name | Page URL
 */
function parseRowsToProjects(rows) {
  if (rows.length < 2) throw new Error('File must have a header row and at least one data row');

  // Normalise header
  const header = rows[0].map(h => (h || '').toString().toLowerCase().trim());
  const col = (name) => {
    const idx = header.findIndex(h => h.includes(name));
    if (idx === -1) throw new Error(`Could not find a "${name}" column. Headers found: ${header.join(', ')}`);
    return idx;
  };

  const iProjectName = col('project');
  const iSheetUrl    = col('sheet');
  const iPageName    = col('page name');
  const iPageUrl     = col('page url');

  const projectMap = new Map(); // key = "name|||sheetUrl"

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const projectName = (row[iProjectName] || '').toString().trim();
    const sheetUrl    = (row[iSheetUrl]    || '').toString().trim();
    const pageName    = (row[iPageName]    || '').toString().trim();
    const pageUrl     = (row[iPageUrl]     || '').toString().trim();

    if (!projectName || !sheetUrl || !pageName || !pageUrl) continue;

    const key = `${projectName}|||${sheetUrl}`;
    if (!projectMap.has(key)) {
      projectMap.set(key, { name: projectName, sheetUrl, pages: [] });
    }
    projectMap.get(key).pages.push({ name: pageName, url: pageUrl });
  }

  return [...projectMap.values()];
}

export default function ImportProjects() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [isDragging, setIsDragging]     = useState(false);
  const [fileName, setFileName]         = useState('');
  const [parseError, setParseError]     = useState('');
  const [projects, setProjects]         = useState([]); // parsed preview
  const [importing, setImporting]       = useState(false);
  const [importResult, setImportResult] = useState(null); // { added, skipped, errors }

  // ── File handling ─────────────────────────────────────────────────────────

  function handleFile(file) {
    if (!file) return;
    setParseError('');
    setProjects([]);
    setImportResult(null);
    setFileName(file.name);

    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'csv') {
      Papa.parse(file, {
        skipEmptyLines: true,
        complete: (result) => {
          try {
            setProjects(parseRowsToProjects(result.data));
          } catch (e) {
            setParseError(e.message);
          }
        },
        error: (e) => setParseError(e.message),
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          setProjects(parseRowsToProjects(rows));
        } catch (err) {
          setParseError(err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      setParseError('Unsupported file type. Please upload a .csv or .xlsx file.');
    }
  }

  function onFileChange(e) {
    handleFile(e.target.files[0]);
    e.target.value = ''; // allow re-selecting same file
  }

  function onDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }

  // ── Import ────────────────────────────────────────────────────────────────

  async function handleImport() {
    if (!projects.length) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await importProjects(projects);
      setImportResult(result);
    } catch (err) {
      setParseError(err.message || 'Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setFileName('');
    setProjects([]);
    setParseError('');
    setImportResult(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const totalPages = projects.reduce((sum, p) => sum + p.pages.length, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Breadcrumb + heading */}
        <div className="mb-8">
          <nav className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link to="/" className="hover:text-indigo-600">Dashboard</Link>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-gray-900 font-medium">Bulk Import</span>
          </nav>
          <h1 className="text-2xl font-bold text-gray-900">Bulk Import Projects</h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload a CSV or Excel file to add multiple projects at once.
          </p>
        </div>

        {/* ── Template hint ── */}
        <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-800">
          <p className="font-semibold mb-1">Expected columns (in order):</p>
          <code className="bg-white border border-indigo-200 rounded px-2 py-1 text-xs">
            Project Name &nbsp;|&nbsp; Sheet URL &nbsp;|&nbsp; Page Name &nbsp;|&nbsp; Page URL
          </code>
          <p className="mt-2 text-indigo-600">
            One row per page — rows that share the same Project Name will be grouped into a single project.
          </p>
        </div>

        {/* ── Drop zone ── */}
        {!projects.length && !importResult && (
          <div
            className={`relative flex flex-col items-center justify-center w-full rounded-2xl border-2 border-dashed transition-colors cursor-pointer py-16 ${
              isDragging
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-gray-300 bg-white hover:border-indigo-400 hover:bg-indigo-50'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={onFileChange}
            />
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-indigo-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-base font-medium text-gray-700">
              {isDragging ? 'Drop the file here' : 'Drag & drop your file here'}
            </p>
            <p className="text-sm text-gray-500 mt-1">or <span className="text-indigo-600 underline">browse</span> to choose</p>
            <p className="text-xs text-gray-400 mt-3">Supports .csv, .xlsx, .xls</p>
          </div>
        )}

        {/* ── Parse error ── */}
        {parseError && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="font-semibold">Could not parse file</p>
              <p>{parseError}</p>
              <button onClick={reset} className="mt-2 text-red-600 underline hover:text-red-800">Try another file</button>
            </div>
          </div>
        )}

        {/* ── Preview table ── */}
        {projects.length > 0 && !importResult && (
          <div>
            {/* Summary bar */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700">
                  <span className="text-indigo-600 font-bold">{projects.length}</span> project{projects.length !== 1 ? 's' : ''} parsed
                  &nbsp;·&nbsp;
                  <span className="text-indigo-600 font-bold">{totalPages}</span> page{totalPages !== 1 ? 's' : ''} total
                </span>
                <span className="text-xs text-gray-400">from <strong>{fileName}</strong></span>
              </div>
              <button
                onClick={reset}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Choose a different file
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm mb-6">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 uppercase text-xs tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Project</th>
                    <th className="px-4 py-3 text-left">Pages</th>
                    <th className="px-4 py-3 text-left">Google Sheet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {projects.map((project, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                        {project.name}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <div className="space-y-0.5">
                          {project.pages.map((page, j) => (
                            <div key={j} className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                              <span className="font-medium text-gray-700">{page.name}</span>
                              <span className="text-gray-400 text-xs truncate max-w-xs">{page.url}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={project.sheetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-emerald-600 hover:text-emerald-800 underline truncate max-w-[200px] inline-block"
                          onClick={e => e.stopPropagation()}
                        >
                          View Sheet
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleImport}
                disabled={importing}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {importing ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Importing…
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                    Import {projects.length} Project{projects.length !== 1 ? 's' : ''}
                  </>
                )}
              </button>
              <Link
                to="/projects"
                className="px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </Link>
            </div>
          </div>
        )}

        {/* ── Import result ── */}
        {importResult && (
          <div className="space-y-4">
            {/* Success summary */}
            {importResult.added.length > 0 && (
              <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="font-semibold text-emerald-800">
                    {importResult.added.length} project{importResult.added.length !== 1 ? 's' : ''} imported successfully
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {importResult.added.map(name => (
                    <span key={name} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Skipped */}
            {importResult.skipped.length > 0 && (
              <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span className="font-semibold text-amber-800">
                    {importResult.skipped.length} skipped — already exists
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {importResult.skipped.map(name => (
                    <span key={name} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Errors */}
            {importResult.errors.length > 0 && (
              <div className="p-5 bg-red-50 border border-red-200 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="font-semibold text-red-800">
                    {importResult.errors.length} failed to import
                  </span>
                </div>
                <ul className="space-y-1 text-sm text-red-700">
                  {importResult.errors.map((e, i) => (
                    <li key={i}><strong>{e.name}</strong>: {e.reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Nothing happened */}
            {importResult.added.length === 0 && importResult.skipped.length === 0 && importResult.errors.length === 0 && (
              <div className="p-5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600">
                No projects were imported.
              </div>
            )}

            {/* Post-import actions */}
            <div className="flex items-center gap-3 pt-2">
              <Link
                to="/projects"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                View All Projects
              </Link>
              <button
                onClick={reset}
                className="px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Import Another File
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
