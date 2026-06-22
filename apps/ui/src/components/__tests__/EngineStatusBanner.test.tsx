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

  it('never shows while the engine is reachable', async () => {
    const onCheck = jest.fn(async () => true);
    render(<EngineStatusBanner pollMs={15} onCheck={onCheck} />);
    await new Promise((r) => setTimeout(r, 70)); // several poll cycles
    expect(screen.queryByTestId('engine-offline-banner')).toBeNull();
    expect(onCheck.mock.calls.length).toBeGreaterThan(1);
  });
});
