import { useEffect, type RefObject } from "react";
import { eventBus } from "../platform";
import { openPanel } from "../stores/layoutStore";
import type { TabId } from "../stores/workspaceTypes";

interface GlobalShortcutTargets {
  /** The AI prompt panel to focus on ⌘K/Ctrl+K (structural: anything with focusPrompt). */
  aiPromptPanelRef: RefObject<{ focusPrompt: () => void } | null>;
  openSettings: () => void;
  createNewTab: () => void;
  closeTab: (id: TabId) => void;
  activeTabId: TabId;
}

/** Global keyboard shortcuts (⌘K AI prompt, ⌘, settings, ⌘T new tab, ⌘W close tab,
 * ⌘⌥S save all). Behavior extracted verbatim from App.tsx (v1.5 App.tsx extraction,
 * phase 1a) — including the pre-existing quirk that shortcuts fire regardless of focus
 * (e.g. inside text inputs); changing that is a product decision, not a refactor. */
export function useGlobalKeyboardShortcuts({
  aiPromptPanelRef,
  openSettings,
  createNewTab,
  closeTab,
  activeTabId,
}: GlobalShortcutTargets): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K or Ctrl+K to focus AI prompt
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openPanel("ai-chat", "ai-chat", "AI");
        setTimeout(() => {
          aiPromptPanelRef.current?.focusPrompt();
        }, 0);
      }
      // ⌘, or Ctrl+, to open settings
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        openSettings();
      }
      // ⌘T or Ctrl+T for new tab
      if ((e.metaKey || e.ctrlKey) && e.key === "t") {
        e.preventDefault();
        createNewTab();
      }
      // ⌘W or Ctrl+W to close tab
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault();
        closeTab(activeTabId);
      }
      // ⌘⌥S or Ctrl+Alt+S to save all
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key === "s") {
        e.preventDefault();
        eventBus.emit("menu:file:save_all");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [aiPromptPanelRef, openSettings, createNewTab, closeTab, activeTabId]);
}
