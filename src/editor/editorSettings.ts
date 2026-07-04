import { LANGUAGE_OPTIONS, type LanguageCode } from '../lang';

export const DEFAULT_PIXELS_PER_BEAT = 150;
export const MIN_PIXELS_PER_BEAT = 20;
export const MAX_PIXELS_PER_BEAT = 500;
export const EDITOR_SETTINGS_STORAGE_KEY = 'dancerail3-editor:settings';
export const STATISTICS_REFRESH_RATE_OPTIONS = ['15fps', '30fps', '60fps', 'max'] as const;
export const SELECTION_TYPE_OPTIONS = ['window', 'crossing'] as const;
export const PREVIEW_DISPLAY_MODE_OPTIONS = ['2d', '3d'] as const;
export const DEFAULT_PREVIEW_3D_TILT_DEGREES = 23.4;
export const MIN_PREVIEW_3D_TILT_DEGREES = 12;
export const MAX_PREVIEW_3D_TILT_DEGREES = 32;

export type StatisticsRefreshRate = typeof STATISTICS_REFRESH_RATE_OPTIONS[number];
export type SelectionType = typeof SELECTION_TYPE_OPTIONS[number];
export type PreviewDisplayMode = typeof PREVIEW_DISPLAY_MODE_OPTIONS[number];

export interface EditorSettings {
  language: LanguageCode;
  isExitWarningEnabled: boolean;
  isBackdropBlurDisabled: boolean;
  isAnimationDisabled: boolean;
  isScrollDirectionInverted: boolean;
  areTimingChangeIndicatorsAdjusted: boolean;
  isEditorJudgementGlowEnabled: boolean;
  isVSyncEnabled: boolean;
  isDr3FpPreviewEnabled: boolean;
  isAudioConversionEnabled: boolean;
  selectionType: SelectionType;
  statisticsRefreshRate: StatisticsRefreshRate;
  musicVolume: number;
  tapSoundVolume: number;
  flickSoundVolume: number;
  gridZoom: number;
  isXPositionGridEnabled: boolean;
  isOutOfBoundsPlacementEnabled: boolean;
  isPreviewPrecomputeEnabled: boolean;
  pixelsPerBeat: number;
  isPreviewSpritesEnabled: boolean;
  isPreviewHitFxEnabled: boolean;
  isPreviewChartSpeedChangesEnabled: boolean;
  isPreviewCameraTiltEnabled: boolean;
  isPreviewCameraMovementEnabled: boolean;
  isPreviewNoteSpeedChangesEnabled: boolean;
  isPreviewNoteAppearModeEnabled: boolean;
  previewDisplayMode: PreviewDisplayMode;
  preview3DTiltDegrees: number;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  language: 'en',
  isExitWarningEnabled: true,
  isBackdropBlurDisabled: false,
  isAnimationDisabled: false,
  isScrollDirectionInverted: false,
  areTimingChangeIndicatorsAdjusted: true,
  isEditorJudgementGlowEnabled: true,
  isVSyncEnabled: true,
  isDr3FpPreviewEnabled: false,
  isAudioConversionEnabled: true,
  selectionType: 'window',
  statisticsRefreshRate: '30fps',
  musicVolume: 1,
  tapSoundVolume: 1,
  flickSoundVolume: 1,
  gridZoom: 4,
  isXPositionGridEnabled: true,
  isOutOfBoundsPlacementEnabled: false,
  isPreviewPrecomputeEnabled: true,
  pixelsPerBeat: DEFAULT_PIXELS_PER_BEAT,
  isPreviewSpritesEnabled: true,
  isPreviewHitFxEnabled: false,
  isPreviewChartSpeedChangesEnabled: true,
  isPreviewCameraTiltEnabled: true,
  isPreviewCameraMovementEnabled: true,
  isPreviewNoteSpeedChangesEnabled: true,
  isPreviewNoteAppearModeEnabled: true,
  previewDisplayMode: '2d',
  preview3DTiltDegrees: DEFAULT_PREVIEW_3D_TILT_DEGREES,
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isValidVolume = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 2
);

const isValidGridZoom = (value: unknown): value is number => (
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 0
);

const isValidPixelsPerBeat = (value: unknown): value is number => (
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= MIN_PIXELS_PER_BEAT &&
  value <= MAX_PIXELS_PER_BEAT
);

const isValidStatisticsRefreshRate = (value: unknown): value is StatisticsRefreshRate => (
  typeof value === 'string' &&
  STATISTICS_REFRESH_RATE_OPTIONS.includes(value as StatisticsRefreshRate)
);

const isValidSelectionType = (value: unknown): value is SelectionType => (
  typeof value === 'string' &&
  SELECTION_TYPE_OPTIONS.includes(value as SelectionType)
);

const isValidPreviewDisplayMode = (value: unknown): value is PreviewDisplayMode => (
  typeof value === 'string' &&
  PREVIEW_DISPLAY_MODE_OPTIONS.includes(value as PreviewDisplayMode)
);

const isValidPreview3DTiltDegrees = (value: unknown): value is number => (
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= MIN_PREVIEW_3D_TILT_DEGREES &&
  value <= MAX_PREVIEW_3D_TILT_DEGREES
);

const isValidLanguageCode = (value: unknown): value is LanguageCode => (
  typeof value === 'string' &&
  LANGUAGE_OPTIONS.some(option => option.id === value)
);

export const getStatisticsRefreshIntervalMs = (refreshRate: StatisticsRefreshRate) => {
  if (refreshRate === 'max') {
    return 0;
  }

  return 1000 / Number(refreshRate.replace('fps', ''));
};

export const loadEditorSettings = (): EditorSettings => {
  if (typeof window === 'undefined') return DEFAULT_EDITOR_SETTINGS;

  try {
    const storedSettings = window.localStorage.getItem(EDITOR_SETTINGS_STORAGE_KEY);
    if (!storedSettings) return DEFAULT_EDITOR_SETTINGS;

    const parsedSettings: unknown = JSON.parse(storedSettings);
    if (!isPlainRecord(parsedSettings)) return DEFAULT_EDITOR_SETTINGS;

    return {
      language: isValidLanguageCode(parsedSettings.language)
        ? parsedSettings.language
        : DEFAULT_EDITOR_SETTINGS.language,
      isExitWarningEnabled: typeof parsedSettings.isExitWarningEnabled === 'boolean'
        ? parsedSettings.isExitWarningEnabled
        : DEFAULT_EDITOR_SETTINGS.isExitWarningEnabled,
      isBackdropBlurDisabled: typeof parsedSettings.isBackdropBlurDisabled === 'boolean'
        ? parsedSettings.isBackdropBlurDisabled
        : DEFAULT_EDITOR_SETTINGS.isBackdropBlurDisabled,
      isAnimationDisabled: typeof parsedSettings.isAnimationDisabled === 'boolean'
        ? parsedSettings.isAnimationDisabled
        : DEFAULT_EDITOR_SETTINGS.isAnimationDisabled,
      isScrollDirectionInverted: typeof parsedSettings.isScrollDirectionInverted === 'boolean'
        ? parsedSettings.isScrollDirectionInverted
        : DEFAULT_EDITOR_SETTINGS.isScrollDirectionInverted,
      areTimingChangeIndicatorsAdjusted: typeof parsedSettings.areTimingChangeIndicatorsAdjusted === 'boolean'
        ? parsedSettings.areTimingChangeIndicatorsAdjusted
        : DEFAULT_EDITOR_SETTINGS.areTimingChangeIndicatorsAdjusted,
      isEditorJudgementGlowEnabled: typeof parsedSettings.isEditorJudgementGlowEnabled === 'boolean'
        ? parsedSettings.isEditorJudgementGlowEnabled
        : DEFAULT_EDITOR_SETTINGS.isEditorJudgementGlowEnabled,
      isVSyncEnabled: typeof parsedSettings.isVSyncEnabled === 'boolean'
        ? parsedSettings.isVSyncEnabled
        : DEFAULT_EDITOR_SETTINGS.isVSyncEnabled,
      isDr3FpPreviewEnabled: typeof parsedSettings.isDr3FpPreviewEnabled === 'boolean'
        ? parsedSettings.isDr3FpPreviewEnabled
        : DEFAULT_EDITOR_SETTINGS.isDr3FpPreviewEnabled,
      isAudioConversionEnabled: typeof parsedSettings.isAudioConversionEnabled === 'boolean'
        ? parsedSettings.isAudioConversionEnabled
        : DEFAULT_EDITOR_SETTINGS.isAudioConversionEnabled,
      selectionType: isValidSelectionType(parsedSettings.selectionType)
        ? parsedSettings.selectionType
        : DEFAULT_EDITOR_SETTINGS.selectionType,
      statisticsRefreshRate: isValidStatisticsRefreshRate(parsedSettings.statisticsRefreshRate)
        ? parsedSettings.statisticsRefreshRate
        : DEFAULT_EDITOR_SETTINGS.statisticsRefreshRate,
      musicVolume: isValidVolume(parsedSettings.musicVolume)
        ? parsedSettings.musicVolume
        : DEFAULT_EDITOR_SETTINGS.musicVolume,
      tapSoundVolume: isValidVolume(parsedSettings.tapSoundVolume)
        ? parsedSettings.tapSoundVolume
        : DEFAULT_EDITOR_SETTINGS.tapSoundVolume,
      flickSoundVolume: isValidVolume(parsedSettings.flickSoundVolume)
        ? parsedSettings.flickSoundVolume
        : DEFAULT_EDITOR_SETTINGS.flickSoundVolume,
      gridZoom: isValidGridZoom(parsedSettings.gridZoom)
        ? parsedSettings.gridZoom
        : DEFAULT_EDITOR_SETTINGS.gridZoom,
      isXPositionGridEnabled: typeof parsedSettings.isXPositionGridEnabled === 'boolean'
        ? parsedSettings.isXPositionGridEnabled
        : DEFAULT_EDITOR_SETTINGS.isXPositionGridEnabled,
      isOutOfBoundsPlacementEnabled: typeof parsedSettings.isOutOfBoundsPlacementEnabled === 'boolean'
        ? parsedSettings.isOutOfBoundsPlacementEnabled
        : DEFAULT_EDITOR_SETTINGS.isOutOfBoundsPlacementEnabled,
      isPreviewPrecomputeEnabled: typeof parsedSettings.isPreviewPrecomputeEnabled === 'boolean'
        ? parsedSettings.isPreviewPrecomputeEnabled
        : DEFAULT_EDITOR_SETTINGS.isPreviewPrecomputeEnabled,
      pixelsPerBeat: isValidPixelsPerBeat(parsedSettings.pixelsPerBeat)
        ? parsedSettings.pixelsPerBeat
        : DEFAULT_EDITOR_SETTINGS.pixelsPerBeat,
      isPreviewSpritesEnabled: typeof parsedSettings.isPreviewSpritesEnabled === 'boolean'
        ? parsedSettings.isPreviewSpritesEnabled
        : DEFAULT_EDITOR_SETTINGS.isPreviewSpritesEnabled,
      isPreviewHitFxEnabled: typeof parsedSettings.isPreviewHitFxEnabled === 'boolean'
        ? parsedSettings.isPreviewHitFxEnabled
        : DEFAULT_EDITOR_SETTINGS.isPreviewHitFxEnabled,
      isPreviewChartSpeedChangesEnabled: typeof parsedSettings.isPreviewChartSpeedChangesEnabled === 'boolean'
        ? parsedSettings.isPreviewChartSpeedChangesEnabled
        : DEFAULT_EDITOR_SETTINGS.isPreviewChartSpeedChangesEnabled,
      isPreviewCameraTiltEnabled: typeof parsedSettings.isPreviewCameraTiltEnabled === 'boolean'
        ? parsedSettings.isPreviewCameraTiltEnabled
        : DEFAULT_EDITOR_SETTINGS.isPreviewCameraTiltEnabled,
      isPreviewCameraMovementEnabled: typeof parsedSettings.isPreviewCameraMovementEnabled === 'boolean'
        ? parsedSettings.isPreviewCameraMovementEnabled
        : DEFAULT_EDITOR_SETTINGS.isPreviewCameraMovementEnabled,
      isPreviewNoteSpeedChangesEnabled: typeof parsedSettings.isPreviewNoteSpeedChangesEnabled === 'boolean'
        ? parsedSettings.isPreviewNoteSpeedChangesEnabled
        : DEFAULT_EDITOR_SETTINGS.isPreviewNoteSpeedChangesEnabled,
      isPreviewNoteAppearModeEnabled: typeof parsedSettings.isPreviewNoteAppearModeEnabled === 'boolean'
        ? parsedSettings.isPreviewNoteAppearModeEnabled
        : DEFAULT_EDITOR_SETTINGS.isPreviewNoteAppearModeEnabled,
      previewDisplayMode: isValidPreviewDisplayMode(parsedSettings.previewDisplayMode)
        ? parsedSettings.previewDisplayMode
        : DEFAULT_EDITOR_SETTINGS.previewDisplayMode,
      preview3DTiltDegrees: isValidPreview3DTiltDegrees(parsedSettings.preview3DTiltDegrees)
        ? parsedSettings.preview3DTiltDegrees
        : DEFAULT_EDITOR_SETTINGS.preview3DTiltDegrees,
    };
  } catch {
    return DEFAULT_EDITOR_SETTINGS;
  }
};

export const saveEditorSettings = (settings: EditorSettings) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(EDITOR_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable in private browsing or restricted iframe contexts.
  }
};
