/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { Button } from '../ui';

/**
 * UIUX-6 (Minor, GauntletGate 2026-07-19): the toolbar's disabled controls (Save, Make it real,
 * Export, Render, Send) carried their reason ONLY in a `title` attribute. `disabled` removes an
 * element from the tab order, so that text was reachable by sighted mouse hover and nothing else —
 * a keyboard or screen-reader user met a row of grey buttons with no explanation.
 *
 * The fix belongs in the shared Button, not at each call site, so it cannot be forgotten again.
 */
describe('Button — disabled reason exposure (UIUX-6)', () => {
  it('exposes a disabled control reason via aria-describedby, not just the title', () => {
    render(
      <Button disabled title="Describe a part first" data-testid="save">
        Save
      </Button>,
    );
    const button = screen.getByTestId('save');
    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      'Describe a part first',
    );
    // The reason is a description, never part of the name.
    expect(screen.getByRole('button', { name: 'Save' })).toBe(button);
    // The mouse-hover affordance is kept as well.
    expect(button).toHaveAttribute('title', 'Describe a part first');
  });

  it('adds no description noise to an enabled control', () => {
    render(
      <Button title="Save this design to My Designs" data-testid="save">
        Save
      </Button>,
    );
    expect(screen.getByTestId('save')).not.toHaveAttribute('aria-describedby');
  });

  it('keeps an explicit aria-describedby from the call site', () => {
    render(
      <>
        <span id="caller-note">Caller supplied</span>
        <Button
          disabled
          title="Describe a part first"
          aria-describedby="caller-note"
          data-testid="save"
        >
          Save
        </Button>
      </>,
    );
    const describedBy = screen.getByTestId('save').getAttribute('aria-describedby');
    expect(describedBy).toContain('caller-note');
    const ids = describedBy!.split(/\s+/);
    const texts = ids.map((id) => document.getElementById(id)?.textContent);
    expect(texts).toContain('Describe a part first');
  });

  it('says nothing extra when a disabled control has no reason to give', () => {
    render(
      <Button disabled data-testid="save">
        Save
      </Button>,
    );
    expect(screen.getByTestId('save')).not.toHaveAttribute('aria-describedby');
  });
});
