import { useEffect } from "react";
import { notifyError } from "../utils/notifications";

/** Whether a window-level error/rejection is expected noise (cancellations, aborts, asset
 * loaders with local fallbacks) that must not surface as a toast. Extracted verbatim from
 * App.tsx (v1.5 App.tsx extraction, phase 1a). */
export function isIgnorableError(reason: unknown): boolean {
  // Raw DOM Events (e.g. from img.onerror = reject) carry no meaningful error message.
  if (typeof Event !== "undefined" && reason instanceof Event) {
    return true;
  }

  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : typeof reason === "object" &&
            reason !== null &&
            "message" in reason &&
            typeof (reason as { message?: unknown }).message === "string"
          ? (reason as { message: string }).message
          : "";

  const normalized = message.trim().toLowerCase();
  return (
    normalized === "canceled" ||
    normalized === "cancelled" ||
    normalized === "render cancelled" ||
    normalized === "render canceled" ||
    normalized.includes("aborterror") ||
    normalized.includes("aborted") ||
    // drei/three.js asset loader errors (e.g. HDR environment map fetch failures)
    // are handled locally by EnvironmentWithFallback and should not surface as toasts.
    normalized.startsWith("could not load ")
  );
}

/** Global window error + unhandledrejection reporting: anything unexpected becomes one
 * deduplicated toast instead of a silent console entry. Behavior extracted verbatim from
 * App.tsx (v1.5 App.tsx extraction, phase 1a). */
export function useGlobalErrorReporting(): void {
  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      if (isIgnorableError(event.error ?? event.message)) {
        return;
      }
      notifyError({
        operation: "unexpected-runtime-error",
        error: event.error ?? event.message,
        fallbackMessage: "Something went wrong in the app",
        toastId: "unexpected-runtime-error",
        logLabel: "[App] Unhandled window error",
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isIgnorableError(event.reason)) {
        return;
      }

      notifyError({
        operation: "unexpected-runtime-error",
        error: event.reason,
        fallbackMessage: "An unexpected error interrupted the current action",
        toastId: "unexpected-runtime-error",
        logLabel: "[App] Unhandled promise rejection",
      });
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection,
      );
    };
  }, []);
}
