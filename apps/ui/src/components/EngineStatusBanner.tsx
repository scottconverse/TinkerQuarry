import { useEffect, useState } from 'react';
import { engine } from '../services/engineClient';

/**
 * A thin, app-wide banner shown when the local manufacturing engine stops responding (PRD §9).
 *
 * Describe / render / slice all flow through the engine, so when it's down the app otherwise fails
 * silently per-request (a transient toast each time). This gives one clear, persistent signal.
 * Polls `/api/health`; to avoid flapping on a single slow check it shows the banner only after two
 * consecutive failures and clears on the first success. Fixed-position so it never disturbs layout.
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
      role="alert"
      data-testid="engine-offline-banner"
      className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white text-xs px-3 py-1.5 text-center shadow"
    >
      The local manufacturing engine isn’t responding. Make sure it’s running, then try again.
    </div>
  );
}
