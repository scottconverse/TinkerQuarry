/** @jest-environment jsdom */

import { act, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { NuxLayoutPicker } from '../NuxLayoutPicker';
import { Button } from '../ui';

/**
 * UIUX-2 (Critical, gate 2026-07-19) covered the four named dialogs, but the first-run layout
 * picker is a modal too: an opaque backdrop over the whole app with no role, no name, and nothing
 * holding focus. It is the very first modal a new user meets, and it has no dismiss affordance at
 * all, so escaping it with Tab strands a keyboard user in a page they cannot see or return from.
 *
 * It deliberately does NOT route through <Dialog>: there is no close semantic to give it (the
 * choice is mandatory), so it takes the focus trap directly.
 */
describe('NuxLayoutPicker — first-run modal focus containment (UIUX-2)', () => {
  it('announces itself as a modal dialog with a name', () => {
    render(<NuxLayoutPicker isOpen onSelect={jest.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName(/workspace layout/i);
  });

  it('wraps Tab at the ends instead of letting focus leave the picker', () => {
    render(
      <>
        <Button data-testid="behind">Background control</Button>
        <NuxLayoutPicker isOpen onSelect={jest.fn()} />
      </>,
    );
    const dialog = screen.getByRole('dialog');
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ),
    );
    expect(focusable.length).toBeGreaterThan(1);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    act(() => {
      last.focus();
    });
    act(() => {
      last.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
      );
    });
    expect(document.activeElement).toBe(first);
    expect(dialog.contains(document.activeElement)).toBe(true);

    act(() => {
      first.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Tab',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(document.activeElement).toBe(last);
  });
});
