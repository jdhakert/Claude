import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query. SSR/test-safe: when `matchMedia` is
 * unavailable it returns `false` rather than throwing.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** True on phone-sized viewports (matches the CSS bottom-nav breakpoint). */
export function useIsSmallScreen(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
