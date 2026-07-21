import { useMemo, type ReactNode } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import type { DesignFeature, DesignResult } from '../services/engineClient';
import { Button } from './ui';

function PanelShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className="h-full overflow-y-auto p-3 text-sm"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
      }}
    >
      {/* Gate 2026-07-09 (UX-3): real headings — screen-reader heading navigation found
          nothing across the four evidence panels when these were plain divs. */}
      <h3
        className="mb-3 text-[11px] font-semibold uppercase tracking-wide"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div
      className="rounded-md border p-3 text-sm"
      style={{
        borderColor: 'var(--border-primary)',
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      {children}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

function PanelAction({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      className="mb-3 rounded-md border p-3"
      style={{
        borderColor: 'var(--border-primary)',
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      <h4 className="mb-2 font-medium" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h4>
      {children}
    </section>
  );
}

function formatMm(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(value % 1 === 0 ? 0 : 1)} mm`
    : 'Not measured';
}

function formatNumber(value: unknown, suffix = ''): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`
    : 'Not measured';
}

function featureDetail(feature: DesignFeature): string {
  const parts = [
    feature.count != null ? `count ${feature.count}` : null,
    feature.diameter_mm != null ? `dia ${formatMm(feature.diameter_mm)}` : null,
    feature.width_mm != null ? `width ${formatMm(feature.width_mm)}` : null,
    feature.depth_mm != null ? `depth ${formatMm(feature.depth_mm)}` : null,
    feature.spacing_mm != null ? `spacing ${formatMm(feature.spacing_mm)}` : null,
    feature.position?.length === 3 ? `pos ${feature.position.map((v) => formatMm(v)).join(', ')}` : null,
    feature.notes ?? null,
  ].filter(Boolean);
  return parts.join(' - ');
}

function bboxFromResult(result: DesignResult | null): number[] | null {
  const dims = result?.report?.dims ?? [];
  const actual = dims.map((dim) => dim.actual);
  if (actual.length === 3 && actual.every((v): v is number => typeof v === 'number')) {
    return actual;
  }
  const target = result?.plan?.target_bbox_mm;
  return target?.length === 3 ? target : null;
}

function materialDensity(material: string | null | undefined): number {
  switch ((material ?? '').toLowerCase()) {
    case 'abs':
      return 1.04;
    case 'petg':
      return 1.27;
    case 'tpu':
      return 1.21;
    case 'pla':
    default:
      return 1.24;
  }
}

/** The engine's own clarifying question (DesignResult.clarification), shown where the user reads
 *  what the engine understood. WALK-1 (gate 2026-07-19): the engine has always sent this field and
 *  nothing in the UI read it, so a clarification_needed outcome — the everyday result of a vague
 *  prompt — surfaced as the bare status string with no question to answer. */
function ClarificationNotice({ question }: { question: string }) {
  return (
    <section
      role="status"
      data-testid="intent-clarification"
      className="mb-3 rounded-md border p-3"
      style={{
        borderColor: 'var(--color-warning)',
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      <h4 className="mb-2 font-medium" style={{ color: 'var(--text-primary)' }}>
        The engine needs one more detail
      </h4>
      <div style={{ color: 'var(--text-primary)' }}>{question}</div>
      <div className="mt-2" style={{ color: 'var(--text-tertiary)' }}>
        Answer it in the describe box and build again.
      </div>
    </section>
  );
}

export function IntentPanel() {
  const { currentDesignResult, onReverseImportCad } = useWorkspace();
  const plan = currentDesignResult?.plan;
  const clarification =
    typeof currentDesignResult?.clarification === 'string'
      ? currentDesignResult.clarification.trim()
      : '';
  if (!plan) {
    return (
      <PanelShell title="Intent">
        {clarification && <ClarificationNotice question={clarification} />}
        <EmptyState action={<PanelAction onClick={onReverseImportCad}>Import mesh</PanelAction>}>
          Describe a part or import an STL/3MF/OBJ mesh to see parsed intent.
        </EmptyState>
      </PanelShell>
    );
  }

  const dimensions = Object.entries(plan.dimensions ?? {});
  const features = plan.features ?? [];

  return (
    <PanelShell title="Intent">
      {clarification && <ClarificationNotice question={clarification} />}
      <Section title={plan.object_type ?? 'Design plan'}>
        <div style={{ color: 'var(--text-primary)' }}>{plan.summary ?? 'No summary recorded.'}</div>
        {plan.target_bbox_mm?.length === 3 && (
          <div className="mt-2">Envelope: {plan.target_bbox_mm.map((v) => formatMm(v)).join(' x ')}</div>
        )}
        {plan.tolerances?.clearance_mm != null && (
          <div>Clearance intent: {formatMm(plan.tolerances.clearance_mm)}</div>
        )}
      </Section>

      <Section title="Dimensions">
        {dimensions.length ? (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            {dimensions.map(([name, value]) => (
              <div key={name} className="contents">
                <dt className="truncate" style={{ color: 'var(--text-tertiary)' }}>{name}</dt>
                <dd style={{ color: 'var(--text-primary)' }}>{formatMm(value)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div>No named dimensions recorded.</div>
        )}
      </Section>

      <Section title="Features">
        {features.length ? (
          <ul className="space-y-2">
            {features.map((feature, index) => (
              <li key={`${feature.type}-${index}`}>
                <div style={{ color: 'var(--text-primary)' }}>
                  {feature.type ?? 'feature'}: {feature.description ?? 'No description'}
                </div>
                {featureDetail(feature) && (
                  <div style={{ color: 'var(--text-tertiary)' }}>{featureDetail(feature)}</div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div>No discrete features recorded.</div>
        )}
      </Section>

      <Section title="Assumptions">
        {plan.assumptions?.length ? (
          <ul className="space-y-1" style={{ paddingLeft: '1rem' }}>
            {plan.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
          </ul>
        ) : (
          <div>No assumptions recorded.</div>
        )}
        {plan.open_questions?.length ? (
          <div className="mt-2" style={{ color: 'var(--status-warning)' }}>
            Open: {plan.open_questions.join(' ')}
          </div>
        ) : null}
      </Section>
    </PanelShell>
  );
}

export function PropertiesPanel() {
  const { currentDesignResult, selectedMaterial, onReverseImportCad } = useWorkspace();
  const report = currentDesignResult?.report;
  const bbox = bboxFromResult(currentDesignResult);
  const volumeMm3 = report?.volume_mm3;
  const volumeCm3 = typeof volumeMm3 === 'number' ? volumeMm3 / 1000 : null;
  const surfaceCm2 = typeof report?.surface_area_mm2 === 'number' ? report.surface_area_mm2 / 100 : null;
  const center = report?.center_of_mass_mm;
  const massG = volumeCm3 != null ? volumeCm3 * materialDensity(selectedMaterial) : null;
  const bedContact = bbox ? bbox[0] * bbox[1] : null;

  return (
    <PanelShell title="Properties">
      {!currentDesignResult ? (
        <EmptyState action={<PanelAction onClick={onReverseImportCad}>Import mesh</PanelAction>}>
          Build or import a design to see measured and estimated properties.
        </EmptyState>
      ) : (
        <>
          <Section title="Measured by gate">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
              <dt style={{ color: 'var(--text-tertiary)' }}>Bounding box</dt>
              <dd style={{ color: 'var(--text-primary)' }}>
                {bbox ? bbox.map((v) => formatMm(v)).join(' x ') : 'Not measured'}
              </dd>
              <dt style={{ color: 'var(--text-tertiary)' }}>Volume</dt>
              <dd style={{ color: 'var(--text-primary)' }}>
                {volumeCm3 != null ? `${formatNumber(volumeCm3, ' cm3')}` : 'Not measured'}
              </dd>
              <dt style={{ color: 'var(--text-tertiary)' }}>Watertight</dt>
              <dd style={{ color: 'var(--text-primary)' }}>
                {report?.watertight == null ? 'Not measured' : report.watertight ? 'Yes' : 'No'}
              </dd>
              <dt style={{ color: 'var(--text-tertiary)' }}>Orientation</dt>
              <dd style={{ color: 'var(--text-primary)' }}>{report?.orientation ?? 'Not measured'}</dd>
            </dl>
          </Section>
          <Section title="Estimates">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
              <dt style={{ color: 'var(--text-tertiary)' }}>Material</dt>
              <dd style={{ color: 'var(--text-primary)' }}>{selectedMaterial?.toUpperCase() || 'PLA default'}</dd>
              <dt style={{ color: 'var(--text-tertiary)' }}>Solid-mass estimate</dt>
              <dd style={{ color: 'var(--text-primary)' }}>
                {massG != null ? `${formatNumber(massG, ' g')} before slicer infill` : 'Not estimated'}
              </dd>
              <dt style={{ color: 'var(--text-tertiary)' }}>Bed contact</dt>
              <dd style={{ color: 'var(--text-primary)' }}>
                {bedContact != null ? `${formatNumber(bedContact, ' mm2')}` : 'Not estimated'}
              </dd>
              <dt style={{ color: 'var(--text-tertiary)' }}>Center of mass</dt>
              <dd style={{ color: 'var(--text-primary)' }}>
                {center?.length === 3 ? center.map((v) => formatMm(v)).join(', ') : 'Not measured'}
              </dd>
              <dt style={{ color: 'var(--text-tertiary)' }}>Surface area</dt>
              <dd style={{ color: 'var(--text-primary)' }}>
                {surfaceCm2 != null ? `${formatNumber(surfaceCm2, ' cm2')}` : 'Not measured'}
              </dd>
            </dl>
          </Section>
        </>
      )}
    </PanelShell>
  );
}

export function VisualInspectionPanel() {
  const {
    visualReviewSummary,
    visualReviewResult,
    visualReviewImages,
    visualReviewLog,
    visualCorrectionRounds,
    visualDiffEvidence,
    onOpenCustomizerAiRefine,
  } = useWorkspace();

  return (
    <PanelShell title="Visual Review">
      {!visualReviewSummary && visualReviewImages.length === 0 ? (
        <EmptyState action={<PanelAction onClick={onOpenCustomizerAiRefine}>Refine visually</PanelAction>}>
          Visual review evidence appears after the assistant inspects a rendered model.
        </EmptyState>
      ) : (
        <>
          <Section title="State">
            <div style={{ color: 'var(--text-primary)' }}>{visualReviewSummary ?? 'No summary yet'}</div>
            <div className="mt-1">Mode: {visualReviewResult?.mode ?? 'advisory'}</div>
            <div>Rounds: {visualCorrectionRounds}</div>
          </Section>
          {visualReviewImages.length > 0 && (
            <Section title="Labeled views">
              <div className="grid grid-cols-2 gap-2">
                {visualReviewImages.map((view) => (
                  <figure key={view.label} className="min-w-0">
                    <img src={view.image} alt={`${view.label} view`} className="aspect-video w-full rounded object-contain" style={{ backgroundColor: 'var(--bg-secondary)' }} />
                    <figcaption className="mt-1 capitalize" style={{ color: 'var(--text-tertiary)' }}>
                      {view.label}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </Section>
          )}
          {visualReviewResult?.findings?.length ? (
            <Section title="Findings">
              <ul className="space-y-1" style={{ paddingLeft: '1rem' }}>
                {visualReviewResult.findings.map((finding) => <li key={finding}>{finding}</li>)}
              </ul>
            </Section>
          ) : null}
          {visualDiffEvidence && (
            <Section title="Before / after">
              <div className="grid grid-cols-2 gap-2">
                <img src={visualDiffEvidence.before} alt="Before visual correction" className="aspect-video w-full rounded object-contain" style={{ backgroundColor: 'var(--bg-secondary)' }} />
                <img src={visualDiffEvidence.after} alt="After visual correction" className="aspect-video w-full rounded object-contain" style={{ backgroundColor: 'var(--bg-secondary)' }} />
              </div>
              <div className="mt-2">{visualDiffEvidence.summary}</div>
            </Section>
          )}
          {visualReviewLog.length > 0 && (
            <Section title="Log">
              <ul className="space-y-1" style={{ paddingLeft: '1rem' }}>
                {visualReviewLog.map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}
              </ul>
            </Section>
          )}
        </>
      )}
    </PanelShell>
  );
}

export function ProvenancePanel() {
  const {
    currentDesignResult,
    currentStepUrl,
    liveReadiness,
    selectedPrinterName,
    selectedMaterial,
    selectedConnector,
    workspaceModelStatus,
    iterationLog,
    onOpenExportDialog,
    onReverseImportCad,
  } = useWorkspace();

  const toolbox = useMemo(
    () => [
      currentDesignResult?.template
        ? `Editable source: standard ${currentDesignResult.template} family`
        : 'Editable source: custom OpenSCAD generated for this design',
      `Geometry built by: ${currentDesignResult?.report?.backend ?? 'OpenSCAD'}`,
      'Readiness checks: printability gate plus mesh analysis when available',
      selectedPrinterName && selectedMaterial
        ? `Print profile: ${selectedPrinterName} / ${selectedMaterial.toUpperCase()}`
        : 'Print profile: not selected',
      selectedConnector
        ? `Printer connection: ${selectedConnector.name}${
            selectedConnector.simulated
              ? ' (simulated)'
              : selectedConnector.hardware_validated
                ? ''
                : ' (simulator-tested — not field-certified)'
          }`
        : 'Printer connection: not selected',
      currentStepUrl
        ? 'CAD handoff: STEP from the trusted twin is available'
        : currentDesignResult?.step_offer === 'settings'
          ? 'CAD handoff: trusted twin exists; enable CadQuery in Settings for STEP'
          : 'CAD handoff: STEP unavailable for this design',
    ],
    [currentDesignResult, currentStepUrl, selectedConnector, selectedMaterial, selectedPrinterName],
  );

  return (
    <PanelShell title="Provenance">
      <Section title="Agent toolbox">
        <ul className="space-y-1" style={{ paddingLeft: '1rem' }}>
          {toolbox.map((item) => <li key={item}>{item}</li>)}
        </ul>
        {currentDesignResult?.reverse_import && (
          <div className="mt-2" style={{ color: 'var(--text-primary)' }}>
            Reverse import: matched {currentDesignResult.reverse_import.matched_family ?? 'known family'}
            {currentDesignResult.reverse_import.confidence != null
              ? ` (${Math.round(currentDesignResult.reverse_import.confidence * 100)}% confidence)`
              : ''}
            . The mesh was accepted only after envelope, volume, and surface checks.
          </div>
        )}
        {!currentDesignResult && (
          <div className="mt-3">
            <PanelAction onClick={onReverseImportCad}>Import mesh</PanelAction>
          </div>
        )}
        {currentStepUrl && (
          <Button
            type="button"
            size="sm"
            className="mt-3"
            onClick={onOpenExportDialog}
          >
            Export STEP
          </Button>
        )}
      </Section>
      <Section title="Model and gate">
        <div>Model: {workspaceModelStatus?.model ?? 'unknown'}</div>
        <div>Backend: {workspaceModelStatus?.backend ?? 'unknown'}</div>
        <div>Vision: {workspaceModelStatus?.vision_present ? workspaceModelStatus.vision_model ?? 'available' : 'not available'}</div>
        <div className="mt-2" style={{ color: 'var(--text-primary)' }}>
          {liveReadiness?.split('\n')[0] ?? 'No readiness result yet'}
        </div>
      </Section>
      <Section title="Iteration history">
        {iterationLog.length ? (
          <ol className="space-y-2" style={{ paddingLeft: '1rem' }}>
            {iterationLog.slice(0, 12).map((entry) => (
              <li key={entry.id}>
                <div style={{ color: 'var(--text-primary)' }}>{entry.title}</div>
                <div style={{ color: 'var(--text-tertiary)' }}>
                  {entry.kind} · {new Date(entry.createdAt).toLocaleString()}
                  {entry.branchName ? ` · ${entry.branchName}` : ''}
                </div>
                {entry.detail && <div>{entry.detail.split('\n')[0]}</div>}
              </li>
            ))}
          </ol>
        ) : (
          <div>No iterations recorded yet.</div>
        )}
      </Section>
    </PanelShell>
  );
}
