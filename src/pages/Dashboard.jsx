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

export default function Dashboard() {
  const user = localStorage.getItem('pst_user') || 'Admin';

  const [running, setRunning] = useState(false);
  const [result,  setResult]  = useState(null);  // { started, message, projects } | { error }

  const handleRunNow = async () => {
    setRunning(true);
    setResult(null);
    try {
      const data = await runScoresNow();
      setResult(data);
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setRunning(false);
    }
  };

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
              <p className="text-gray-600 font-medium">Starting score run…</p>
              <p className="text-gray-400 text-sm">Sending request to the server, hang tight.</p>
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

          {/* Started (202) state */}
          {!running && result?.started && (
            <div className="px-6 py-5 bg-green-50 border-t border-green-100">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🚀</span>
                <div>
                  <p className="font-semibold text-green-800">Score run started!</p>
                  <p className="text-green-700 text-sm mt-0.5">
                    {result.message || `Fetching scores for ${result.projects} project(s) in the background.`}
                  </p>
                  <p className="text-green-600 text-xs mt-2">
                    PageSpeed Insights scores take ~2 seconds per page. Open your Google Sheet in a few minutes to see the new rows.
                  </p>
                </div>
              </div>
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
