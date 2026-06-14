import { NavLink } from "react-router-dom";

const ITEMS = [
  { to: "/dashboard", label: "Today", icon: "📅", end: true },
  { to: "/dashboard/practice", label: "Practice", icon: "✍️", soon: true },
  { to: "/dashboard/progress", label: "Progress", icon: "📊", soon: true },
  { to: "/dashboard/review", label: "Review", icon: "🔁", soon: true },
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
