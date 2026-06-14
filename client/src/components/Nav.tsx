import { NavLink } from "react-router-dom";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  soon?: boolean;
}

const ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Today", icon: "📅", end: true },
  { to: "/courses", label: "Courses", icon: "📚" },
  { to: "/practice", label: "Practice", icon: "✍️" },
  { to: "/exams", label: "Exams", icon: "📝" },
  { to: "/essays", label: "Essays", icon: "📄" },
  { to: "/pt", label: "PT", icon: "🗂️" },
  { to: "/review", label: "Review", icon: "🔁" },
];

/** Primary navigation: a sidebar on desktop, a bottom bar on mobile (CSS). */
export function Nav() {
  return (
    <nav className="nav" aria-label="Primary">
      <ul>
        {ITEMS.map((item) => (
          <li key={item.to}>
            {item.soon ? (
              <span className="nav__link nav__link--soon" aria-disabled="true">
                <span className="nav__icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="nav__label">{item.label}</span>
              </span>
            ) : (
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `nav__link${isActive ? " nav__link--active" : ""}`
                }
              >
                <span className="nav__icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="nav__label">{item.label}</span>
              </NavLink>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
