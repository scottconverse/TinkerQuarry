import { explainDisabledActions } from '../explainDisabledActions';

// UIUX-6 regression guard: the reasons a keyboard/SR user needs must be produced for the Explain
// panel to render. Before this existed nothing asserted the reasons were surfaced at all — removing
// them left the suite green. Each case pins a distinct disabling cause to its plain-English line.

const ENABLED = {
  renderExportShareReason: null,
  hasEngineDesign: true,
  selectedPrinterBlocked: false,
  sliceProfileReady: true,
  isRendering: false,
};

describe('explainDisabledActions', () => {
  it('returns nothing when every primary action is enabled', () => {
    expect(explainDisabledActions(ENABLED)).toEqual([]);
  });

  it('surfaces the shared Render/Export/Share reason when set', () => {
    const lines = explainDisabledActions({
      ...ENABLED,
      renderExportShareReason: 'The OpenSCAD engine is still starting up',
      isRendering: false,
    });
    expect(lines).toContain('Render, Export, Share: The OpenSCAD engine is still starting up');
  });

  it('tells the user to describe a part first when there is no design (Save + Make it real)', () => {
    const lines = explainDisabledActions({ ...ENABLED, hasEngineDesign: false, sliceProfileReady: false });
    expect(lines).toContain('Save and Make it real: describe a part first');
    // and it does NOT also nag about a slice profile — no-design is the single blocking cause
    expect(lines.some((l) => l.includes('printer and material'))).toBe(false);
  });

  it('names a blocked printer profile as the Make it real reason once a design exists', () => {
    const lines = explainDisabledActions({ ...ENABLED, selectedPrinterBlocked: true });
    expect(lines).toContain('Make it real: the selected printer profile is unavailable');
  });

  it('asks for a slice profile when a design exists but none is ready', () => {
    const lines = explainDisabledActions({ ...ENABLED, sliceProfileReady: false });
    expect(lines).toContain('Make it real: choose a printer and material profile first');
  });

  it('does not invent a profile reason while a render is in flight (already covered by the shared reason)', () => {
    const lines = explainDisabledActions({
      ...ENABLED,
      renderExportShareReason: 'Rendering — wait for the current render to finish',
      sliceProfileReady: false,
      isRendering: true,
    });
    expect(lines.some((l) => l.includes('choose a printer and material'))).toBe(false);
    expect(lines).toContain('Render, Export, Share: Rendering — wait for the current render to finish');
  });
});
