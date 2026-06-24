import { useState, useEffect, useRef } from 'react';
import { useAnalytics } from '../analytics/runtime';
import { getPlatform } from '../platform';
import { isExportValidationError } from '../services/exportErrors';
import { exportModelWithContext } from '../services/exportService';
import type { ExportFormat as RenderExportFormat } from '../services/renderService';
import { useSettings } from '../stores/settingsStore';
import {
  Button,
  IconButton,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Label,
  Text,
} from './ui';
import { TbX } from 'react-icons/tb';
import { normalizeAppError, notifyError, notifySuccess } from '../utils/notifications';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  source: string;
  workingDir?: string | null;
  previewKind?: 'mesh' | 'svg';
  stepUrl?: string | null;
  capturePreview?: () => Promise<string | null>;
  downloadStep?: () => Promise<Uint8Array | null>;
}

type ProductExportFormat = RenderExportFormat | 'scad' | 'step';

const FORMAT_OPTIONS_3D: { value: ProductExportFormat; label: string; ext: string }[] = [
  { value: 'scad', label: 'OpenSCAD Source', ext: 'scad' },
  { value: 'stl', label: 'STL', ext: 'stl' },
  { value: 'obj', label: 'OBJ', ext: 'obj' },
  { value: 'amf', label: 'AMF', ext: 'amf' },
  { value: '3mf', label: '3MF', ext: '3mf' },
  { value: 'png', label: 'PNG Preview', ext: 'png' },
];

const FORMAT_OPTIONS_2D: { value: ProductExportFormat; label: string; ext: string }[] = [
  { value: 'scad', label: 'OpenSCAD Source', ext: 'scad' },
  { value: 'svg', label: 'SVG', ext: 'svg' },
  { value: 'dxf', label: 'DXF', ext: 'dxf' },
  { value: 'png', label: 'PNG Preview', ext: 'png' },
];

function bytesFromDataUrl(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('Preview capture did not return an image.');
  const meta = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  if (meta.includes(';base64')) {
    return Uint8Array.from(atob(payload), (char) => char.charCodeAt(0));
  }
  return new TextEncoder().encode(decodeURIComponent(payload));
}

function isRenderFormat(format: ProductExportFormat): format is RenderExportFormat {
  return format !== 'scad' && format !== 'step';
}

export function ExportDialog({
  isOpen,
  onClose,
  source,
  workingDir,
  previewKind,
  stepUrl,
  capturePreview,
  downloadStep,
}: ExportDialogProps) {
  const analytics = useAnalytics();
  const [settings] = useSettings();
  const [format, setFormat] = useState<ProductExportFormat>(previewKind === 'svg' ? 'svg' : 'stl');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string>('');
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Reset format each time the dialog opens so the default reflects the current preview kind.
  // useState only runs once at mount, but this component stays mounted with isOpen=false.
  useEffect(() => {
    if (isOpen) {
      setFormat(previewKind === 'svg' ? 'svg' : 'stl');
      setError('');
      window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    }
  }, [isOpen, previewKind]);

  useEffect(() => {
    if (!isOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const formatOptions =
    previewKind === 'svg'
      ? FORMAT_OPTIONS_2D
      : stepUrl
        ? [...FORMAT_OPTIONS_3D, { value: 'step' as const, label: 'STEP', ext: 'step' }]
        : FORMAT_OPTIONS_3D;

  const handleExport = async () => {
    setError('');
    setIsExporting(true);

    try {
      const selectedFormat = formatOptions.find((f) => f.value === format);
      if (!selectedFormat) return;

      let exportBytes: Uint8Array;
      if (format === 'scad') {
        exportBytes = new TextEncoder().encode(source);
      } else if (format === 'png') {
        const preview = await capturePreview?.();
        if (!preview) throw new Error('No preview image is available to export.');
        exportBytes = bytesFromDataUrl(preview);
      } else if (format === 'step') {
        const bytes = await downloadStep?.();
        if (!bytes) throw new Error('This design does not have an editable STEP export.');
        exportBytes = bytes;
      } else if (isRenderFormat(format)) {
        exportBytes = await exportModelWithContext({
          format,
          source,
          workingDir,
          library: settings.library,
        });
      } else {
        throw new Error('Unsupported export format.');
      }

      await getPlatform().fileExport(exportBytes, `export.${selectedFormat.ext}`, [
        { name: selectedFormat.label, extensions: [selectedFormat.ext] },
      ]);

      analytics.track('file exported', {
        format,
      });

      notifySuccess('Exported successfully', { toastId: 'export-success' });

      // Success - close dialog
      onClose();
    } catch (err) {
      const normalized = normalizeAppError(err, 'Export failed');
      setError(normalized.message);
      notifyError({
        operation: 'export-file',
        error: err,
        capture: !isExportValidationError(err),
        fallbackMessage: 'Export failed',
        toastId: 'export-error',
        logLabel: '[ExportDialog] Export failed',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        data-testid="export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
        className="rounded-xl shadow-2xl w-full max-w-md mx-4 flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border-primary)' }}
        >
          <Text id="export-dialog-title" variant="section-heading" weight="medium" color="tertiary">
            Export Model
          </Text>
          <IconButton ref={closeButtonRef} size="sm" onClick={onClose} title="Close" aria-label="Close export dialog">
            <TbX size={16} />
          </IconButton>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <Label className="mb-2">Export Format</Label>
            <Select
              value={format}
              onValueChange={(v) => setFormat(v as ProductExportFormat)}
              disabled={isExporting}
            >
              <SelectTrigger data-testid="export-format-select" aria-label="Export Format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {formatOptions.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    data-testid={`format-option-${opt.value}`}
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div
              className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm"
              style={{
                backgroundColor: 'rgba(220, 50, 47, 0.1)',
                border: '1px solid rgba(220, 50, 47, 0.3)',
                color: 'var(--color-error)',
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-6 py-3 shrink-0"
          style={{ borderTop: '1px solid var(--border-primary)' }}
        >
          <Button variant="primary" onClick={handleExport} disabled={isExporting}>
            {isExporting ? 'Exporting...' : 'Export'}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={isExporting}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
