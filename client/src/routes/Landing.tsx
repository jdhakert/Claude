/** Basic landing page route (Phase 5 acceptance). */
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
      <a className="cta" href="/health-status">
        Check platform status
      </a>
    </main>
  );
}
