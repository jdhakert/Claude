import { useIsSmallScreen } from "../hooks/useMediaQuery";

/**
 * Full-length, timed exams work on phones but a larger screen mirrors real
 * test conditions and reduces mis-taps. We support mobile but recommend
 * desktop/tablet (Beta acceptance: exams supported with a recommendation).
 */
export function MobileExamNotice() {
  const small = useIsSmallScreen();
  if (!small) return null;
  return (
    <p className="callout callout--warning" role="note">
      <strong>On a phone?</strong> Full-length exams work here, but a desktop or
      tablet is recommended for timed simulations — more reading room and fewer
      mis-taps under time pressure.
    </p>
  );
}
