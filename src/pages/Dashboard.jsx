import { useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { runScoresNow } from '../utils/api';

const cards = [
  {
    to: '/add-project',
    emoji: '➕',
    title: 'Add New Project',
    description:
      'Create a new project by adding a project name, Google Sheet URL, and up to 10 page URLs to track daily PageSpeed scores.',
    cta: 'Add Project',
    bg: 'from-indigo-500 to-indigo-600',
  },
  {
    to: '/projects',
    emoji: '📊',
    title: 'View Projects',
    description:
      'Browse all existing projects, review their tracked pages, and edit project details or URLs at any time.',
    cta: 'View Projects',
    bg: 'from-emerald-500 to-emerald-600',
  },
];

// ── tiny helpers ──────────────────────────────────────────────────────────────
function ScoreBadge({ score }) {
  if (score === null || score === undefined) {
    return <span className="text-xs text-gray-400 italic">error</span>;
  }
  const color =
    score >= 90 ? 'bg-green-100 text-green-700' :
    score >= 50 ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {score}
    </span>
  );
}

function DiffBadge({ diff }) {
  if (diff === null || diff === undefined) return null;
  const sign  = diff > 0 ? '+' : '';
  const color = diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : 'text-gray-400';
  return <span className={`text-xs font-medium ${color}`}>{sign}{diff}</span>;
}

export default function Dashboard() {
  const user = localStorage.getItem('pst_user') || 'Admin';

  const [running, setRunning]   = useState(false);
  const [result,  setResult]    = useState(null);  // { message, date, summary } | { error }
  const [expanded, setExpanded] = useState({});     // projectName → bool

  const handleRunNow = async () => {
    setRunning(true);
    setResult(null);
    setExpanded({});
    try {
      const data = await runScoresNow();
      setResult(data);
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setRunning(false);
    }
  };

  const toggleProject = (name) =>
    setExpanded(prev => ({ ...prev, [name]: !prev[name] }));

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back, {user} 👋
          </h1>
          <p className="text-gray-500 mt-1">
            Manage your PageSpeed tracking projects from here.
          </p>
        </div>

        {/* Nav cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cards.map(card => (
            <Link
              key={card.to}
              to={card.to}
              className="group bg-white rounded-2xl shadow-sm border border-gray-200 hover:shadow-md hover:border-indigo-200 transition-all overflow-hidden"
            >
              <div className={`h-2 bg-gradient-to-r ${card.bg}`} />
              <div className="p-8">
                <div className="text-4xl mb-4">{card.emoji}</div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">{card.title}</h2>
                <p className="text-gray-500 text-sm leading-relaxed mb-6">
                  {card.description}
                </p>
                <span className={`inline-flex items-center gap-1.5 text-sm font-semibold bg-gradient-to-r ${card.bg} bg-clip-text text-transparent group-hover:gap-2.5 transition-all`}>
                  {card.cta}
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-indigo-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* ── Manual Trigger Section ────────────────────────────────────────── */}
        <div className="mt-10 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          {/* Section header */}
          <div className="px-6 py-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl mt-0.5">⚡</span>
              <div>
                <p className="font-semibold text-gray-900">Manual Score Fetch</p>
                <p className="text-gray-500 text-sm mt-0.5">
                  Fetch live PageSpeed scores for all projects right now without waiting for the nightly run.
                </p>
              </div>
            </div>

            <button
              onClick={handleRunNow}
              disabled={running}
              className={`shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all shadow-sm
                ${running
                  ? 'bg-indigo-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95'
                }`}
            >
              {running ? (
                <>
                  {/* Spinner */}
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Fetching scores…
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                  </svg>
                  Run Now
                </>
              )}
            </button>
          </div>

          {/* Loading state */}
          {running && (
            <div className="px-6 py-8 flex flex-col items-center gap-3 text-center">
              <div className="w-10 h-10 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
              <p className="text-gray-600 font-medium">Fetching scores from PageSpeed Insights…</p>
              <p className="text-gray-400 text-sm">This may take a minute depending on the number of pages. Please keep this tab open.</p>
            </div>
          )}

          {/* Error state */}
          {!running && result?.error && (
            <div className="px-6 py-5 flex items-start gap-3 bg-red-50">
              <span className="text-xl">❌</span>
              <div>
                <p className="font-semibold text-red-700">Run failed</p>
                <p className="text-red-600 text-sm mt-0.5">{result.error}</p>
              </div>
            </div>
          )}

          {/* Success state */}
          {!running && result && !result.error && (
            <div className="divide-y divide-gray-100">
              {/* Summary bar */}
              <div className="px-6 py-4 bg-green-50 flex items-center gap-3">
                <span className="text-xl">✅</span>
                <div>
                  <p className="font-semibold text-green-800">{result.message}</p>
                  <p className="text-green-700 text-sm mt-0.5">
                    Scores have been appended to each project's Google Sheet.
                  </p>
                </div>
              </div>

              {/* Per-project breakdown */}
              {result.summary?.length > 0 && (
                <div className="divide-y divide-gray-100">
                  {result.summary.map((proj) => (
                    <div key={proj.project} className="px-6">
                      {/* Project row — clickable to expand */}
                      <button
                        className="w-full flex items-center justify-between py-4 text-left"
                        onClick={() => toggleProject(proj.project)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{proj.project}</span>
                          {proj.error && (
                            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">error</span>
                          )}
                          {!proj.error && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                              {proj.pages.filter(p => p.score !== null).length}/{proj.pages.length} ok
                            </span>
                          )}
                        </div>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className={`h-4 w-4 text-gray-400 transition-transform ${expanded[proj.project] ? 'rotate-180' : ''}`}
                          viewBox="0 0 20 20" fill="currentColor"
                        >
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>

                      {/* Expanded page rows */}
                      {expanded[proj.project] && (
                        <div className="pb-4">
                          {proj.error ? (
                            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{proj.error}</p>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-gray-400 uppercase tracking-wide">
                                  <th className="text-left pb-2 font-medium">Page</th>
                                  <th className="text-left pb-2 font-medium">Type</th>
                                  <th className="text-center pb-2 font-medium">Score</th>
                                  <th className="text-center pb-2 font-medium">vs. Previous</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {proj.pages.map((p, i) => (
                                  <tr key={i} className="hover:bg-gray-50">
                                    <td className="py-2 pr-3 text-gray-700 max-w-[160px] truncate">{p.page}</td>
                                    <td className="py-2 pr-3 text-gray-500">{p.strategy}</td>
                                    <td className="py-2 pr-3 text-center">
                                      {p.error
                                        ? <span className="text-xs text-red-400">{p.error}</span>
                                        : <ScoreBadge score={p.score} />
                                      }
                                    </td>
                                    <td className="py-2 text-center">
                                      {!p.error && <DiffBadge diff={p.difference} />}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Empty / idle state — show hint */}
          {!running && !result && (
            <div className="px-6 py-5 text-gray-400 text-sm">
              Click <span className="font-medium text-gray-600">Run Now</span> to immediately fetch and store PageSpeed scores for all your projects.
            </div>
          )}
        </div>

        {/* Automated info strip */}
        <div className="mt-6 bg-indigo-50 border border-indigo-100 rounded-xl p-5 flex items-start gap-4">
          <span className="text-2xl">⏰</span>
          <div>
            <p className="font-semibold text-indigo-900">Automated daily collection</p>
            <p className="text-indigo-700 text-sm mt-0.5">
              PageSpeed scores for all project pages are automatically fetched every day at 02:00 UTC
              and appended to each project's Google Sheet.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
