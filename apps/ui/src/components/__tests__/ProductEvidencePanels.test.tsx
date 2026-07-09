/** @jest-environment jsdom */

import { fireEvent, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import {
  IntentPanel,
  PropertiesPanel,
  ProvenancePanel,
  VisualInspectionPanel,
} from '../ProductEvidencePanels';
import { WorkspaceProvider, type WorkspaceState } from '../../contexts/WorkspaceContext';
import { renderWithProviders } from './test-utils';

const noop = () => {};

function workspace(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    source: '',
    updateSource: noop,
    diagnostics: [],
    onManualRender: noop,
    settings: {} as WorkspaceState['settings'],
    editorFocusRequestKey: 0,
    tabs: [],
    activeTabId: '',
    onTabClick: noop,
    onTabClose: noop,
    onNewTab: noop,
    onReorderTabs: noop,
    previewSrc: '',
    previewKind: 'stl',
    isRendering: false,
    error: undefined,
    renderReady: true,
    isStreaming: false,
    streamingResponse: null,
    proposedDiff: null,
    aiError: null,
    isApplyingDiff: false,
    messages: [],
    draft: { text: '', attachmentIds: [] } as WorkspaceState['draft'],
    attachments: {} as WorkspaceState['attachments'],
    draftErrors: [],
    draftVisionBlockMessage: null,
    draftVisionWarningMessage: null,
    canSubmitDraft: false,
    isProcessingAttachments: false,
    currentToolCalls: [],
    currentProvider: 'openai',
    currentModel: 'test-model',
    currentModelVisionSupport: 'unknown',
    availableProviders: [],
    submitDraft: noop,
    setDraftText: noop,
    addDraftFiles: async () => undefined,
    removeDraftAttachment: noop,
    hasCurrentModelApiKey: false,
    canAttachViewerAnnotation: false,
    attachViewerAnnotationFile: async () => ({ ok: false }),
    cancelStream: noop,
    acceptDiff: noop,
    rejectDiff: noop,
    clearAiError: noop,
    newConversation: noop,
    setCurrentModel: noop,
    handleRestoreCheckpoint: noop,
    aiPromptPanelRef: { current: null },
    onAcceptDiff: noop,
    onRejectDiff: noop,
    onOpenAiSettings: noop,
    onOpenCustomizerAiRefine: noop,
    onOpenEditorPanel: noop,
    onOpenExportDialog: noop,
    onReverseImportCad: noop,
    currentDesignResult: null,
    currentDesignHeadline: null,
    currentRid: null,
    liveReadiness: null,
    currentStepUrl: null,
    selectedPrinterName: null,
    selectedMaterial: 'pla',
    selectedConnector: null,
    workspaceModelStatus: null,
    visualReviewSummary: null,
    visualReviewResult: null,
    visualReviewImages: [],
    visualReviewLog: [],
    visualCorrectionRounds: 0,
    visualDiffEvidence: null,
    iterationLog: [],
    ...overrides,
  };
}

function renderPanel(ui: React.ReactElement, state: WorkspaceState) {
  return renderWithProviders(<WorkspaceProvider value={state}>{ui}</WorkspaceProvider>);
}

describe('ProductEvidencePanels', () => {
  it('gives empty intent and properties panels an import action', () => {
    const onReverseImportCad = jest.fn();

    renderPanel(<IntentPanel />, workspace({ onReverseImportCad }));
    fireEvent.click(screen.getByRole('button', { name: 'Import mesh' }));
    expect(onReverseImportCad).toHaveBeenCalledTimes(1);

    renderPanel(<PropertiesPanel />, workspace({ onReverseImportCad }));
    expect(screen.getAllByRole('button', { name: 'Import mesh' })).toHaveLength(2);
  });

  it('labels mass as a solid estimate and preserves visual thumbnails', () => {
    renderPanel(
      <PropertiesPanel />,
      workspace({
        currentDesignResult: {
          status: 'completed',
          has_mesh: true,
          report: {
            volume_mm3: 1000,
            surface_area_mm2: 600,
            center_of_mass_mm: [5, 5, 5],
            dims: [{ actual: 10 }, { actual: 10 }, { actual: 10 }],
          },
        } as WorkspaceState['currentDesignResult'],
      }),
    );
    expect(screen.getByText('Solid-mass estimate')).toBeInTheDocument();
    expect(screen.getByText(/before slicer infill/)).toBeInTheDocument();

    renderPanel(
      <VisualInspectionPanel />,
      workspace({
        visualReviewSummary: 'Looks aligned.',
        visualReviewImages: [{ label: 'front', image: 'front.png' }],
      }),
    );
    expect(screen.getByAltText('front view')).toHaveClass('object-contain');
  });

  it('renders a populated intent plan: summary, dimensions, features, assumptions, open questions', () => {
    // T6 (gate 2026-07-09): the populated-plan branch was untested — only empty states were.
    renderPanel(
      <IntentPanel />,
      workspace({
        currentDesignResult: {
          status: 'completed',
          has_mesh: true,
          plan: {
            object_type: 'wall hook',
            summary: 'A wall hook for a 12 mm dowel.',
            target_bbox_mm: [40, 20, 60],
            dimensions: { dowel_diameter: 12, plate_height: 60 },
            features: [{ type: 'hole', description: 'two screw holes' }],
            assumptions: ['Assumed 4 mm screws.'],
            open_questions: ['Wall material?'],
          },
        } as WorkspaceState['currentDesignResult'],
      }),
    );
    expect(screen.getByText('A wall hook for a 12 mm dowel.')).toBeInTheDocument();
    expect(screen.getByText(/Envelope: 40 mm x 20 mm x 60 mm/)).toBeInTheDocument();
    expect(screen.getByText('dowel_diameter')).toBeInTheDocument();
    expect(screen.getByText('12 mm')).toBeInTheDocument();
    expect(screen.getByText(/hole: two screw holes/)).toBeInTheDocument();
    expect(screen.getByText('Assumed 4 mm screws.')).toBeInTheDocument();
    expect(screen.getByText(/Open: Wall material\?/)).toBeInTheDocument();
    // UX-3: the panel shell + sections expose REAL headings for screen-reader navigation.
    expect(screen.getByRole('heading', { name: 'Intent' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dimensions' })).toBeInTheDocument();
  });

  it('shows honest fallbacks when the report lacks measurements', () => {
    // T6: PropertiesPanel's Not-measured/Not-estimated branches.
    renderPanel(
      <PropertiesPanel />,
      workspace({
        currentDesignResult: {
          status: 'completed',
          has_mesh: true,
          report: {},
        } as WorkspaceState['currentDesignResult'],
      }),
    );
    expect(screen.getAllByText(/Not measured|Not estimated/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('heading', { name: 'Properties' })).toBeInTheDocument();
  });

  it('offers STEP through settings when no CadQuery interpreter is available', () => {
    // T6: ProvenancePanel's step_offer branch (vs a live currentStepUrl).
    renderPanel(
      <ProvenancePanel />,
      workspace({
        currentDesignResult: {
          status: 'completed',
          has_mesh: true,
          template: 'snap_box',
          step_offer: 'settings',
          report: { backend: 'openscad' },
        } as WorkspaceState['currentDesignResult'],
      }),
    );
    expect(screen.getByRole('heading', { name: 'Provenance' })).toBeInTheDocument();
    expect(screen.getByText(/STEP/)).toBeInTheDocument();
  });

  it('discloses reverse-import provenance checks', () => {
    renderPanel(
      <ProvenancePanel />,
      workspace({
        currentDesignResult: {
          status: 'completed',
          has_mesh: true,
          template: 'snap_box',
          reverse_import: {
            source_filename: 'box.stl',
            matched_family: 'snap_box',
            confidence: 0.97,
          },
          report: { backend: 'openscad' },
        } as WorkspaceState['currentDesignResult'],
      }),
    );

    expect(screen.getByText(/Reverse import: matched snap_box/)).toBeInTheDocument();
    expect(screen.getByText(/envelope, volume, and surface checks/)).toBeInTheDocument();
  });
});
