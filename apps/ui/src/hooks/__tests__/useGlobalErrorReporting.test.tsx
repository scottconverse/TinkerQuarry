/** @jest-environment jsdom */

import { act, render } from '@testing-library/react';
import { jest } from '@jest/globals';

const mockNotifyError = jest.fn();

jest.unstable_mockModule('@/utils/notifications', () => ({
  notifyError: (...args: unknown[]) => mockNotifyError(...args),
}));

let useGlobalErrorReporting: typeof import('../useGlobalErrorReporting').useGlobalErrorReporting;
let isIgnorableError: typeof import('../useGlobalErrorReporting').isIgnorableError;

function Harness() {
  useGlobalErrorReporting();
  return null;
}

function dispatchRejection(reason: unknown) {
  // jsdom has no PromiseRejectionEvent constructor; the handler only reads `.reason`.
  const event = new Event('unhandledrejection') as Event & { reason: unknown };
  event.reason = reason;
  act(() => {
    window.dispatchEvent(event);
  });
}

describe('useGlobalErrorReporting (extracted from App.tsx, phase 1a)', () => {
  beforeAll(async () => {
    ({ useGlobalErrorReporting, isIgnorableError } = await import('../useGlobalErrorReporting'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('an unexpected window error becomes one deduplicated toast', () => {
    const { unmount } = render(<Harness />);
    act(() => {
      window.dispatchEvent(new ErrorEvent('error', { error: new Error('boom') }));
    });
    expect(mockNotifyError).toHaveBeenCalledTimes(1);
    const call = mockNotifyError.mock.calls[0][0] as { toastId: string; logLabel: string };
    expect(call.toastId).toBe('unexpected-runtime-error');
    expect(call.logLabel).toBe('[App] Unhandled window error');
    unmount();
  });

  it('an unhandled rejection becomes a toast; ignorable reasons stay silent', () => {
    const { unmount } = render(<Harness />);
    dispatchRejection(new Error('render cancelled'));
    dispatchRejection(new Error('AbortError: request aborted'));
    expect(mockNotifyError).not.toHaveBeenCalled();
    dispatchRejection(new Error('engine exploded'));
    expect(mockNotifyError).toHaveBeenCalledTimes(1);
    expect((mockNotifyError.mock.calls[0][0] as { logLabel: string }).logLabel).toBe(
      '[App] Unhandled promise rejection',
    );
    unmount();
  });

  // Proven via the rejection path only: dispatching a real ErrorEvent with no listener
  // registered reads as an uncaught exception to jsdom itself.
  it('unmount removes the listeners', () => {
    const { unmount } = render(<Harness />);
    unmount();
    dispatchRejection(new Error('after unmount'));
    expect(mockNotifyError).not.toHaveBeenCalled();
  });

  it('isIgnorableError: cancellations, aborts, raw DOM events, and asset-loader noise', () => {
    expect(isIgnorableError(new Error('Canceled'))).toBe(true);
    expect(isIgnorableError('render canceled')).toBe(true);
    expect(isIgnorableError(new Error('operation aborted'))).toBe(true);
    expect(isIgnorableError(new Event('error'))).toBe(true);
    expect(isIgnorableError(new Error('Could not load /env.hdr'))).toBe(true);
    expect(isIgnorableError({ message: 'cancelled' })).toBe(true);
    expect(isIgnorableError(new Error('real failure'))).toBe(false);
    expect(isIgnorableError('kaboom')).toBe(false);
    expect(isIgnorableError(null)).toBe(false);
  });
});
