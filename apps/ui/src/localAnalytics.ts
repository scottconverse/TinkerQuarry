export type RenderTrigger =
  | 'initial'
  | 'manual'
  | 'auto_idle'
  | 'save'
  | 'tab_switch'
  | 'file_open'
  | 'history_restore'
  | 'code_update'
  | 'ai_edit';

export type SettingsSection =
  | 'appearance'
  | 'viewer'
  | 'editor'
  | 'ai'
  | 'libraries'
  | 'project'
  | 'about';
export type ModelSelectionSurface = 'welcome' | 'ai_panel' | 'viewer_annotation' | 'unknown';
export type ViewerKind = '2d' | '3d';
export type ViewerTool =
  | 'pan'
  | 'orbit'
  | 'measure_distance'
  | 'measure_bbox'
  | 'section_plane'
  | 'annotate';
export type LayoutSelectionSource = 'nux' | 'settings' | 'layout_reset' | 'header';
export type CustomizerAction = 'open_ai_refine' | 'open_editor' | 'open_export';
export type ViewerPreferenceKey =
  | 'measurement_unit'
  | 'measurement_snap_enabled'
  | 'show_model_colors';
export type LocalEventErrorDomain =
  | 'bootstrap'
  | 'render'
  | 'ai'
  | 'file_io'
  | 'settings'
  | 'panel'
  | 'runtime';

export type AnalyticsErrorDomain = LocalEventErrorDomain;

export interface LocalEventErrorContext {
  operation: string;
  error?: unknown;
  errorDomain?: LocalEventErrorDomain;
  handled?: boolean;
  sourceComponent?: string;
  properties?: Record<string, unknown>;
}

export type AnalyticsErrorContext = LocalEventErrorContext;

export interface LocalEventApi {
  track: (eventName: string, properties?: Record<string, unknown>) => void;
  trackError: (context: LocalEventErrorContext) => void;
  setAnalyticsEnabled: (enabled: boolean, options?: { capturePreferenceChange?: boolean }) => void;
}

export type AnalyticsApi = LocalEventApi;

const LOCAL_EVENTS: LocalEventApi = {
  track: () => {},
  trackError: () => {},
  setAnalyticsEnabled: () => {},
};

export function useAnalytics(): LocalEventApi {
  return LOCAL_EVENTS;
}

export function trackAnalyticsEvent(..._args: Parameters<LocalEventApi['track']>) {
  void _args;
}

export function trackAnalyticsError(..._args: Parameters<LocalEventApi['trackError']>) {
  void _args;
}

export function setAnalyticsEnabled(..._args: Parameters<LocalEventApi['setAnalyticsEnabled']>) {
  void _args;
}

export function inferErrorDomain(operation: string): LocalEventErrorDomain {
  if (operation.includes('render') || operation.includes('openscad')) return 'render';
  if (operation.includes('ai')) return 'ai';
  if (
    operation.includes('file') ||
    operation.includes('save') ||
    operation.includes('open') ||
    operation.includes('export')
  ) {
    return 'file_io';
  }
  if (operation.includes('setting') || operation.includes('library')) return 'settings';
  if (operation.includes('panel')) return 'panel';
  return 'runtime';
}

export function bucketCount(value: number, thresholds: number[]): string {
  for (const threshold of thresholds) {
    if (value <= threshold) {
      return `<=${threshold}`;
    }
  }

  return `>${thresholds[thresholds.length - 1]}`;
}
