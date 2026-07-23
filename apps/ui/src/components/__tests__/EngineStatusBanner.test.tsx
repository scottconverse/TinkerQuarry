/** @jest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { EngineStatusBanner } from '../EngineStatusBanner';

describe('EngineStatusBanner (§9 offline banner)', () => {
  it('appears only after two consecutive health failures, then clears on recovery', async () => {
    let reachable = false;
    const onCheck = jest.fn(async () => reachable);
    render(<EngineStatusBanner pollMs={15} onCheck={onCheck} />);

    // Two failed checks (immediate + one poll) flip it to down.
    await waitFor(() => expect(screen.getByTestId('engine-offline-banner')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('local manufacturing engine');

    // First successful check clears it.
    reachable = true;
    await waitFor(() => expect(screen.queryByTestId('engine-offline-banner')).toBeNull());
  });

  // UIUX-1 (Critical, gate 2026-07-19): the banner is fixed at top:0 above <App/> and reserved no
  // space, so it lay across the whole toolbar. It must now make room for itself while shown, and
  // give every pixel back the moment the engine answers again. (The geometric proof that clicks
  // reach the toolbar lives in apps/ui/e2e/engine-offline-banner.spec.ts — jsdom has no layout.)
  it('reserves its own height while shown and releases it on recovery', async () => {
    const offsetHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'offsetHeight',
    );
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get: () => 28,
    });
    try {
      let reachable = false;
      render(<EngineStatusBanner pollMs={15} onCheck={async () => reachable} />);

      await waitFor(() => expect(screen.getByTestId('engine-offline-banner')).toBeTruthy());
      await waitFor(() => {
        const style = document.getElementById('tq-engine-banner-offset');
        expect(style).not.toBeNull();
        expect(style!.textContent).toContain('padding-top: 28px');
        expect(style!.textContent).toContain('calc(100vh - 28px)');
      });

      reachable = true;
      await waitFor(() =>
        expect(document.getElementById('tq-engine-banner-offset')).toBeNull(),
      );
    } finally {
      if (offsetHeight) {
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight);
      }
    }
  });

  it('never shows while the engine is reachable', async () => {
    const onCheck = jest.fn(async () => true);
    render(<EngineStatusBanner pollMs={15} onCheck={onCheck} />);
    await new Promise((r) => setTimeout(r, 70)); // several poll cycles
    expect(screen.queryByTestId('engine-offline-banner')).toBeNull();
    expect(onCheck.mock.calls.length).toBeGreaterThan(1);
  });
});
