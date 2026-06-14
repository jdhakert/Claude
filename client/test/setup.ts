import "@testing-library/jest-dom/vitest";

// jsdom has no matchMedia. Provide a small implementation that resolves
// `(max-width: Npx)` / `(min-width: Npx)` against window.innerWidth so
// responsive hooks can be exercised by setting innerWidth in a test.
// `(display-mode: standalone)` is always false (we're never "installed" in jsdom).
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => {
    function evaluate(): boolean {
      const max = /max-width:\s*(\d+)px/.exec(query);
      if (max) return window.innerWidth <= Number(max[1]);
      const min = /min-width:\s*(\d+)px/.exec(query);
      if (min) return window.innerWidth >= Number(min[1]);
      return false;
    }
    return {
      get matches() {
        return evaluate();
      },
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  };
}
