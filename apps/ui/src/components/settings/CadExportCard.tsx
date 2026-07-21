import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Text } from '../ui';
import { engine } from '../../services/engineClient';
import {
  SettingsCard,
  SettingsCardHeader,
  SettingsCardSection,
  SettingsSupportBlock,
} from './SettingsPrimitives';

// TQ-N1 / TQ-N3 (GauntletGate v1.5.0). Two dead surfaces and one dead end met here:
//
//  - ProductEvidencePanels.tsx's Provenance panel renders "CAD handoff: trusted twin exists;
//    enable CadQuery in Settings → Project for STEP" whenever the engine emits
//    step_offer:"settings" (webapp.py). Before this card, Settings had no such control at all —
//    the sentence pointed nowhere.
//  - GET /api/health?recheck=1 (webapp.py) and HealthResult.cadquery (engineClient.ts) were both
//    implemented and maintained server-side with zero callers in the shipped UI.
//
// This card is that control: it reads health.cadquery for its status and calls
// engine.healthRecheck() for "check again", so a user who has just run the pip install sees the
// new answer without restarting TinkerQuarry.

/** What the engine's CadQuery probe currently says. `checking` covers both the first read and a
 * re-check in flight; `unknown` is a genuinely failed read (engine unreachable / non-OK), which
 * is a different thing from a successful read that said "no interpreter". */
export type CadExportStatus = 'checking' | 'installed' | 'absent' | 'unknown';

const STATUS_LABEL: Record<CadExportStatus, string> = {
  checking: 'Checking...',
  installed: 'Installed',
  absent: 'Not installed',
  unknown: "Couldn't check",
};

const STATUS_COLOR: Record<CadExportStatus, string> = {
  checking: 'var(--text-tertiary)',
  installed: 'var(--color-success)',
  absent: 'var(--text-tertiary)',
  unknown: 'var(--color-warning)',
};

/** The one-time setup. Matches the interpreters cadquery_runner.find_cadquery_interpreter()
 * actually probes on Windows (the `py` launcher at 3.13/3.12/3.11). */
export const CADQUERY_INSTALL_COMMAND = 'py -3.13 -m pip install cadquery';

export function CadExportCard() {
  const [status, setStatus] = useState<CadExportStatus>('checking');
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const read = useCallback(async (recheck: boolean) => {
    setStatus('checking');
    setErrorDetail(null);
    const r = recheck ? await engine.healthRecheck() : await engine.health();
    if (!mounted.current) return;
    if (!r.ok) {
      setStatus('unknown');
      setErrorDetail(
        (r.data as { error?: string })?.error ||
          'TinkerQuarry could not reach its engine to check.'
      );
      return;
    }
    setStatus(r.data?.cadquery ? 'installed' : 'absent');
  }, []);

  useEffect(() => {
    void read(false);
  }, [read]);

  const showRecipe = status === 'absent' || status === 'unknown';

  return (
    <SettingsCard>
      <SettingsCardHeader
        title="Editable CAD export (.STEP)"
        description="STEP files open as editable solids in FreeCAD, Fusion, SolidWorks and other CAD tools. TinkerQuarry writes them from its trusted CadQuery twin, which needs a separate one-time install."
        action={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Check for the CAD export engine"
            onClick={() => void read(true)}
            disabled={status === 'checking'}
            style={{
              color: 'var(--accent-primary)',
              border: '1px solid var(--border-primary)',
            }}
          >
            Check again
          </Button>
        }
      />

      <SettingsCardSection className="flex flex-col" style={{ gap: 'var(--space-label-gap)' }}>
        <div className="flex items-center" style={{ gap: 'var(--space-control-gap)' }}>
          <Text variant="body" as="span">
            CAD export engine (CadQuery)
          </Text>
          <span
            data-testid="cadquery-status"
            role="status"
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{
              color: STATUS_COLOR[status],
              border: `1px solid ${STATUS_COLOR[status]}`,
            }}
          >
            {STATUS_LABEL[status]}
          </span>
        </div>

        {status === 'installed' && (
          <Text variant="caption" color="tertiary">
            Standard (template-built) parts offer a <strong>STEP</strong> option in the Export
            dialog&rsquo;s format list. Experimental parts stay mesh-only by design.
          </Text>
        )}

        {status === 'unknown' && errorDetail && (
          <Text variant="caption" color="warning">
            {errorDetail}
          </Text>
        )}

        {showRecipe && (
          <SettingsSupportBlock className="flex flex-col" style={{ gap: 'var(--space-label-gap)' }}>
            <Text variant="caption" color="tertiary">
              One-time setup — run this in a terminal, then choose "Check again". No restart
              needed.
            </Text>
            <code
              className="font-mono text-xs px-2 py-1 rounded select-all"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
              }}
            >
              {CADQUERY_INSTALL_COMMAND}
            </code>
            <Text variant="caption" color="tertiary">
              Python 3.11, 3.12 and 3.13 all work. Until CadQuery is installed, STEP is simply not
              offered — every other export format is unaffected.
            </Text>
          </SettingsSupportBlock>
        )}
      </SettingsCardSection>
    </SettingsCard>
  );
}
