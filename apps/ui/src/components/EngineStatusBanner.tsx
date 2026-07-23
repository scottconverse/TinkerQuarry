import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { engine } from '../services/engineClient';

/** Stylesheet id, so a re-render never stacks two copies of the offset rules. */
const OFFSET_STYLE_ID = 'tq-engine-banner-offset';

/**
 * UIUX-1 (Critical, gate 2026-07-19): the banner is `position: fixed; top: 0` and used to be
 * mounted above <App/> with NO layout offset at all, so while it showed it lay across the whole
 * workspace header — the live gate measured only the bottom ~29% of every toolbar button still
 * able to receive a click, Settings included.
 *
 * The banner cannot be moved into normal flow from here (it is mounted as a sibling of <App/>,
 * whose root is `h-screen`, so an in-flow banner would simply push the app off the bottom of the
 * viewport). Instead it makes room for itself: the page content is pushed down by exactly the
 * banner's measured height, and every full-height root shrinks by the same amount, so the total
 * is still one viewport and nothing scrolls.
 */
function applyLayoutOffset(height: number) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById(OFFSET_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = OFFSET_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = `
    body { padding-top: ${height}px; }
    body .h-screen { height: calc(100vh - ${height}px); }
  `;
}

function clearLayoutOffset() {
  if (typeof document === 'undefined') return;
  document.getElementById(OFFSET_STYLE_ID)?.remove();
}

/**
 * A thin, app-wide banner shown when the local manufacturing engine stops responding (PRD §9).
 *
 * Describe / render / slice all flow through the engine, so when it's down the app otherwise fails
 * silently per-request (a transient toast each time). This gives one clear, persistent signal.
 * Polls `/api/health`; to avoid flapping on a single slow check it shows the banner only after two
 * consecutive failures and clears on the first success. Fixed-position, and it reserves its own
 * height while shown (see applyLayoutOffset above) so it sits ABOVE the header rather than on it.
 *
 * `pollMs` and `onCheck` are injectable for deterministic testing.
 */
export function EngineStatusBanner({
  pollMs = 10000,
  onCheck = () => engine.health().then((r) => r.ok),
}: {
  pollMs?: number;
  onCheck?: () => Promise<boolean>;
}) {
  const [down, setDown] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  // UIUX-1: reserve exactly the banner's real height while it is shown, and give it all back
  // the moment the engine answers again.
  useLayoutEffect(() => {
    if (!down) {
      clearLayoutOffset();
      return;
    }
    const measure = () => {
      const height = bannerRef.current?.offsetHeight ?? 0;
      if (height > 0) applyLayoutOffset(height);
    };
    measure();
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    if (observer && bannerRef.current) observer.observe(bannerRef.current);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      clearLayoutOffset();
    };
  }, [down]);

  useEffect(() => {
    let cancelled = false;
    let fails = 0;
    const check = async () => {
      let ok = false;
      try {
        ok = await onCheck();
      } catch {
        ok = false;
      }
      if (cancelled) return;
      if (ok) {
        fails = 0;
        setDown(false);
      } else {
        fails += 1;
        if (fails >= 2) setDown(true);
      }
    };
    void check();
    const id = setInterval(() => void check(), pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollMs, onCheck]);

  if (!down) return null;

  return (
    <div
      ref={bannerRef}
      role="alert"
      data-testid="engine-offline-banner"
      className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white text-xs px-3 py-1.5 text-center shadow"
    >
      The local manufacturing engine isn’t responding. Make sure it’s running, then try again.
    </div>
  );
}
