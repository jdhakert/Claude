import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Nav } from "./Nav";

function OfflineBanner() {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      You’re offline — showing your last loaded data.
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="app-header">
        <span className="app-header__brand">BarReady</span>
        {user && (
          <div className="app-header__user">
            <Link className="app-header__account" to="/account">
              {user.email}
            </Link>
            <button type="button" onClick={() => void logout()}>
              Log out
            </button>
          </div>
        )}
      </header>
      <OfflineBanner />
      <div className="app-body">
        <aside className="app-sidebar">
          <Nav />
        </aside>
        <main className="app-main" id="main" tabIndex={-1}>
          {children}
        </main>
      </div>
      <footer className="app-bottomnav">
        <Nav />
      </footer>
    </div>
  );
}
