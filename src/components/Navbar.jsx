import { Link, useNavigate, useLocation } from 'react-router-dom';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  function logout() {
    localStorage.removeItem('pst_token');
    localStorage.removeItem('pst_user');
    navigate('/login');
  }

  const linkClass = (path) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      location.pathname === path
        ? 'bg-indigo-700 text-white'
        : 'text-indigo-100 hover:bg-indigo-700 hover:text-white'
    }`;

  return (
    <nav className="bg-indigo-600 shadow-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            <span className="text-white font-bold text-lg tracking-tight">
              PageSpeed Tracker
            </span>
          </Link>

          {/* Nav links */}
          <div className="flex items-center gap-2">
            <Link to="/" className={linkClass('/')}>
              Dashboard
            </Link>
            <Link to="/add-project" className={linkClass('/add-project')}>
              Add Project
            </Link>
            <Link to="/projects" className={linkClass('/projects')}>
              Projects
            </Link>
            <button
              onClick={logout}
              className="ml-4 px-3 py-2 rounded-md text-sm font-medium bg-white text-indigo-600 hover:bg-indigo-50 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
