import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';

const navLinks = [
  { to: '/',                 label: 'Dashboard'   },
  { to: '/add-project',      label: 'Add Project' },
  { to: '/import-projects',  label: 'Import'      },
  { to: '/projects',         label: 'Projects'    },
];

export default function Navbar() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [open, setOpen] = useState(false);

  function logout() {
    localStorage.removeItem('pst_token');
    localStorage.removeItem('pst_user');
    navigate('/login');
  }

  const isActive = (path) => location.pathname === path;

  const desktopLinkClass = (path) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive(path)
        ? 'bg-indigo-700 text-white'
        : 'text-indigo-100 hover:bg-indigo-700 hover:text-white'
    }`;

  const mobileLinkClass = (path) =>
    `block px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
      isActive(path)
        ? 'bg-indigo-700 text-white'
        : 'text-indigo-100 hover:bg-indigo-700 hover:text-white'
    }`;

  return (
    <nav className="bg-indigo-600 shadow-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <span className="text-2xl">⚡</span>
            <span className="text-white font-bold text-base sm:text-lg tracking-tight">
              PageSpeed Tracker
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center gap-2">
            {navLinks.map(link => (
              <Link key={link.to} to={link.to} className={desktopLinkClass(link.to)}>
                {link.label}
              </Link>
            ))}
            <button
              onClick={logout}
              className="ml-3 px-3 py-2 rounded-md text-sm font-medium bg-white text-indigo-600 hover:bg-indigo-50 transition-colors"
            >
              Logout
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setOpen(o => !o)}
            className="sm:hidden inline-flex items-center justify-center p-2 rounded-md text-indigo-200 hover:text-white hover:bg-indigo-700 transition-colors"
            aria-label="Toggle menu"
          >
            {open ? (
              /* X icon */
              <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              /* Hamburger icon */
              <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="sm:hidden border-t border-indigo-500 bg-indigo-600 px-4 pb-4 pt-2 space-y-1">
          {navLinks.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className={mobileLinkClass(link.to)}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <button
            onClick={() => { setOpen(false); logout(); }}
            className="w-full text-left px-4 py-3 rounded-lg text-sm font-medium bg-white text-indigo-600 hover:bg-indigo-50 transition-colors mt-1"
          >
            Logout
          </button>
        </div>
      )}
    </nav>
  );
}
