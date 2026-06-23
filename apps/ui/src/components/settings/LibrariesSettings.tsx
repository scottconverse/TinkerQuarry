import { useEffect, useState } from 'react';
import { TbFolderOpen, TbPlus, TbTrash } from 'react-icons/tb';
import { Button, IconButton } from '../ui';
import type { Settings } from '../../stores/settingsStore';
import { engine, type ExternalLibraryEntry } from '../../services/engineClient';
import { getPlatform } from '../../platform';
import {
  SettingsCard,
  SettingsCardHeader,
  SettingsCardSection,
  SettingsControlRow,
  SettingsSubsectionLabel,
  SettingsSupportBlock,
} from './SettingsPrimitives';
import { Toggle } from '../ui';

interface LibrariesSettingsProps {
  settings: Settings;
  autoDiscoveredPaths: string[];
  onLibraryChange: <K extends keyof Settings['library']>(
    key: K,
    value: Settings['library'][K]
  ) => void;
  onAddPath: () => void;
  onRemovePath: (path: string) => void;
}

export function LibrariesSettings({
  settings,
  autoDiscoveredPaths,
  onLibraryChange,
  onAddPath,
  onRemovePath,
}: LibrariesSettingsProps) {
  const [externalLibraries, setExternalLibraries] = useState<ExternalLibraryEntry[]>([]);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [isAdmitting, setIsAdmitting] = useState(false);

  const refreshAdmittedLibraries = async () => {
    const r = await engine.libraries();
    if (r.ok) {
      setExternalLibraries(r.data.external ?? []);
      setLibraryError(null);
    } else {
      setLibraryError(r.data.error || 'Could not read admitted libraries.');
    }
  };

  useEffect(() => {
    void refreshAdmittedLibraries();
  }, []);

  const handleAdmitLibrary = async () => {
    const path = await getPlatform().pickDirectory();
    if (!path) return;
    const name = path.split(/[\\/]/).filter(Boolean).pop() || 'External library';
    const ok = await getPlatform().confirm(
      `Admit "${name}" as an external OpenSCAD library?\n\nTinkerQuarry will copy .scad files into its sandbox and use that copy for rendering.`,
      { title: 'Admit SCAD library', kind: 'warning', okLabel: 'Admit library' }
    );
    if (!ok) return;
    setIsAdmitting(true);
    const r = await engine.admitLibrary(path, name);
    setIsAdmitting(false);
    if (!r.ok) {
      setLibraryError(r.data.error || 'Could not admit that library.');
      return;
    }
    await refreshAdmittedLibraries();
  };

  const handleRemoveAdmittedLibrary = async (slug: string) => {
    const r = await engine.removeLibrary(slug);
    if (!r.ok) {
      setLibraryError(r.data.error || 'Could not remove that library.');
      return;
    }
    await refreshAdmittedLibraries();
  };

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-section-gap)' }}>
      <SettingsCard>
        <SettingsControlRow
          label="Auto-discover System Libraries"
          description="Automatically find OpenSCAD libraries in standard system locations"
          control={
            <Toggle
              checked={settings.library.autoDiscoverSystem}
              onChange={(v) => onLibraryChange('autoDiscoverSystem', v)}
            />
          }
        />

        {settings.library.autoDiscoverSystem && (
          <SettingsCardSection
            divided
            className="flex flex-col"
            style={{ gap: 'var(--space-label-gap)' }}
          >
            <SettingsSubsectionLabel>System Paths</SettingsSubsectionLabel>
            {autoDiscoveredPaths.length === 0 ? (
              <SettingsSupportBlock
                className="text-sm italic"
                style={{ color: 'var(--text-tertiary)' }}
              >
                No system libraries found
              </SettingsSupportBlock>
            ) : (
              <div className="flex flex-col" style={{ gap: 'var(--space-control-gap)' }}>
                {autoDiscoveredPaths.map((path) => (
                  <SettingsSupportBlock
                    key={path}
                    className="flex items-center text-sm"
                    style={{ gap: 'var(--space-control-gap)', opacity: 0.8 }}
                  >
                    <span style={{ color: 'var(--color-success)' }}>✓</span>
                    <span
                      className="font-mono text-xs truncate"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {path}
                    </span>
                  </SettingsSupportBlock>
                ))}
              </div>
            )}
          </SettingsCardSection>
        )}
      </SettingsCard>

      <SettingsCard>
        <SettingsCardHeader
          title="Admitted External Libraries"
          description="Copy a user-installed OpenSCAD library into TinkerQuarry's sandbox before rendering with it."
          action={
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void handleAdmitLibrary()}
              disabled={isAdmitting}
              className="flex items-center"
              style={{
                color: 'var(--accent-primary)',
                border: '1px solid var(--border-primary)',
                gap: 'var(--space-1)',
              }}
            >
              <TbPlus size={14} /> {isAdmitting ? 'Admitting...' : 'Admit Library'}
            </Button>
          }
        />

        <SettingsCardSection>
          {libraryError && (
            <SettingsSupportBlock
              className="text-sm"
              style={{ color: 'var(--color-error)', borderColor: 'var(--color-error)' }}
            >
              {libraryError}
            </SettingsSupportBlock>
          )}
          {externalLibraries.length === 0 ? (
            <SettingsSupportBlock
              className="text-sm italic text-center border border-dashed"
              style={{
                color: 'var(--text-tertiary)',
                borderColor: 'var(--border-primary)',
                backgroundColor: 'transparent',
              }}
            >
              No external libraries admitted
            </SettingsSupportBlock>
          ) : (
            <div className="flex flex-col" style={{ gap: 'var(--space-control-gap)' }}>
              {externalLibraries.map((lib) => (
                <SettingsSupportBlock
                  key={lib.slug}
                  className="flex items-center justify-between group"
                  style={{
                    gap: 'var(--space-control-gap)',
                    backgroundColor: 'var(--bg-primary)',
                  }}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      {lib.name}
                    </span>
                    <span
                      className="font-mono text-xs truncate"
                      style={{ color: 'var(--text-secondary)' }}
                      title={lib.include_prefix}
                    >
                      include &lt;{lib.include_prefix}...&gt; · {lib.file_count ?? 0} files
                    </span>
                  </div>
                  <IconButton
                    size="sm"
                    onClick={() => void handleRemoveAdmittedLibrary(lib.slug)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--text-tertiary)' }}
                    title="Remove admitted library"
                  >
                    <TbTrash size={14} />
                  </IconButton>
                </SettingsSupportBlock>
              ))}
            </div>
          )}
        </SettingsCardSection>
      </SettingsCard>

      <SettingsCard>
        <SettingsCardHeader
          title="Custom Paths"
          description="Manage additional OpenSCAD library folders."
          action={
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onAddPath}
              className="flex items-center"
              style={{
                color: 'var(--accent-primary)',
                border: '1px solid var(--border-primary)',
                gap: 'var(--space-1)',
              }}
            >
              <TbPlus size={14} /> Add Path
            </Button>
          }
        />

        <SettingsCardSection>
          {settings.library.customPaths.length === 0 ? (
            <SettingsSupportBlock
              className="text-sm italic text-center border border-dashed"
              style={{
                color: 'var(--text-tertiary)',
                borderColor: 'var(--border-primary)',
                backgroundColor: 'transparent',
              }}
            >
              No custom library paths added
            </SettingsSupportBlock>
          ) : (
            <div className="flex flex-col" style={{ gap: 'var(--space-control-gap)' }}>
              {settings.library.customPaths.map((path) => (
                <SettingsSupportBlock
                  key={path}
                  className="flex items-center justify-between group"
                  style={{
                    gap: 'var(--space-control-gap)',
                    backgroundColor: 'var(--bg-primary)',
                  }}
                >
                  <div
                    className="flex items-center min-w-0"
                    style={{ gap: 'var(--space-control-gap)' }}
                  >
                    <TbFolderOpen size={16} style={{ color: 'var(--text-tertiary)' }} />
                    <span
                      className="font-mono text-xs truncate"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {path}
                    </span>
                  </div>
                  <IconButton
                    size="sm"
                    onClick={() => onRemovePath(path)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--text-tertiary)' }}
                    title="Remove path"
                  >
                    <TbTrash size={14} />
                  </IconButton>
                </SettingsSupportBlock>
              ))}
            </div>
          )}
        </SettingsCardSection>
      </SettingsCard>
    </div>
  );
}
