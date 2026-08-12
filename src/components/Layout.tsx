import { NavLink, Outlet } from "react-router-dom";
import { useApp } from "../context/AppContext";

const NAV = [
  { to: "/", label: "Today", exact: true },
  { to: "/people", label: "People", exact: false },
  { to: "/campaigns", label: "Campaigns", exact: false },
  { to: "/triage", label: "Triage", exact: false },
  { to: "/data", label: "Data", exact: false },
];

function NavItem({
  to,
  label,
  exact,
}: {
  to: string;
  label: string;
  exact: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
            : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        }`
      }
    >
      {label}
    </NavLink>
  );
}

export function Layout() {
  const { error, refresh } = useApp();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            HCE
          </span>
          <nav className="flex gap-1">
            {NAV.map((n) => (
              <NavItem key={n.to} {...n} />
            ))}
          </nav>
        </div>
        {error && (
          <div className="flex items-center justify-between gap-4 border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
            <span>{error}</span>
            <button
              onClick={() => refresh()}
              className="shrink-0 rounded border border-red-300 px-2 py-1 text-xs font-medium hover:bg-red-100 dark:border-red-700 dark:hover:bg-red-900/50"
            >
              Retry
            </button>
          </div>
        )}
      </header>

      {/* Page content */}
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
