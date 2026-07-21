import { useEffect, type RefObject } from "react";

/**
 * Keyboard focus containment for modal surfaces.
 *
 * UIUX-2 (Critical, GauntletGate 2026-07-19): every dialog in the shipped app was hand-rolled and
 * NONE of them trapped focus — Tab walked straight out of the modal into the page hidden behind
 * the opaque backdrop, so a keyboard or screen-reader user could start typing into the background
 * editor while believing they were still in Settings. The defect was identical in all four dialogs
 * precisely because there was no shared abstraction; this is that abstraction.
 *
 * Hand-rolled rather than Radix: `@radix-ui/react-dialog` is not a dependency of this app (only
 * accordion / context-menu / select / switch / tabs / tooltip are). This is the standard
 * boundary-wrap implementation, and it defers to any nested trap that owns its own portal layer
 * (Radix Select's listbox, for example, is rendered outside this subtree and traps its own focus).
 */

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** Portal layers that run their own focus management; the trap must not fight them. */
const NESTED_TRAP_SELECTOR =
  "[data-radix-popper-content-wrapper],[data-radix-portal],[data-sonner-toaster]";

function hasLayout(el: HTMLElement): boolean {
  return el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;
}

export function focusableWithin(root: HTMLElement): HTMLElement[] {
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (el) => el.getAttribute("aria-hidden") !== "true" && !el.hasAttribute("hidden"),
  );
  // A test environment with no layout engine (jsdom) reports a zero-size box for everything,
  // including the panel. Only apply the size-based visibility filter where boxes are real.
  if (!hasLayout(root)) return candidates;
  return candidates.filter(hasLayout);
}

function ownedByNestedTrap(node: EventTarget | null): boolean {
  return node instanceof Element && Boolean(node.closest(NESTED_TRAP_SELECTOR));
}

/**
 * Keep Tab (and Shift+Tab) inside `panelRef` while `active`, move focus into it on open, and
 * return focus to whatever had it when the dialog closes.
 */
export function useFocusTrap(panelRef: RefObject<HTMLElement>, active = true): void {
  useEffect(() => {
    if (!active) return;
    const panel = panelRef.current;
    if (!panel) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Some dialogs focus a specific control themselves (FirstRealPrintDialog focuses Confirm);
    // only take over when nothing inside has focus yet.
    const frame = window.requestAnimationFrame(() => {
      if (panel.contains(document.activeElement)) return;
      (focusableWithin(panel)[0] ?? panel).focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || event.defaultPrevented) return;
      const target = event.target;

      if (!panel.contains(target as Node)) {
        if (ownedByNestedTrap(target)) return; // a nested trap owns this layer
        // Focus had already escaped (a backdrop click, say) — pull it back in.
        event.preventDefault();
        (focusableWithin(panel)[0] ?? panel).focus();
        return;
      }

      const items = focusableWithin(panel);
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;

      if (event.shiftKey) {
        if (current === first || current === panel) {
          event.preventDefault();
          last.focus();
        }
      } else if (current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown, true);
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [panelRef, active]);
}
