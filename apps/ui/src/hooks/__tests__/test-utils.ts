/**
 * Shared hook test utilities. This file is excluded from test discovery
 * (see testPathIgnorePatterns in jest.config.cjs) so it can be imported
 * by tests without being executed as its own suite.
 */

import { type TextStreamPart, type ToolSet } from "ai";
import { render } from "@testing-library/react";
import { jest } from "@jest/globals";
import { createElement } from "react";

export type StreamChunk = TextStreamPart<ToolSet>;

export function createAnalyticsSpy() {
  return {
    track: jest.fn(),
    trackError: jest.fn(),
    setAnalyticsEnabled: jest.fn(),
  };
}

export function createHookHarness<T>(useValue: () => T) {
  let latest: T;

  function Harness() {
    latest = useValue();
    return null;
  }

  const view = render(createElement(Harness));

  return {
    current() {
      return latest!;
    },
    /**
     * Re-run the hook with whatever its inputs now are.
     *
     * Needed to test any effect keyed on a changing prop: mounting with the final value means
     * the dependency never CHANGES, so the effect fires once at mount and never again. E2E-B
     * (a tune that left the displayed dimensions stale) is exactly that shape — describe first,
     * then edit — and could not be reproduced without it.
     */
    rerender() {
      view.rerender(createElement(Harness));
    },
    unmount: view.unmount,
  };
}

export function createStreamResult(chunks: StreamChunk[]) {
  return {
    fullStream: (async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    })(),
  };
}
