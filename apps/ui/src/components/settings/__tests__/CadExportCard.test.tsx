/** @jest-environment jsdom */

// TQ-N1 / TQ-N3. The card restored to Settings for the CadQuery/STEP dead end, and the two
// server surfaces it re-connects: HealthResult.cadquery (declared, previously never read) and
// GET /api/health?recheck=1 (implemented and hardened, previously zero callers).

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { ThemeProvider } from '../../../contexts/ThemeContext';

type HealthPayload = {
  version?: string;
  openscad?: boolean;
  orcaslicer?: boolean;
  cadquery?: boolean;
  error?: string;
};
type HealthResponse = { status: number; ok: boolean; data: HealthPayload };

const mockHealth = jest.fn<() => Promise<HealthResponse>>();
const mockHealthRecheck = jest.fn<() => Promise<HealthResponse>>();

jest.unstable_mockModule('@/services/engineClient', () => ({
  engine: {
    health: () => mockHealth(),
    healthRecheck: () => mockHealthRecheck(),
  },
}));

let CadExportCard: typeof import('../CadExportCard').CadExportCard;
let CADQUERY_INSTALL_COMMAND: string;

const ok = (cadquery: boolean): HealthResponse => ({
  status: 200,
  ok: true,
  data: { version: '0.9.4', openscad: true, orcaslicer: true, cadquery },
});
const unreachable = (): HealthResponse => ({
  status: 0,
  ok: false,
  data: { error: 'TinkerQuarry could not reach its engine.' },
});

function renderCard() {
  return render(
    <ThemeProvider>
      <CadExportCard />
    </ThemeProvider>
  );
}

describe('CadExportCard (Settings → Project → Editable CAD export)', () => {
  beforeAll(async () => {
    const mod = await import('../CadExportCard');
    CadExportCard = mod.CadExportCard;
    CADQUERY_INSTALL_COMMAND = mod.CADQUERY_INSTALL_COMMAND;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads health.cadquery on mount and reports "Installed" when an interpreter was found', async () => {
    mockHealth.mockResolvedValue(ok(true));
    renderCard();
    await waitFor(() =>
      expect(screen.getByTestId('cadquery-status').textContent).toBe('Installed')
    );
    expect(mockHealth).toHaveBeenCalledTimes(1);
    // Installed means nothing to install: the setup recipe is gone.
    expect(screen.queryByText(CADQUERY_INSTALL_COMMAND)).toBeNull();
  });

  it('reports "Not installed" and shows the one-time pip recipe when the probe found nothing', async () => {
    mockHealth.mockResolvedValue(ok(false));
    renderCard();
    await waitFor(() =>
      expect(screen.getByTestId('cadquery-status').textContent).toBe('Not installed')
    );
    expect(screen.getByText(CADQUERY_INSTALL_COMMAND)).toBeTruthy();
    expect(CADQUERY_INSTALL_COMMAND).toContain('pip install cadquery');
  });

  it('distinguishes a failed read ("Couldn\'t check") from a successful "no interpreter" read', async () => {
    mockHealth.mockResolvedValue(unreachable());
    renderCard();
    await waitFor(() =>
      expect(screen.getByTestId('cadquery-status').textContent).toBe("Couldn't check")
    );
    expect(screen.getByText('TinkerQuarry could not reach its engine.')).toBeTruthy();
  });

  it('"check again" calls /api/health?recheck=1 — NOT the cached read — and updates the status', async () => {
    mockHealth.mockResolvedValue(ok(false));
    // The user installs CadQuery in a terminal, then presses the button. The cached probe would
    // still say "absent"; only the recheck query rediscovers.
    mockHealthRecheck.mockResolvedValue(ok(true));

    renderCard();
    await waitFor(() =>
      expect(screen.getByTestId('cadquery-status').textContent).toBe('Not installed')
    );
    expect(mockHealthRecheck).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Check for the CAD export engine'));

    await waitFor(() =>
      expect(screen.getByTestId('cadquery-status').textContent).toBe('Installed')
    );
    expect(mockHealthRecheck).toHaveBeenCalledTimes(1);
    // The mount read must not be repeated — a second plain health() would answer from the
    // engine's cache and silently undo the point of the button.
    expect(mockHealth).toHaveBeenCalledTimes(1);
  });

  it('shows "Checking..." while a read is in flight', async () => {
    let release: (v: HealthResponse) => void = () => {};
    mockHealth.mockReturnValue(
      new Promise<HealthResponse>((resolve) => {
        release = resolve;
      })
    );
    renderCard();
    expect(screen.getByTestId('cadquery-status').textContent).toBe('Checking...');
    release(ok(true));
    await waitFor(() =>
      expect(screen.getByTestId('cadquery-status').textContent).toBe('Installed')
    );
  });
});
