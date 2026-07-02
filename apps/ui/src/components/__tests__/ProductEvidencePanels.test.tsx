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
