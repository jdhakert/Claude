import { useCallback, useEffect, useRef, useState } from "react";

type State<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "success"; data: T; error: null }
  | { status: "error"; data: null; error: Error };

/** Minimal async-state hook with loading/success/error + reload. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<State<T>>({
    status: "loading",
    data: null,
    error: null,
  });
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(() => {
    let active = true;
    setState({ status: "loading", data: null, error: null });
    fnRef
      .current()
      .then((data) => {
        if (active) setState({ status: "success", data, error: null });
      })
      .catch((error: Error) => {
        if (active) setState({ status: "error", data: null, error });
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(run, [run]);
  return { ...state, reload: run };
}
