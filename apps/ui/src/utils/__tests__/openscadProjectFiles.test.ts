import {
  isOpenScadProjectFilePath,
  isRenderableOpenScadFilePath,
  pickOpenScadRenderTarget,
} from '../../../../../packages/shared/src/openscadProjectFiles';

describe('openscadProjectFiles helpers', () => {
  it('recognizes supported project file paths', () => {
    expect(isOpenScadProjectFilePath('main.scad')).toBe(true);
    expect(isOpenScadProjectFilePath('lib/constants.h')).toBe(true);
    expect(isOpenScadProjectFilePath('readme.txt')).toBe(false);
  });

  it('only treats .scad files as renderable targets', () => {
    expect(isRenderableOpenScadFilePath('main.scad')).toBe(true);
    expect(isRenderableOpenScadFilePath('lib/constants.h')).toBe(false);
  });

  it('picks main.scad ahead of headers and alphabetic fallbacks', () => {
    expect(pickOpenScadRenderTarget(['lib/constants.h', 'z.scad', 'main.scad', 'a.scad'])).toBe(
      'main.scad'
    );
  });

  it('prefers a renderable file whose basename matches the workspace name', () => {
    expect(
      pickOpenScadRenderTarget(
        ['openscad/config.scad', 'openscad/poly555.scad', 'z.scad'],
        null,
        'poly555'
      )
    ).toBe('openscad/poly555.scad');
  });

  it('breaks workspace-name matches by shallower path and then alphabetical order', () => {
    expect(
      pickOpenScadRenderTarget(
        ['nested/deeper/poly555.scad', 'alpha/poly555.scad', 'beta/poly555.scad'],
        null,
        'poly555'
      )
    ).toBe('alpha/poly555.scad');
  });

  it('preserves the preferred render target when provided', () => {
    expect(
      pickOpenScadRenderTarget(
        ['openscad/config.scad', 'openscad/poly555.scad'],
        'openscad/config.scad',
        'poly555'
      )
    ).toBe('openscad/config.scad');
  });

  it('returns null when no renderable files exist', () => {
    expect(pickOpenScadRenderTarget(['lib/constants.h', 'params.h'])).toBeNull();
  });
});
