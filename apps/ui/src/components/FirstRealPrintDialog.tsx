import { useEffect, useRef } from 'react';
import { Button, Dialog, IconButton, Text } from './ui';
import { TbX, TbAlertTriangle } from 'react-icons/tb';

interface FirstRealPrintDialogProps {
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * A one-time caution shown the FIRST time the user turns a design into a real, printable file
 * ("Make it real"). The PRD (§6.10) calls out that the manufacturing-commit moment must NOT be
 * identical the 1st and the 100th time — the first real output deserves a heightened, quick-check
 * beat so a beginner doesn't blindly commit a print that won't fit or uses the wrong material.
 * After the user confirms once, the caller sets a localStorage flag and this never shows again.
 */
export function FirstRealPrintDialog({ onConfirm, onClose }: FirstRealPrintDialogProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    window.requestAnimationFrame(() => confirmRef.current?.focus());
  }, []);

  // Escape is handled by the shared <Dialog> (UIUX-2), which also traps focus.

  return (
    <Dialog
      onClose={onClose}
      testId="first-real-print-dialog"
      labelledBy="first-real-print-title"
      panelClassName="rounded-xl shadow-2xl w-full max-w-md mx-4 flex flex-col overflow-hidden"
      panelStyle={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
      }}
    >
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border-primary)' }}
        >
          <div className="flex items-center gap-2">
            <TbAlertTriangle size={18} style={{ color: 'var(--accent-primary)' }} />
            <Text id="first-real-print-title" variant="section-heading" weight="medium" color="tertiary">
              Before your first real print
            </Text>
          </div>
          <IconButton size="sm" onClick={onClose} title="Close" aria-label="Close first real print dialog">
            <TbX size={16} />
          </IconButton>
        </div>
        <div className="px-6 py-5 space-y-3">
          <Text>
            You&rsquo;re about to turn this design into a real, printable file for the first time.
            One quick check before it&rsquo;s real:
          </Text>
          <ul
            className="list-disc pl-5 space-y-1 text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            <li>The part fits your printer&rsquo;s build plate.</li>
            <li>The material loaded matches the print profile.</li>
            <li>The size and orientation look right in the preview.</li>
          </ul>
          <Text variant="caption" color="tertiary">
            We&rsquo;ll only show this the first time.
          </Text>
        </div>
        <div
          className="flex justify-end gap-2 px-6 py-4"
          style={{ borderTop: '1px solid var(--border-primary)' }}
        >
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button ref={confirmRef} variant="primary" data-testid="first-real-print-confirm" onClick={onConfirm}>
            Make it real
          </Button>
        </div>
    </Dialog>
  );
}
