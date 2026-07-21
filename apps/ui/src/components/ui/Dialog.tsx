import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useFocusTrap } from "./useFocusTrap";

/**
 * The app's one modal dialog primitive.
 *
 * UIUX-2 (Critical, GauntletGate 2026-07-19): every dialog in the shipped app was hand-rolled and
 * none of them trapped keyboard focus or was consistently announced as a dialog. Routing them all
 * through this component means the next dialog gets the behaviour for free, and a regression in
 * one place is a regression the whole suite catches.
 */
export interface DialogProps {
  /** Called for Escape, a backdrop click, and whatever close controls the body renders. */
  onClose: () => void;
  /** id of the element naming the dialog. Preferred over `label`. */
  labelledBy?: string;
  /** Accessible name, when there is no visible title element to point at. */
  label?: string;
  /** data-testid for the dialog panel itself. */
  testId?: string;
  panelClassName?: string;
  panelStyle?: CSSProperties;
  overlayClassName?: string;
  /** Set false for a dialog that must not be dismissed by clicking away. */
  closeOnBackdropClick?: boolean;
  children: ReactNode;
}

export function Dialog({
  onClose,
  labelledBy,
  label,
  testId,
  panelClassName = "",
  panelStyle,
  overlayClassName = "fixed inset-0 flex items-center justify-center z-50",
  closeOnBackdropClick = true,
  children,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, true);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className={overlayClassName}
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
      }}
      onClick={closeOnBackdropClick ? onClose : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        data-testid={testId}
        tabIndex={-1}
        className={panelClassName}
        style={panelStyle}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
