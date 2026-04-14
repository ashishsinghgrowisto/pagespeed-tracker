import { useState } from 'react';

const MAX_PAGES = 10;

const emptyPage = () => ({ name: '', url: '' });

export default function ProjectForm({ initialData, onSubmit, submitLabel = 'Save Project', loading }) {
  const [name, setName] = useState(initialData?.name || '');
  const [sheetUrl, setSheetUrl] = useState(initialData?.sheetUrl || '');
  const [pages, setPages] = useState(
    initialData?.pages?.length ? initialData.pages : [emptyPage()]
  );
  const [errors, setErrors] = useState({});

  function validate() {
    const e = {};
    if (!name.trim()) e.name = 'Project name is required.';
    if (!sheetUrl.trim()) e.sheetUrl = 'Google Sheet URL is required.';
    else if (!sheetUrl.includes('docs.google.com/spreadsheets'))
      e.sheetUrl = 'Must be a valid Google Sheets URL.';
    pages.forEach((p, i) => {
      if (!p.name.trim()) e[`page_name_${i}`] = 'Page name required.';
      if (!p.url.trim()) e[`page_url_${i}`] = 'URL required.';
      else {
        try { new URL(p.url); } catch {
          e[`page_url_${i}`] = 'Enter a valid URL (include https://).';
        }
      }
    });
    return e;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    onSubmit({ name: name.trim(), sheetUrl: sheetUrl.trim(), pages, createdAt: initialData?.createdAt });
  }

  function addPage() {
    if (pages.length < MAX_PAGES) setPages([...pages, emptyPage()]);
  }

  function removePage(i) {
    if (pages.length === 1) return;
    setPages(pages.filter((_, idx) => idx !== i));
  }

  function updatePage(i, field, value) {
    const updated = [...pages];
    updated[i] = { ...updated[i], [field]: value };
    setPages(updated);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Project Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Project Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. My E-commerce Store"
          className={`w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
            errors.name ? 'border-red-400' : 'border-gray-300'
          }`}
        />
        {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
      </div>

      {/* Google Sheet URL */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Google Sheet URL <span className="text-red-500">*</span>
        </label>
        <input
          type="url"
          value={sheetUrl}
          onChange={e => setSheetUrl(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          className={`w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
            errors.sheetUrl ? 'border-red-400' : 'border-gray-300'
          }`}
        />
        {errors.sheetUrl && <p className="mt-1 text-sm text-red-500">{errors.sheetUrl}</p>}
        <p className="mt-1 text-xs text-gray-500">
          Share this sheet with your service account email (Editor access).
        </p>
      </div>

      {/* Pages */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">
            Page URLs <span className="text-red-500">*</span>
            <span className="ml-2 text-gray-400 font-normal">({pages.length}/{MAX_PAGES})</span>
          </label>
        </div>

        <div className="space-y-3">
          {pages.map((page, i) => (
            <div key={i} className="flex gap-3 items-start bg-gray-50 p-3 rounded-lg border border-gray-200">
              <div className="flex-shrink-0 w-6 h-6 mt-2 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center">
                {i + 1}
              </div>

              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <input
                    type="text"
                    value={page.name}
                    onChange={e => updatePage(i, 'name', e.target.value)}
                    placeholder="Page name (e.g. Home)"
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      errors[`page_name_${i}`] ? 'border-red-400' : 'border-gray-300'
                    }`}
                  />
                  {errors[`page_name_${i}`] && (
                    <p className="mt-1 text-xs text-red-500">{errors[`page_name_${i}`]}</p>
                  )}
                </div>
                <div>
                  <input
                    type="url"
                    value={page.url}
                    onChange={e => updatePage(i, 'url', e.target.value)}
                    placeholder="https://example.com/page"
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      errors[`page_url_${i}`] ? 'border-red-400' : 'border-gray-300'
                    }`}
                  />
                  {errors[`page_url_${i}`] && (
                    <p className="mt-1 text-xs text-red-500">{errors[`page_url_${i}`]}</p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => removePage(i)}
                disabled={pages.length === 1}
                className="flex-shrink-0 mt-2 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Remove page"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {pages.length < MAX_PAGES && (
          <button
            type="button"
            onClick={addPage}
            className="mt-3 flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Add URL ({MAX_PAGES - pages.length} remaining)
          </button>
        )}
      </div>

      {/* Submit */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={loading}
          className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Saving…
            </span>
          ) : submitLabel}
        </button>
      </div>
    </form>
  );
}
