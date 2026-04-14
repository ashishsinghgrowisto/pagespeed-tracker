import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';

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

        {/* Cards */}
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

        {/* Info strip */}
        <div className="mt-10 bg-indigo-50 border border-indigo-100 rounded-xl p-5 flex items-start gap-4">
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
