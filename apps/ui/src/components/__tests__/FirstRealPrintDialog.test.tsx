/** @jest-environment jsdom */

import { fireEvent, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { jest } from '@jest/globals';
import { FirstRealPrintDialog } from '../FirstRealPrintDialog';
import { renderWithProviders } from './test-utils';

describe('FirstRealPrintDialog (§6.10 first-real-print caution)', () => {
  it('shows the caution and confirms via "Make it real"', () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    renderWithProviders(<FirstRealPrintDialog onConfirm={onConfirm} onClose={onClose} />);

    expect(screen.getByText('Before your first real print')).toBeTruthy();
    expect(screen.getByText(/fits your printer/i)).toBeTruthy();
    expect(screen.getByText(/material loaded matches/i)).toBeTruthy();

    fireEvent.click(screen.getByTestId('first-real-print-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cancels without confirming', () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    renderWithProviders(<FirstRealPrintDialog onConfirm={onConfirm} onClose={onClose} />);

    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('has no serious or critical a11y violations (§10/§12)', async () => {
    const { container } = renderWithProviders(
      <FirstRealPrintDialog onConfirm={() => {}} onClose={() => {}} />
    );
    const results = await axe(container);
    const seriousOrCritical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );
    if (seriousOrCritical.length > 0) {
      console.error(
        'first-real-print-dialog a11y:',
        JSON.stringify(
          seriousOrCritical.map((v) => ({ id: v.id, impact: v.impact })),
          null,
          2
        )
      );
    }
    expect(seriousOrCritical).toEqual([]);
  });
});
