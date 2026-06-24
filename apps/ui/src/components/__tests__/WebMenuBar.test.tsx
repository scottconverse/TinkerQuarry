/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WebMenuBar } from '../WebMenuBar';

describe('WebMenuBar', () => {
  const noop = () => {};

  it('exposes menubar semantics and keyboard navigation', async () => {
    render(
      <WebMenuBar
        onExport={noop}
        onSettings={noop}
        onUndo={noop}
        onRedo={noop}
      />
    );

    const menubar = screen.getByRole('menubar', { name: /application menu/i });
    expect(menubar).toBeTruthy();

    const file = screen.getByRole('menuitem', { name: 'File' });
    fireEvent.keyDown(file, { key: 'ArrowDown' });

    const menu = screen.getByRole('menu');
    expect(menu).toHaveAttribute('id', 'web-menu-0');
    expect(file).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: /New File/i })).toHaveFocus();
    });

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: /Open File/i })).toHaveFocus();

    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(file).toHaveFocus();
  });
});
