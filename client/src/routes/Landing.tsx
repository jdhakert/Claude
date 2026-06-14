import { Link } from "react-router-dom";

/** Public marketing landing page. */
export function Landing() {
  return (
    <main className="landing">
      <h1>BarReady</h1>
      <p className="tagline">
        We tell you exactly what to study today, why, and how close you are to
        passing — and we adapt every day.
      </p>
      <ul className="promise">
        <li>Adaptive daily study plan, fit to your time.</li>
        <li>Issue-level mastery, not just subject percentages.</li>
        <li>Honest readiness — never inflated.</li>
      </ul>
      <Link className="cta" to="/login">
        Log in
      </Link>
    </main>
  );
}
