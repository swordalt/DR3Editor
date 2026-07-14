import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { convertBpmChangesToTime, getActiveChange, getBeatAtTime, getBpmChangeTimepos, getTimeAtBeat, formatTime } from './utils/editorUtils';
import EditorLayout from './components/EditorLayout';
import EditorFilePreviewModal from './components/EditorFilePreviewModal';
import type { NoteMultiEditCondition, NoteMultiEditRequest, NoteMultiEditResult } from './components/EditorNoteMultiEditModal';
import type { CameraRotationToolKeyframe, CameraRotationToolRequest, CameraRotationToolResult } from './components/EditorCameraRotationToolModal';
import { NOTE_TYPES, AVAILABLE_NOTE_TYPES, HOLD_CONNECTOR_TYPES, HOLD_CENTER_TYPES, HOLD_END_TYPES, HOLD_START_TYPES, UNKNOWN_NOTE_TYPE, canTypeHaveParent, getConnectorFill, isOfficialNoteSpeedLockedType, shouldOmitParentForType } from './constants/editorConstants';
import type { BpmChange, EditorFormData, EditorMode, Note, ProjectData, SelectionBox, SpeedChange, TimedBpmChange } from './types/editorTypes';
import type { ExportFormat } from './types/exportTypes';
import { createExportZipInWorker, warmExportWorker } from './utils/exportWorkerClient';
import { convertAudioFileToOgg, isOggAudioFile } from './utils/audioOggConversion';
import { buildLevelText, parseValidatedLevelText } from './utils/levelFormat';
import { applyAudioPlaybackSpeed } from './editor/audioPlayback';
import {
  DEFAULT_AUDIO_TIMING_CORRECTION,
  getCorrectedAudioDuration,
  getInitialAudioTimingCorrection,
  getMediaTimeFromPlaybackTime,
  getPlaybackTimeFromMediaTime,
  isMp3AudioFile,
  readAudioTimingCorrection,
  type AudioTimingCorrection,
} from './editor/audioTiming';
import {
  MAX_OPERATION_HISTORY_ENTRIES,
  type OperationHistoryEntry,
  type OperationHistorySnapshot,
  formatGroupedIds,
  formatHistoryNumber,
  formatHistoryTimestamp,
  formatMaybeValue,
  formatNoteLane,
  formatNoteName,
  formatTimingPosition,
  operationCategoryStyles,
} from './editor/editorHistory';
import {
  MAX_PIXELS_PER_BEAT,
  MIN_PIXELS_PER_BEAT,
  type PreviewDisplayMode,
  type SelectionType,
  type StatisticsRefreshRate,
  getStatisticsRefreshIntervalMs,
  loadEditorSettings,
  saveEditorSettings,
} from './editor/editorSettings';
import { buildNoteRenderIndex, getHoldConnectorSegmentsInRange, getNoteBeatEntriesInRange, getNoteBeatEntriesInViewport } from './editor/noteRenderIndex';
import { findChartIssues, type ChartIssue } from './editor/chartIssues';
import { stripInputWhitespace } from './utils/inputSanitization';

import {
  APPEAR_MODE_ENTRY_DISTANCE,
  APPEAR_MODE_H_ENTRY_PROGRESS_EXPONENT,
  APPEAR_MODE_H_FLY_DOWN_PIXELS,
  APPEAR_MODE_H_START_SCALE,
  APPEAR_MODE_OPTIONS,
  APPEAR_MODE_P_NSC,
  APPEAR_MODE_P_RENDER_DISTANCE,
  APPEAR_MODE_SIDE_ENTRY_MULTIPLIER,
  AUDIO_CLOCK_HANDOFF_DELAY_MS,
  AUDIO_CLOCK_SYNC_TOLERANCE_SECONDS,
  AUDIO_SEEK_TIMEOUT_MS,
  CURVE_EASINGS_BY_ID,
  CURVE_EASING_FAMILY_OPTIONS,
  CURVE_EASING_TYPE_OPTIONS,
  HIT_SOUND_JUMP_TOLERANCE_SECONDS,
  HIT_SOUND_LOOKAHEAD_SECONDS,
  LANE_COUNT,
  PAUSED_TIMELINE_RENDER_DURATION_MS,
  PERFORMANCE_STATS_UPDATE_INTERVAL_MS,
  PINK_HOLD_CENTER_TYPE,
  PINK_HOLD_END_TYPE,
  PREVIEW_CONNECTOR_TILT_ACTIVE_EASE_SPEED,
  PREVIEW_CONNECTOR_TILT_DIVISOR,
  PREVIEW_CONNECTOR_TILT_RETURN_EASE_SPEED,
  SIDE_PANEL_TRANSITION_MS,
  SNAP_EPSILON,
  X_POSITION_COUNT,
  getCurveEasingId,
} from './editor/editorViewConstants';
import type {
  ActiveLeftPanel,
  CopiedNote,
  CurveEasingFamily,
  CurveEasingId,
  CurveEasingType,
  CurveIdSelectTarget,
  EditorProps,
  EditorRuntimeState,
  HitSoundEvent,
  HoverPreview,
  PendingDragUpdate,
  PreviewCameraTiltInterval,
  PreviewCameraTiltSegment,
  PreviewHitFxEvent,
  PreviewHoldConnectorSegment,
  PreviewNoteRenderEntry,
  PreviewNoteSpeed,
  SpeedDistancePoint,
} from './editor/editorLocalTypes';
import { getTierBadge } from './editor/editorMetadata';
import { getBeatAtTimepos, getBeatsPerMeasureAtBeat, getCurveSnapBeatsBetween, getIndicatorKeyAtBeat, snapBeatToMeasureDivision } from './editor/editorTiming';
import {
  buildPreviewCameraMovementIntervals,
  buildPreviewCameraTiltIntervals,
  buildSpeedDistanceIndex,
  comparePreviewNoteRenderEntries,
  findFirstPreviewJudgementNoteIndex,
  getPreviewCameraTiltState,
  getPreviewCameraXPositionOffset,
  getPreviewComboAtTime,
  getPreviewConnectorSegmentsInDistanceRange,
  getPreviewNoteEntriesInDistanceRange,
  getPreviewNoteEntriesInViewport,
  getPreviewNoteVisualDistance,
  getPreviewAppearModePosition,
  getSpeedDistanceAtTimepos,
  parsePreviewNoteSpeed,
} from './editor/previewPlayback';
import { SOUND_URLS, getHitSoundVolume, musicAudioGraphs, type MusicAudioGraph } from './editor/editorAudioAssets';
import { formatByteSize } from './editor/editorFileHelpers';
import { getMirroredNoteLane } from './editor/editorNoteTransforms';
import { buildChartProjectFiles, type ChartProjectFileDetails, type ChartProjectFileEntry } from './editor/chartProjectFiles';
import { calculateChartProjectFileDetailsInWorker } from './utils/chartProjectFilesWorkerClient';
import { buildChartStatisticsIndex, calculateChartStatistics, EMPTY_CHART_STATISTICS_INDEX, type ChartStatisticsIndex } from './editor/chartStatistics';
import { PREVIEW_NOTE_ARROW_URLS, PREVIEW_NOTE_TEXTURE_URLS } from './editor/previewNoteSprites';
import {
  METADATA_REQUIRED_FIELDS,
  getInvalidMetadataFields,
  hasInvalidMetadataFields,
  isValidDifficulty,
  isValidSongId,
  isValidSongBpm,
  type MetadataField,
  type MetadataTouchedFields,
} from './editor/metadataValidation';
import {
  DR3FP_PREVIEW_RECEIVER_ORIGIN,
  DR3FP_PREVIEW_RECEIVER_POLL_MS,
  DR3FP_PREVIEW_RECEIVER_TIMEOUT_MS,
  PREVIEW_3D_CAMERA_BASE_Z,
  PREVIEW_3D_CAMERA_EASE_PER_SECOND,
  PREVIEW_3D_CAMERA_Y_OFFSET_PER_HEIGHT,
  PREVIEW_3D_CAMERA_Z_PER_HEIGHT,
  PREVIEW_3D_CONNECTOR_CLIP_PADDING,
  PREVIEW_3D_CONNECTOR_MAX_SEGMENT_HEIGHT,
  PREVIEW_3D_FAR_DISTANCE_MULTIPLIER,
  PREVIEW_3D_HORIZON_VIEWPORT_MULTIPLIER,
  PREVIEW_3D_MAX_GRID_WIDTH_RATIO,
  PREVIEW_3D_NEAR_SPEED_MULTIPLIER,
} from './editor/preview3DConstants';
import {
  DR3FP_PREVIEW_STATUS,
  Dr3FpPreviewError,
  createDr3FpPreviewFailureStatus,
  type Dr3FpPreviewLogEntry,
  type Dr3FpPreviewStatus,
} from './editor/dr3FpPreviewStatus';
import {
  TUTORIAL_STEP_8_END_TIMEPOS,
  TUTORIAL_STEP_8_NOTES,
  createTutorialSession,
  isTutorialOperationAllowed,
  type TutorialOperation,
  type TutorialObjective,
} from './editor/tutorial';
import { formatTranslation, translations, type LanguageCode } from './lang';

type ExportRunResult = 'complete' | 'cancelled' | 'failed';

const convertNonOggAudioFileForProject = async (file: File) => (
  isOggAudioFile(file) ? file : convertAudioFileToOgg(file)
);

const getOffsetInSeconds = (offset: string | number) => {
  const parsedOffset = parseFloat(offset.toString());
  return Number.isFinite(parsedOffset) ? parsedOffset / 1000 : 0;
};

const getValidAudioDuration = (duration: number) => (
  Number.isFinite(duration) && duration > 0 ? duration : 0
);

const getFrameRateStableEase = (speedPerSecond: number, elapsedMs: number) => {
  const elapsedSeconds = Math.max(0, elapsedMs) / 1000;
  if (elapsedSeconds <= 0 || speedPerSecond <= 0) {
    return 0;
  }

  return Math.min(1, 1 - Math.exp(-speedPerSecond * elapsedSeconds));
};

const clampNoteLaneToBounds = (lane: number, width: number) => {
  const normalizedWidth = Number.isFinite(width) ? Math.max(0, width) : 0;
  const maximumLane = Math.max(0, X_POSITION_COUNT - normalizedWidth);
  return Math.max(0, Math.min(maximumLane, lane));
};

const getPreviewNoteSpeedSource = (
  note: Note,
  isOfficialChartFormat: boolean,
  isPreviewNoteSpeedChangesEnabled: boolean,
  isPreviewNoteAppearModeEnabled: boolean,
) => {
  if (!isPreviewNoteSpeedChangesEnabled) {
    return undefined;
  }

  if (isOfficialChartFormat && isOfficialNoteSpeedLockedType(note.type)) {
    return undefined;
  }

  return isPreviewNoteAppearModeEnabled && note.appearMode === 'P'
    ? APPEAR_MODE_P_NSC
    : note.speed;
};

const getPreviewConnectorParentSpeedSource = (
  note: Note,
  isOfficialChartFormat: boolean,
  isPreviewNoteSpeedChangesEnabled: boolean,
  isPreviewNoteAppearModeEnabled: boolean,
) => (
  isOfficialChartFormat
    ? undefined
    : getPreviewNoteSpeedSource(
        note,
        isOfficialChartFormat,
        isPreviewNoteSpeedChangesEnabled,
        isPreviewNoteAppearModeEnabled,
      )
);
const text = translations;
const EDITOR_NOTE_JUDGEMENT_OVERLAY_DURATION_SECONDS = 0.25;
const EDITOR_NOTE_JUDGEMENT_OVERLAY_MAX_ALPHA = 0.75;
const PREVIEW_HIT_FX_DURATION_SECONDS = 0.36;
const PREVIEW_HIT_FX_REFERENCE_WIDTH = 2;
const PREVIEW_HIT_FX_FRAME_COUNT = 12;
const PREVIEW_HIT_FX_CACHE_MAX_ENTRIES = 192;
const PREVIEW_HIT_FX_GOLD = '#ffd45a';
const PREVIEW_HIT_FX_WHITE = '#ffffff';

const createDr3FpPreviewLogEntry = (message: string, detail?: string): Dr3FpPreviewLogEntry => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  time: new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }),
  message,
  detail,
});

const getRequiredMetadataTouchedFields = () => Object.fromEntries(
  METADATA_REQUIRED_FIELDS.map(field => [field, true]),
) as MetadataTouchedFields;

interface PreviewModePrecomputeCache {
  notes: Note[];
  speedChanges: SpeedChange[];
  bpmChanges: BpmChange[];
  playbackSpeedDistanceIndex: SpeedDistancePoint[];
  cameraTiltSegments: PreviewCameraTiltSegment[];
  chartStatisticsIndex: ChartStatisticsIndex;
  cameraTiltIntervals: PreviewCameraTiltInterval[];
}

interface PreviewCanvasCacheKey {
  notes: Note[];
  bpmChanges: BpmChange[];
  speedChanges: SpeedChange[];
  previewSpeedChanges: SpeedChange[];
  isPreviewNoteSpeedChangesEnabled: boolean;
  isPreviewNoteAppearModeEnabled: boolean;
  usesOfficialPreviewRules: boolean;
}

interface BeatIndexedEntry<T> {
  beat: number;
  change: T;
}

interface PreviewCachedNoteSprite {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

interface PreviewCachedHitFxFrame {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

type PreviewCanvasLoadPhase = 'idle' | 'visible' | 'full';

const PREVIEW_INITIAL_CANVAS_SECONDS_BEHIND = 12;
const PREVIEW_INITIAL_CANVAS_SECONDS_AHEAD = 30;
const PREVIEW_NOTE_TEXTURE_HEIGHT_SCALE = 0.3;
const PREVIEW_NOTE_TEXTURE_EDGE_CAP_WIDTH = 24;
const PREVIEW_NOTE_TEXTURE_EDGE_CAP_SCALE = 0.55;
const PREVIEW_NOTE_TEXTURE_SECTION_OVERLAP = 1;
const PREVIEW_NOTE_TEXTURE_WIDTH_BUCKET_SIZE = 1;
const PREVIEW_NOTE_TEXTURE_CACHE_MAX_ENTRIES = 512;
const PREVIEW_NOTE_ARROW_Y_OFFSET = -16;
const HOLD_CONNECTOR_VERTICAL_OUTLINE_WIDTH = 5;
const HOLD_CONNECTOR_VERTICAL_OUTLINE_ALPHA = 0.8;
const NATIVE_HOLD_CONNECTOR_ALPHA = 0.36;
const EDITOR_STYLE_HOLD_CONNECTOR_EXTRA_INSET_PIXELS = 3;
const HOLD_CONNECTOR_TYPE_SET = new Set(HOLD_CONNECTOR_TYPES);
const HOLD_START_TYPE_SET = new Set(HOLD_START_TYPES);
const HOLD_CENTER_TYPE_SET = new Set(HOLD_CENTER_TYPES);
const HOLD_END_TYPE_SET = new Set(HOLD_END_TYPES);
const EDITOR_HOLD_CENTER_NOTE_HEIGHT_SCALE = 0.72;
const PREVIEW_NOTE_TEXTURE_OMITTED_TYPES = new Set(HOLD_CENTER_TYPES);
PREVIEW_NOTE_TEXTURE_OMITTED_TYPES.delete(17);
const PREVIEW_CONSTANT_SPEED_CHANGES: SpeedChange[] = [{ timepos: 0, speedChange: 1 }];
const PREVIEW_DAMAGE_NOTE_TYPES = new Set([10, 17, 18]);
const PREVIEW_PINK_HOLD_CONNECTOR_TYPES = new Set([23, 24]);
const CAMERA_ROTATION_TOOL_DAMAGE_HOLD_TYPE = 17;
const CAMERA_ROTATION_TOOL_NOTE_WIDTH = 1;
const CAMERA_ROTATION_TOOL_TARGET_EPSILON = 0.0005;
const CAMERA_ROTATION_TOOL_FORBIDDEN_LANE_MIN = -16;
const CAMERA_ROTATION_TOOL_FORBIDDEN_LANE_MAX = 32;
const CAMERA_ROTATION_TOOL_FAR_LANE_MAGNITUDE = 240;
const CAMERA_ROTATION_TOOL_MAX_CORRECTION_LANE_MAGNITUDE = 1200;
const CAMERA_ROTATION_TOOL_MAX_CORRECTION_CONNECTORS = 24;
const CAMERA_ROTATION_TOOL_CHART_PRECISION = 3;
const CAMERA_ROTATION_TOOL_CHAIN_LANE_EPSILON = 10 ** -CAMERA_ROTATION_TOOL_CHART_PRECISION * 2;
const CAMERA_ROTATION_TOOL_HALF_TURN_DEGREES = 180;
const CAMERA_ROTATION_TOOL_HALF_TURN_MARGIN_DEGREES = 0.01;
const roundCameraRotationToolChartValue = (value: number) => {
  const roundedValue = Number(value.toFixed(CAMERA_ROTATION_TOOL_CHART_PRECISION));
  return Object.is(roundedValue, -0) ? 0 : roundedValue;
};
const getCameraRotationToolHalfTurnCenter = (angle: number) => (
  CAMERA_ROTATION_TOOL_HALF_TURN_DEGREES
  + 360 * Math.round((angle - CAMERA_ROTATION_TOOL_HALF_TURN_DEGREES) / 360)
);
const isCameraRotationToolHalfTurnAngle = (angle: number) => (
  Math.abs(angle - getCameraRotationToolHalfTurnCenter(angle)) <= CAMERA_ROTATION_TOOL_TARGET_EPSILON
);
const doesCameraRotationToolAnglePreferUpperHalfTurnMargin = (angle: number, halfTurnCenter: number) => (
  angle > halfTurnCenter
);
const stabilizeCameraRotationToolTargetAngle = (angle: number, preferUpperHalfTurnMargin = false) => {
  if (!isCameraRotationToolHalfTurnAngle(angle)) {
    return angle;
  }

  // Exact odd half-turns are the only unstable points. Keep authored multi-turn values
  // unwrapped, and nudge the target to the side implied by neighboring keyframes.
  const halfTurnCenter = getCameraRotationToolHalfTurnCenter(angle);
  return preferUpperHalfTurnMargin
    ? halfTurnCenter + CAMERA_ROTATION_TOOL_HALF_TURN_MARGIN_DEGREES
    : halfTurnCenter - CAMERA_ROTATION_TOOL_HALF_TURN_MARGIN_DEGREES;
};
const NATIVE_HOLD_CONNECTOR_SPRITE_COLORS: Record<number, { body: string; outline: string }> = {
  3: { body: '#623700', outline: '#fe8f00' },
  4: { body: '#623700', outline: '#fe8f00' },
  5: { body: '#004062', outline: '#00a7fe' },
  6: { body: '#004062', outline: '#00a7fe' },
  7: { body: '#004062', outline: '#00a7fe' },
  8: { body: '#636363', outline: '#ffffff' },
  10: { body: '#620000', outline: '#fe0000' },
  11: { body: '#623700', outline: '#fe8f00' },
  17: { body: '#620000', outline: '#fe0000' },
  18: { body: '#620000', outline: '#fe0000' },
  19: { body: '#356200', outline: '#89fe00' },
  20: { body: '#356200', outline: '#89fe00' },
  21: { body: '#5e6200', outline: '#f5fe00' },
  22: { body: '#5e6200', outline: '#f5fe00' },
  23: { body: '#ff8080', outline: '#ffc0c0' },
  24: { body: '#ff8080', outline: '#ffc0c0' },
};
const getNativeHoldConnectorSpriteColors = (connectorType: number) => (
  NATIVE_HOLD_CONNECTOR_SPRITE_COLORS[connectorType]
  || { body: '#636363', outline: '#ffffff' }
);
const isArrowFlickType = (type: number) => type >= 13 && type <= 16;
const EDITOR_NUMBERED_NOTE_LABELS: Record<number, string> = {
  25: '2',
  26: '3',
  27: '4',
};
const getEditorNumberedNoteLabel = (type: number) => EDITOR_NUMBERED_NOTE_LABELS[type];

const findFirstBeatIndexedEntry = <T,>(entries: BeatIndexedEntry<T>[], beat: number) => {
  let low = 0;
  let high = entries.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (entries[mid].beat < beat) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
};

const getBeatIndexedEntriesInRange = <T,>(
  entries: BeatIndexedEntry<T>[],
  startBeat: number,
  endBeat: number,
) => {
  const matchingEntries: BeatIndexedEntry<T>[] = [];
  const firstEntryIndex = findFirstBeatIndexedEntry(entries, startBeat);

  for (let index = firstEntryIndex; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.beat > endBeat) {
      break;
    }

    matchingEntries.push(entry);
  }

  return matchingEntries;
};

export default function Editor({ 
  onBack, 
  mode,
  isTutorial = false,
  initialProjectData = null,
  initialChartFileName = null,
  notes,
  setNotes,
  bpmChanges,
  setBpmChanges,
  speedChanges,
  setSpeedChanges,
  offset,
  setOffset,
  onImportLoadStatusChange,
}: EditorProps) {
  const initialEditorSettings = useMemo(loadEditorSettings, []);
  const [tutorialSession, setTutorialSession] = useState(() => (
    isTutorial ? createTutorialSession() : null
  ));
  const shouldExitTutorialAfterCompletionRef = useRef(false);
  const canUseTutorialOperation = useCallback((operation: TutorialOperation) => (
    isTutorialOperationAllowed(tutorialSession, operation)
  ), [tutorialSession]);
  const completeCurrentTutorialObjective = useCallback((objectiveId: TutorialObjective) => {
    setTutorialSession(current => {
      const currentStep = current?.steps[current.currentStepIndex];
      if (!current || currentStep?.objectiveId !== objectiveId) {
        return current;
      }

      if (current.currentStepIndex >= current.steps.length - 1) {
        shouldExitTutorialAfterCompletionRef.current = true;
        return null;
      }

      return {
        ...current,
        currentStepIndex: current.currentStepIndex + 1,
      };
    });
  }, []);
  useEffect(() => {
    if (!tutorialSession && shouldExitTutorialAfterCompletionRef.current) {
      shouldExitTutorialAfterCompletionRef.current = false;
      onBack();
    }
  }, [onBack, tutorialSession]);
  const isCurrentTutorialObjective = useCallback((objectiveId: TutorialObjective) => {
    const currentStep = tutorialSession?.steps[tutorialSession.currentStepIndex];
    return currentStep?.objectiveId === objectiveId;
  }, [tutorialSession]);
  const getAllowedSelectedNoteTypes = useCallback(() => (
    isCurrentTutorialObjective('holdSequencePlaced') ? [5, 6, 7] : AVAILABLE_NOTE_TYPES
  ), [isCurrentTutorialObjective]);
  const [isModalOpen, setIsModalOpen] = useState(mode === 'new');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isProjectAudioConverting, setIsProjectAudioConverting] = useState(false);
  const [isAudioOffsetNoticeOpen, setIsAudioOffsetNoticeOpen] = useState(Boolean(initialProjectData?.audioConvertedToOgg));
  const [isDr3FpPreviewInfoOpen, setIsDr3FpPreviewInfoOpen] = useState(false);
  const [dr3FpPreviewStatus, setDr3FpPreviewStatus] = useState<Dr3FpPreviewStatus>(DR3FP_PREVIEW_STATUS.idle);
  const [dr3FpPreviewLogs, setDr3FpPreviewLogs] = useState<Dr3FpPreviewLogEntry[]>([]);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isPlaybackSpeedMenuOpen, setIsPlaybackSpeedMenuOpen] = useState(false);
  const [isPreviewMenuOpen, setIsPreviewMenuOpen] = useState(false);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [isStatisticsRefreshRateMenuOpen, setIsStatisticsRefreshRateMenuOpen] = useState(false);
  const [isSelectionTypeMenuOpen, setIsSelectionTypeMenuOpen] = useState(false);
  const [isExitWarningOpen, setIsExitWarningOpen] = useState(false);
  const [isExitWarningEnabled, setIsExitWarningEnabled] = useState(initialEditorSettings.isExitWarningEnabled);
  const [isBackdropBlurDisabled, setIsBackdropBlurDisabled] = useState(initialEditorSettings.isBackdropBlurDisabled);
  const [isAnimationDisabled, setIsAnimationDisabled] = useState(initialEditorSettings.isAnimationDisabled);
  const [isScrollDirectionInverted, setIsScrollDirectionInverted] = useState(initialEditorSettings.isScrollDirectionInverted);
  const [areTimingChangeIndicatorsAdjusted, setAreTimingChangeIndicatorsAdjusted] = useState(initialEditorSettings.areTimingChangeIndicatorsAdjusted);
  const [isEditorJudgementGlowEnabled, setIsEditorJudgementGlowEnabled] = useState(initialEditorSettings.isEditorJudgementGlowEnabled);
  const [isVSyncEnabled, setIsVSyncEnabled] = useState(initialEditorSettings.isVSyncEnabled);
  const [isDr3FpPreviewEnabled, setIsDr3FpPreviewEnabled] = useState(initialEditorSettings.isDr3FpPreviewEnabled);
  const [language, setLanguage] = useState<LanguageCode>(initialEditorSettings.language);
  const [selectionType, setSelectionType] = useState<SelectionType>(initialEditorSettings.selectionType);
  const [statisticsRefreshRate, setStatisticsRefreshRate] = useState<StatisticsRefreshRate>(initialEditorSettings.statisticsRefreshRate);
  const [musicVolume, setMusicVolume] = useState(initialEditorSettings.musicVolume);
  const [tapSoundVolume, setTapSoundVolume] = useState(initialEditorSettings.tapSoundVolume);
  const [flickSoundVolume, setFlickSoundVolume] = useState(initialEditorSettings.flickSoundVolume);
  const enabledHitSoundUrls = useMemo(
    () => Object.values(SOUND_URLS).filter(soundUrl => (
      getHitSoundVolume(soundUrl, tapSoundVolume, flickSoundVolume) > 0
    )),
    [flickSoundVolume, tapSoundVolume],
  );
  const addDr3FpPreviewLog = useCallback((message: string, detail?: string) => {
    setDr3FpPreviewLogs(currentLogs => [
      ...currentLogs,
      createDr3FpPreviewLogEntry(message, detail),
    ]);
  }, []);
  const [gridZoom, setGridZoom] = useState(initialEditorSettings.gridZoom);
  const [isXPositionGridEnabled, setIsXPositionGridEnabled] = useState(initialEditorSettings.isXPositionGridEnabled);
  const [isOutOfBoundsPlacementEnabled, setIsOutOfBoundsPlacementEnabled] = useState(initialEditorSettings.isOutOfBoundsPlacementEnabled);
  const [isPreviewPrecomputeEnabled, setIsPreviewPrecomputeEnabled] = useState(initialEditorSettings.isPreviewPrecomputeEnabled);
  const [pixelsPerBeat, setPixelsPerBeat] = useState(initialEditorSettings.pixelsPerBeat);
  const [isPreviewSpritesEnabled, setIsPreviewSpritesEnabled] = useState(initialEditorSettings.isPreviewSpritesEnabled);
  const [isPreviewHitFxEnabled, setIsPreviewHitFxEnabled] = useState(initialEditorSettings.isPreviewHitFxEnabled);
  const [isPreviewChartSpeedChangesEnabled, setIsPreviewChartSpeedChangesEnabled] = useState(initialEditorSettings.isPreviewChartSpeedChangesEnabled);
  const [isPreviewCameraTiltEnabled, setIsPreviewCameraTiltEnabled] = useState(initialEditorSettings.isPreviewCameraTiltEnabled);
  const [isPreviewCameraMovementEnabled, setIsPreviewCameraMovementEnabled] = useState(initialEditorSettings.isPreviewCameraMovementEnabled);
  const [isPreviewNoteSpeedChangesEnabled, setIsPreviewNoteSpeedChangesEnabled] = useState(initialEditorSettings.isPreviewNoteSpeedChangesEnabled);
  const [isPreviewNoteAppearModeEnabled, setIsPreviewNoteAppearModeEnabled] = useState(initialEditorSettings.isPreviewNoteAppearModeEnabled);
  const [previewDisplayMode, setPreviewDisplayMode] = useState<PreviewDisplayMode>(initialEditorSettings.previewDisplayMode);
  const [preview3DTiltDegrees, setPreview3DTiltDegrees] = useState(initialEditorSettings.preview3DTiltDegrees);
  const [activeLeftPanel, setActiveLeftPanel] = useState<ActiveLeftPanel>('main');
  const [isNscToolOpen, setIsNscToolOpen] = useState(false);
  const [isNoteMultiEditOpen, setIsNoteMultiEditOpen] = useState(false);
  const [isCameraRotationToolOpen, setIsCameraRotationToolOpen] = useState(false);
  const [cameraRotationToolGeneratedNoteIds, setCameraRotationToolGeneratedNoteIds] = useState<number[]>([]);
  const [isOrganizingNotes, setIsOrganizingNotes] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewCanvasLoadPhase, setPreviewCanvasLoadPhase] = useState<PreviewCanvasLoadPhase>('idle');
  const [previewVisibleWindowTime, setPreviewVisibleWindowTime] = useState(0);
  const [isLeftPanelCompact, setIsLeftPanelCompact] = useState(false);
  const [isRightPanelCompact, setIsRightPanelCompact] = useState(false);
  const [isLeftPanelContentVisible, setIsLeftPanelContentVisible] = useState(true);
  const [isRightPanelContentVisible, setIsRightPanelContentVisible] = useState(true);
  const [selectedNoteType, setSelectedNoteType] = useState<number>(1);
  useEffect(() => {
    if (isCurrentTutorialObjective('noteTypeSelected') && selectedNoteType === 5) {
      completeCurrentTutorialObjective('noteTypeSelected');
      return;
    }

    if (isCurrentTutorialObjective('holdSequencePlaced') && ![5, 6, 7].includes(selectedNoteType)) {
      setSelectedNoteType(5);
    }
  }, [completeCurrentTutorialObjective, isCurrentTutorialObjective, selectedNoteType]);
  const [noteWidth, setNoteWidth] = useState(4);
  const [currentParentInput, setCurrentParentInput] = useState('');
  const [curveStartIdInput, setCurveStartIdInput] = useState('');
  const [curveEndIdInput, setCurveEndIdInput] = useState('');
  const [curveNoteType, setCurveNoteType] = useState<number>(1);
  const [curveDensityInput, setCurveDensityInput] = useState('8');
  const [curveEasingFamily, setCurveEasingFamily] = useState<CurveEasingFamily>('linear');
  const [curveEasingType, setCurveEasingType] = useState<CurveEasingType>('in');
  const [curveNotesMessage, setCurveNotesMessage] = useState('');
  const [curveIdSelectTarget, setCurveIdSelectTarget] = useState<CurveIdSelectTarget>(null);
  const [speedCurveStartIdInput, setSpeedCurveStartIdInput] = useState('');
  const [speedCurveEndIdInput, setSpeedCurveEndIdInput] = useState('');
  const [speedCurveDensityInput, setSpeedCurveDensityInput] = useState('8');
  const [speedCurveEasingFamily, setSpeedCurveEasingFamily] = useState<CurveEasingFamily>('linear');
  const [speedCurveEasingType, setSpeedCurveEasingType] = useState<CurveEasingType>('in');
  const [speedCurveMessage, setSpeedCurveMessage] = useState('');
  const [hoverPreview, setHoverPreview] = useState<HoverPreview | null>(null);
  const [copiedNotesPreviewVersion, setCopiedNotesPreviewVersion] = useState(0);
  const [isCtrlHeld, setIsCtrlHeld] = useState(false);
  const [isShiftHeld, setIsShiftHeld] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<number[]>([]);
  const [draggingNoteId, setDraggingNoteId] = useState<number | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [operationHistory, setOperationHistory] = useState<OperationHistoryEntry[]>([]);
  const [chartIssues, setChartIssues] = useState<ChartIssue[]>([]);
  const [previewedProjectFile, setPreviewedProjectFile] = useState<ChartProjectFileEntry | null>(null);
  const [previewedProjectFileUrl, setPreviewedProjectFileUrl] = useState('');
  const [undoneOperationIds, setUndoneOperationIds] = useState<Set<number>>(() => new Set());
  const [redoableOperationIds, setRedoableOperationIds] = useState<number[]>([]);
  const [shouldShowUndoneOperations, setShouldShowUndoneOperations] = useState(true);
  const nextNoteIdRef = useRef<number>(1);
  const nextOperationHistoryIdRef = useRef<number>(1);
  const hasScannedInitialChartIssuesRef = useRef(false);
  const pendingOperationSnapshotIdsRef = useRef<number[]>([]);
  const lastPlayedTimeRef = useRef<number>(0);
  const tutorialHoldSequenceRef = useRef<Note[]>([]);
  const isTutorialPlaybackStepPreparedRef = useRef(false);
  const [formData, setFormData] = useState<EditorFormData>(() => ({
    songId: initialProjectData?.songId ?? '',
    songName: initialProjectData?.songName ?? '',
    songArtist: initialProjectData?.songArtist ?? '',
    songBpm: initialProjectData?.songBpm ?? '',
    difficulty: initialProjectData?.difficulty ?? '',
    songFile: initialProjectData?.songFile ?? null,
    songIllustration: initialProjectData?.songIllustration ?? null,
  }));
  const [metadataTouchedFields, setMetadataTouchedFields] = useState<MetadataTouchedFields>(
    () => (mode === 'import' ? getRequiredMetadataTouchedFields() : {}),
  );
  const [illustrationPreview, setIllustrationPreview] = useState<string | null>(null);

  useEffect(() => {
    if (isLeftPanelCompact) {
      setIsLeftPanelContentVisible(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsLeftPanelContentVisible(true);
    }, SIDE_PANEL_TRANSITION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [isLeftPanelCompact]);

  useEffect(() => {
    if (isRightPanelCompact) {
      setIsRightPanelContentVisible(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsRightPanelContentVisible(true);
    }, SIDE_PANEL_TRANSITION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [isRightPanelCompact]);

  useEffect(() => {
    tutorialHoldSequenceRef.current = [];
    isTutorialPlaybackStepPreparedRef.current = false;
  }, [tutorialSession?.currentStepIndex]);

  const toggleLeftPanelCompact = () => {
    setIsLeftPanelContentVisible(false);
    setIsLeftPanelCompact(current => !current);
  };

  const toggleRightPanelCompact = () => {
    setIsRightPanelContentVisible(false);
    setIsRightPanelCompact(current => !current);
  };

  useEffect(() => {
    saveEditorSettings({
      language,
      isExitWarningEnabled,
      isBackdropBlurDisabled,
      isAnimationDisabled,
      isScrollDirectionInverted,
      areTimingChangeIndicatorsAdjusted,
      isEditorJudgementGlowEnabled,
      isVSyncEnabled,
      isDr3FpPreviewEnabled,
      isAudioConversionEnabled: true,
      selectionType,
      statisticsRefreshRate,
      musicVolume,
      tapSoundVolume,
      flickSoundVolume,
      gridZoom,
      isXPositionGridEnabled,
      isOutOfBoundsPlacementEnabled,
      isPreviewPrecomputeEnabled,
      pixelsPerBeat,
      isPreviewSpritesEnabled,
      isPreviewHitFxEnabled,
      isPreviewChartSpeedChangesEnabled,
      isPreviewCameraTiltEnabled,
      isPreviewCameraMovementEnabled,
      isPreviewNoteSpeedChangesEnabled,
      isPreviewNoteAppearModeEnabled,
      previewDisplayMode,
      preview3DTiltDegrees,
    });
  }, [
    language,
    isExitWarningEnabled,
    isBackdropBlurDisabled,
    isAnimationDisabled,
    isScrollDirectionInverted,
    areTimingChangeIndicatorsAdjusted,
    isEditorJudgementGlowEnabled,
    isVSyncEnabled,
    isDr3FpPreviewEnabled,
    selectionType,
    statisticsRefreshRate,
    musicVolume,
    tapSoundVolume,
    flickSoundVolume,
    gridZoom,
    isXPositionGridEnabled,
    isOutOfBoundsPlacementEnabled,
    isPreviewPrecomputeEnabled,
    pixelsPerBeat,
    isPreviewSpritesEnabled,
    isPreviewHitFxEnabled,
    isPreviewChartSpeedChangesEnabled,
    isPreviewCameraTiltEnabled,
    isPreviewCameraMovementEnabled,
    isPreviewNoteSpeedChangesEnabled,
    isPreviewNoteAppearModeEnabled,
    previewDisplayMode,
    preview3DTiltDegrees,
  ]);

  useEffect(() => {
    if (formData.songIllustration) {
      const url = URL.createObjectURL(formData.songIllustration);
      setIllustrationPreview(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setIllustrationPreview(null);
    }
  }, [formData.songIllustration]);

  const [projectData, setProjectData] = useState<ProjectData | null>(initialProjectData);
  const [chartFileName, setChartFileName] = useState<string | null>(initialChartFileName);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [liveStatsTime, setLiveStatsTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [duration, setDuration] = useState(() => getValidAudioDuration(initialProjectData?.audioDuration ?? 0));
  const [audioTimingCorrection, setAudioTimingCorrection] = useState<AudioTimingCorrection>(DEFAULT_AUDIO_TIMING_CORRECTION);
  const [playbackAudioUrl, setPlaybackAudioUrl] = useState(initialProjectData?.audioUrl ?? '');
  const [fps, setFps] = useState(0);
  const [renderedObjects, setRenderedObjects] = useState(0);
  const [isFpsCounterHovered, setIsFpsCounterHovered] = useState(false);
  const [isPausedTimelineRendering, setIsPausedTimelineRendering] = useState(false);
  const [previewNoteSpriteLoadVersion, setPreviewNoteSpriteLoadVersion] = useState(0);
  const effectiveGridZoom = isPreviewMode ? 0 : gridZoom;
  const offsetInSeconds = getOffsetInSeconds(offset);
  const audioTimelineDuration = duration > 0 ? Math.max(duration, duration + offsetInSeconds) : 0;
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioTimingCorrectionRef = useRef<AudioTimingCorrection>(DEFAULT_AUDIO_TIMING_CORRECTION);
  const musicAudioContextRef = useRef<AudioContext | null>(null);
  const musicSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const hitSoundContextRef = useRef<AudioContext | null>(null);
  const hitSoundBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const hitSoundLoadPromisesRef = useRef<Map<string, Promise<AudioBuffer | null>>>(new Map());
  const activeHitSounds = useRef<Set<AudioBufferSourceNode>>(new Set());
  const hitSoundEventsRef = useRef<HitSoundEvent[]>([]);
  const hitSoundCursorRef = useRef(0);
  const scheduledHitSoundKeysRef = useRef<Set<string>>(new Set());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>();
  const requestSchedulerRef = useRef<'animationFrame' | 'timeout'>();
  const resizeRenderFrameRef = useRef<number>();
  const hitSoundSchedulerIntervalRef = useRef<number>();
  const pausedTimelineRenderTimeoutRef = useRef<number>();
  const pausedTimelineRenderUntilRef = useRef(0);
  const fpsFrameCountRef = useRef(0);
  const fpsWindowStartRef = useRef(performance.now());
  const renderedObjectsRef = useRef(0);
  const renderedObjectsDisplayLastUpdateRef = useRef(0);
  const shouldCountRenderedObjectsRef = useRef(false);
  const liveStatsLastUpdateRef = useRef(0);
  const shouldUpdateLiveStatsRef = useRef(false);
  const timeDisplayRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLInputElement>(null);
  const isDraggingProgress = useRef(false);
  const isProgressBarInteractive = useRef(false);
  const audioSeekRequestIdRef = useRef(0);
  const shouldResumeAfterProgressSeekRef = useRef(false);
  const pendingDragUpdateRef = useRef<PendingDragUpdate | null>(null);
  const dragStartNoteRef = useRef<Note | null>(null);
  const copiedNotesRef = useRef<CopiedNote[]>([]);
  const pasteTargetRef = useRef<HoverPreview | null>(null);
  const dragUpdateFrameRef = useRef<number>();
  const hoverPreviewRef = useRef<HoverPreview | null>(null);
  const playRequestIdRef = useRef(0);

  const scheduleEditorUpdate = useCallback((callback: FrameRequestCallback) => {
    if (isVSyncEnabled) {
      requestSchedulerRef.current = 'animationFrame';
      requestRef.current = window.requestAnimationFrame(callback);
      return;
    }

    requestSchedulerRef.current = 'timeout';
    requestRef.current = window.setTimeout(() => callback(performance.now()), 0);
  }, [isVSyncEnabled]);

  const cancelEditorUpdate = useCallback(() => {
    if (requestRef.current === undefined) {
      return;
    }

    if (requestSchedulerRef.current === 'timeout') {
      window.clearTimeout(requestRef.current);
    } else {
      window.cancelAnimationFrame(requestRef.current);
    }

    requestRef.current = undefined;
    requestSchedulerRef.current = undefined;
  }, []);
  const recordFpsSample = useCallback((now: number) => {
    fpsFrameCountRef.current += 1;
    const elapsed = now - fpsWindowStartRef.current;

    if (elapsed >= PERFORMANCE_STATS_UPDATE_INTERVAL_MS) {
      setFps(Math.round((fpsFrameCountRef.current * 1000) / elapsed));
      fpsFrameCountRef.current = 0;
      fpsWindowStartRef.current = now;
    }
  }, []);
  const playTimeoutRef = useRef<number>();
  const isLoopingPlaybackRef = useRef(false);
  const hiddenPreviewNoteIdsRef = useRef<Set<number>>(new Set());
  const previewHiddenThroughTimeRef = useRef(Number.NEGATIVE_INFINITY);
  const previewHitFxEventsRef = useRef<PreviewHitFxEvent[]>([]);
  const previewComboTimesRef = useRef<number[]>([]);
  const previewModePrecomputeCacheRef = useRef<PreviewModePrecomputeCache | null>(null);
  const previewCanvasCacheKeyRef = useRef<PreviewCanvasCacheKey | null>(null);
  const previewChartStatisticsIndexRef = useRef<ChartStatisticsIndex | null>(null);
  const previewPlaybackSpeedDistanceIndexRef = useRef<SpeedDistancePoint[]>([]);
  const previewCameraTiltSegmentsRef = useRef<PreviewCameraTiltSegment[]>([]);
  const previewCameraTiltIntervalsRef = useRef<PreviewCameraTiltInterval[]>([]);
  const previewJudgementCursorTimeRef = useRef(0);
  const previewCameraRotationRadiansRef = useRef(0);
  const previewTiltTimestampRef = useRef(0);
  const preview3DCameraScaleRef = useRef(1);
  const preview3DCameraYOffsetRef = useRef(0);
  const preview3DCameraTimestampRef = useRef(0);
  const previewNoteTexturesRef = useRef<Map<number, HTMLImageElement>>(new Map());
  const previewNoteArrowsRef = useRef<Map<number, HTMLImageElement>>(new Map());
  const previewSpriteBitmapsRef = useRef<WeakMap<HTMLImageElement, ImageBitmap>>(new WeakMap());
  const decodedPreviewSpritesRef = useRef<WeakSet<HTMLImageElement>>(new WeakSet());
  const previewNoteSpriteCanvasCacheRef = useRef<Map<string, PreviewCachedNoteSprite>>(new Map());
  const previewHitFxCanvasCacheRef = useRef<Map<string, PreviewCachedHitFxFrame>>(new Map());
  const shouldShowChartStatistics = isRightPanelContentVisible && selectedNoteIds.length === 0;

  useEffect(() => {
    const disposers: Array<() => void> = [];
    const loadedBitmaps: ImageBitmap[] = [];
    let isDisposed = false;

    const loadSprite = (
      targetMap: Map<number, HTMLImageElement>,
      type: number,
      url: string,
    ) => {
      const image = new Image();
      let isSettled = false;
      image.decoding = 'async';
      targetMap.set(type, image);

      const handleSettled = () => {
        if (isDisposed) {
          return;
        }

        if (isSettled) {
          return;
        }

        isSettled = true;
        previewNoteSpriteCanvasCacheRef.current.clear();
        setPreviewNoteSpriteLoadVersion(version => version + 1);
      };
      const handleDecoded = async () => {
        decodedPreviewSpritesRef.current.add(image);
        if (typeof createImageBitmap === 'function') {
          try {
            const bitmap = await createImageBitmap(image);
            if (isDisposed) {
              bitmap.close();
              return;
            }
            loadedBitmaps.push(bitmap);
            previewSpriteBitmapsRef.current.set(image, bitmap);
          } catch {
            // Fall back to drawing the decoded HTMLImageElement.
          }
        }
        handleSettled();
      };
      const handleLoad = () => {
        if (typeof image.decode !== 'function') {
          void handleDecoded();
          return;
        }

        image.decode().then(() => {
          void handleDecoded();
        }).catch(() => {
          if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
            decodedPreviewSpritesRef.current.add(image);
          }
          handleSettled();
        });
      };

      image.addEventListener('load', handleLoad);
      image.addEventListener('error', handleSettled);
      disposers.push(() => {
        image.removeEventListener('load', handleLoad);
        image.removeEventListener('error', handleSettled);
      });
      image.src = url;
    };

    previewNoteTexturesRef.current.clear();
    previewNoteArrowsRef.current.clear();
    previewSpriteBitmapsRef.current = new WeakMap();
    decodedPreviewSpritesRef.current = new WeakSet();
    previewNoteSpriteCanvasCacheRef.current.clear();

    Object.entries(PREVIEW_NOTE_TEXTURE_URLS).forEach(([type, url]) => {
      loadSprite(previewNoteTexturesRef.current, Number(type), url);
    });
    Object.entries(PREVIEW_NOTE_ARROW_URLS).forEach(([type, url]) => {
      loadSprite(previewNoteArrowsRef.current, Number(type), url);
    });

    return () => {
      isDisposed = true;
      disposers.forEach(dispose => dispose());
      previewNoteTexturesRef.current.clear();
      previewNoteArrowsRef.current.clear();
      loadedBitmaps.forEach(bitmap => bitmap.close());
      previewSpriteBitmapsRef.current = new WeakMap();
      decodedPreviewSpritesRef.current = new WeakSet();
      previewNoteSpriteCanvasCacheRef.current.clear();
      previewHitFxCanvasCacheRef.current.clear();
    };
  }, []);

  const resetPreviewJudgementState = useCallback((time = stateRef.current.currentTime, hidePastNotes = false) => {
    hiddenPreviewNoteIdsRef.current.clear();
    previewHitFxEventsRef.current = [];
    previewHiddenThroughTimeRef.current = hidePastNotes ? time : Number.NEGATIVE_INFINITY;
    previewJudgementCursorTimeRef.current = time;
  }, []);

  useEffect(() => {
    if (!isPreviewHitFxEnabled) {
      previewHitFxEventsRef.current = [];
    }
  }, [isPreviewHitFxEnabled]);

  const updateProgressBarValue = (time: number, force = false) => {
    if (progressBarRef.current && (force || !isDraggingProgress.current)) {
      progressBarRef.current.value = time.toString();
    }
  };

  const renderPausedTimelineAtFullFps = useCallback(() => {
    pausedTimelineRenderUntilRef.current = performance.now() + PAUSED_TIMELINE_RENDER_DURATION_MS;
    setIsPausedTimelineRendering(true);

    if (pausedTimelineRenderTimeoutRef.current !== undefined) {
      window.clearTimeout(pausedTimelineRenderTimeoutRef.current);
    }

    pausedTimelineRenderTimeoutRef.current = window.setTimeout(() => {
      pausedTimelineRenderTimeoutRef.current = undefined;
      if (performance.now() >= pausedTimelineRenderUntilRef.current) {
        setIsPausedTimelineRendering(false);
      }
    }, PAUSED_TIMELINE_RENDER_DURATION_MS);
  }, []);

  const openSettings = () => {
    if (!canUseTutorialOperation('openSettings')) return;

    setIsHelpOpen(false);
    setIsPlaybackSpeedMenuOpen(false);
    setIsStatisticsRefreshRateMenuOpen(false);
    setIsSelectionTypeMenuOpen(false);
    setIsSettingsOpen(true);
  };

  const openHelp = () => {
    if (!canUseTutorialOperation('openHelp')) return;

    setIsSettingsOpen(false);
    setIsPlaybackSpeedMenuOpen(false);
    setIsStatisticsRefreshRateMenuOpen(false);
    setIsSelectionTypeMenuOpen(false);
    setIsHelpOpen(true);
  };

  const openExitWarning = () => {
    if (!canUseTutorialOperation('exitEditor')) return;

    if (!isExitWarningEnabled) {
      onBack();
      return;
    }

    setIsExitWarningOpen(true);
  };

  useEffect(() => {
    if (!isExitWarningEnabled) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isExitWarningEnabled]);

  const getAudioContextCtor = () => {
    return window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
      null;
  };

  const setupMusicGain = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return null;

    const cachedGraph = musicAudioGraphs.get(audio);
    if (cachedGraph && cachedGraph.context.state !== 'closed') {
      musicAudioContextRef.current = cachedGraph.context;
      musicSourceRef.current = cachedGraph.source;
      musicGainRef.current = cachedGraph.gain;
      audio.volume = 1;
      return cachedGraph.context;
    }

    const AudioContextCtor = getAudioContextCtor();
    if (!AudioContextCtor) return null;

    try {
      const context = new AudioContextCtor({ latencyHint: 'interactive' });
      const source = context.createMediaElementSource(audio);
      const gain = context.createGain();

      source.connect(gain);
      gain.connect(context.destination);

      const graph = { context, source, gain };
      musicAudioGraphs.set(audio, graph);
      musicAudioContextRef.current = context;
      musicSourceRef.current = source;
      musicGainRef.current = gain;
      audio.volume = 1;

      return context;
    } catch (error) {
      console.warn('Failed to initialize music gain control:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    audioTimingCorrectionRef.current = audioTimingCorrection;
  }, [audioTimingCorrection]);

  useEffect(() => {
    audioTimingCorrectionRef.current = DEFAULT_AUDIO_TIMING_CORRECTION;
    setAudioTimingCorrection(DEFAULT_AUDIO_TIMING_CORRECTION);
    setDuration(getValidAudioDuration(projectData?.audioDuration ?? 0));
  }, [playbackAudioUrl, projectData?.audioDuration]);

  useEffect(() => {
    setPlaybackAudioUrl(projectData?.audioUrl ?? '');
  }, [projectData?.audioUrl]);

  const handleAudioLoadedMetadata = useCallback((audio: HTMLAudioElement) => {
    const mediaDuration = getValidAudioDuration(audio.duration);
    const audioFile = projectData?.songFile ?? null;
    const initialCorrection = getInitialAudioTimingCorrection(audioFile);
    audioTimingCorrectionRef.current = initialCorrection;
    setAudioTimingCorrection(initialCorrection);
    setDuration(mediaDuration);
    applyAudioPlaybackSpeed(audio, stateRef.current.playbackSpeed);

    void readAudioTimingCorrection(audioFile, mediaDuration)
      .then((correction) => {
        if (audioRef.current !== audio) {
          return;
        }

        audioTimingCorrectionRef.current = correction;
        setAudioTimingCorrection(correction);
        setDuration(getValidAudioDuration(getCorrectedAudioDuration(mediaDuration, correction)));

        const now = performance.now();
        const playbackTime = stateRef.current.isPlaying
          ? Math.max(
              0,
              stateRef.current.playbackStartTime
                + ((now - stateRef.current.playbackStartPerformanceTime) / 1000)
                  * stateRef.current.playbackSpeed,
            )
          : stateRef.current.currentTime;

        audioSeekRequestIdRef.current += 1;
        audio.currentTime = getMediaTimeFromPlaybackTime(
          playbackTime,
          offsetInSeconds,
          correction,
        );

        if (stateRef.current.isPlaying) {
          stateRef.current.currentTime = playbackTime;
          stateRef.current.playbackStartTime = playbackTime;
          stateRef.current.playbackStartPerformanceTime = now;
          stateRef.current.playbackAudioClockReadyTime = now + AUDIO_CLOCK_HANDOFF_DELAY_MS;
        }
      })
      .catch(() => {
        if (audioRef.current !== audio) {
          return;
        }

        audioTimingCorrectionRef.current = initialCorrection;
        setAudioTimingCorrection(initialCorrection);
        setDuration(mediaDuration);
      });
  }, [offsetInSeconds, projectData?.songFile]);

  const stateRef = useRef<EditorRuntimeState>({
    isPlaying: false,
    currentTime: 0,
    playbackStartTime: 0,
    playbackStartPerformanceTime: 0,
    playbackAudioClockReadyTime: 0,
    playbackSpeed: 1,
    bpm: 120,
    bpmChanges: [{ timepos: 0, bpm: 120, timeSignature: '4/4' }],
    speedChanges: [{ timepos: 0, speedChange: 1 }],
    offset: 0,
    notes: [],
  });

  useEffect(() => {
    const warmWorker = () => warmExportWorker();

    if ('requestIdleCallback' in window) {
      const idleCallbackId = window.requestIdleCallback(warmWorker, { timeout: 1000 });
      return () => window.cancelIdleCallback(idleCallbackId);
    }

    const timeoutId = window.setTimeout(warmWorker, 250);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const musicContext = setupMusicGain();
    if (musicGainRef.current) {
      musicGainRef.current.gain.value = musicVolume;
    } else if (!musicContext && audioRef.current) {
      audioRef.current.volume = musicVolume;
    }
  }, [musicVolume, playbackAudioUrl, setupMusicGain]);

  useEffect(() => {
    stateRef.current.isPlaying = isPlaying;
    if (!isPlaying) {
      stateRef.current.currentTime = currentTime;
    }
    stateRef.current.bpm = projectData?.bpm || 120;
    stateRef.current.bpmChanges = bpmChanges;
    stateRef.current.offset = offset;
    stateRef.current.notes = notes;
    stateRef.current.speedChanges = speedChanges;
    stateRef.current.playbackSpeed = playbackSpeed;
  }, [isPlaying, currentTime, projectData, bpmChanges, offset, notes, speedChanges, playbackSpeed]);

  useEffect(() => {
    if (!isPlaying && shouldShowChartStatistics) {
      setLiveStatsTime(currentTime);
    }
  }, [currentTime, isPlaying, shouldShowChartStatistics]);

  useEffect(() => {
    shouldCountRenderedObjectsRef.current = isFpsCounterHovered;

    if (!isFpsCounterHovered) {
      setRenderedObjects(0);
      renderedObjectsRef.current = 0;
    }
  }, [isFpsCounterHovered]);

  useEffect(() => {
    shouldUpdateLiveStatsRef.current = shouldShowChartStatistics;

    if (shouldShowChartStatistics) {
      liveStatsLastUpdateRef.current = 0;
      setLiveStatsTime(stateRef.current.currentTime);
    }
  }, [shouldShowChartStatistics]);

  const statisticsRefreshIntervalMs = useMemo(
    () => getStatisticsRefreshIntervalMs(statisticsRefreshRate),
    [statisticsRefreshRate],
  );

  useEffect(() => {
    if (draggingNoteId || selectionBox) {
      setHoverPreview(null);
    }
  }, [draggingNoteId, selectionBox]);

  useEffect(() => {
    hoverPreviewRef.current = hoverPreview;
  }, [hoverPreview]);

  useEffect(() => {
    if (isCtrlHeld || isShiftHeld) {
      setHoverPreview(null);
    }
  }, [isCtrlHeld, isShiftHeld]);

  useEffect(() => {
    if (!curveIdSelectTarget) {
      return;
    }

    setHoverPreview(null);
    setDraggingNoteId(null);
    setSelectionBox(null);
    pasteTargetRef.current = null;
    pendingDragUpdateRef.current = null;
    dragStartNoteRef.current = null;

    if (dragUpdateFrameRef.current) {
      cancelAnimationFrame(dragUpdateFrameRef.current);
      dragUpdateFrameRef.current = undefined;
    }
  }, [curveIdSelectTarget]);

  useEffect(() => {
    if (mode === 'new') {
      setIsModalOpen(true);
      return;
    }

    if (mode === 'import') {
      setMetadataTouchedFields(getRequiredMetadataTouchedFields());
    }
  }, [mode]);

  useEffect(() => {
    if (notes.length === 0) {
      nextNoteIdRef.current = 1;
      return;
    }

    if (notes.length < nextNoteIdRef.current) {
      return;
    }

    const maxNoteId = notes.reduce((maxId, note) => Math.max(maxId, note.id), 0);
    nextNoteIdRef.current = Math.max(nextNoteIdRef.current, maxNoteId + 1);
  }, [notes]);

  const timedBpmChanges = useMemo(() => convertBpmChangesToTime(bpmChanges), [bpmChanges]);
  const isOfficialChartFormat = (projectData?.chartFormat ?? 'Official') === 'Official';
  const usesOfficialPreviewRules = isOfficialChartFormat;
  const hasValidProjectSongId = Boolean(projectData && isValidSongId(projectData.songId));
  const hasExportIncompatibleTimeSignature = useMemo(
    () => !isOfficialChartFormat && bpmChanges.some(change => change.timeSignature.trim() !== '4/4'),
    [bpmChanges, isOfficialChartFormat],
  );
  const hasRequiredExportMetadata = Boolean(
    hasValidProjectSongId &&
    projectData && isValidDifficulty(projectData.difficulty),
  );
  const hasExportAudioFile = Boolean(projectData?.songFile);
  const hasUnsupportedFormattedExportNoteTypes = notes.some(note => note.type === 25 || note.type === 26 || note.type === 27);
  const isExportDisabled = !hasRequiredExportMetadata;
  const selectedNoteIdSet = useMemo(() => new Set(selectedNoteIds), [selectedNoteIds]);
  const invalidMetadataFields = useMemo(() => getInvalidMetadataFields(formData), [formData]);
  const visibleInvalidMetadataFields = useMemo(
    () => METADATA_REQUIRED_FIELDS.reduce((fields, field) => ({
      ...fields,
      [field]: Boolean(metadataTouchedFields[field] && invalidMetadataFields[field]),
    }), {} as Record<MetadataField, boolean>),
    [invalidMetadataFields, metadataTouchedFields],
  );

  const cloneEditorSnapshot = useCallback((): OperationHistorySnapshot => ({
    projectData: projectData ? { ...projectData } : null,
    notes: stateRef.current.notes,
    bpmChanges: stateRef.current.bpmChanges,
    speedChanges: stateRef.current.speedChanges,
    offset: stateRef.current.offset,
  }), [projectData]);

  useEffect(() => {
    const pendingIds = pendingOperationSnapshotIdsRef.current;
    if (pendingIds.length === 0) {
      return;
    }

    pendingOperationSnapshotIdsRef.current = [];
    const pendingIdSet = new Set(pendingIds);
    const after = cloneEditorSnapshot();
    setOperationHistory(prev => prev.map(entry => (
      pendingIdSet.has(entry.id)
        ? { ...entry, after }
        : entry
    )));
  }, [cloneEditorSnapshot, projectData, notes, bpmChanges, speedChanges, offset]);

  const recordOperation = useCallback((entry: Omit<OperationHistoryEntry, 'id' | 'timestamp' | 'before' | 'after'>) => {
    const before = cloneEditorSnapshot();
    const nextEntry: OperationHistoryEntry = {
      ...entry,
      id: nextOperationHistoryIdRef.current++,
      timestamp: Date.now(),
      before,
      after: before,
    };

    pendingOperationSnapshotIdsRef.current.push(nextEntry.id);
    setOperationHistory(prev => (
      [nextEntry, ...prev].slice(0, MAX_OPERATION_HISTORY_ENTRIES)
    ));
    setRedoableOperationIds([]);
  }, [cloneEditorSnapshot]);

  const getNoteHistoryDetail = useCallback((note: Note) => {
    return `${formatNoteName(note)} #${note.id} at ${formatTime(note.time, timedBpmChanges)}, xpos ${formatNoteLane(note.lane)}, width ${formatHistoryNumber(note.width)}`;
  }, [timedBpmChanges]);

  const getTimeposFromTime = useCallback((time: number) => {
    const totalBeats = getBeatAtTime(time, timedBpmChanges);
    let currentMeasureBeat = 0;
    let measureCount = 0;
    let currentBeatsPerMeasure = 4;

    while (measureCount < 10000) {
      const timeAtMeasure = getTimeAtBeat(currentMeasureBeat, timedBpmChanges);
      const activeChange = getActiveChange(timeAtMeasure + 0.001, timedBpmChanges);
      currentBeatsPerMeasure = parseInt(activeChange.timeSignature.split('/')[0], 10) || 4;

      if (totalBeats < currentMeasureBeat + currentBeatsPerMeasure) {
        break;
      }

      currentMeasureBeat += currentBeatsPerMeasure;
      measureCount++;
    }

    const beatInMeasure = totalBeats - currentMeasureBeat;
    return measureCount + beatInMeasure / currentBeatsPerMeasure;
  }, [timedBpmChanges]);

  const getTimeFromTimepos = useCallback((timepos: number) => {
    const measureCount = Math.max(0, Math.floor(timepos));
    const measureDecimal = Math.max(0, timepos - measureCount);
    let currentMeasureBeat = 0;
    let currentBeatsPerMeasure = 4;

    for (let measure = 0; measure <= measureCount; measure++) {
      const timeAtMeasure = getTimeAtBeat(currentMeasureBeat, timedBpmChanges);
      const activeChange = getActiveChange(timeAtMeasure + 0.001, timedBpmChanges);
      currentBeatsPerMeasure = parseInt(activeChange.timeSignature.split('/')[0], 10) || 4;

      if (measure < measureCount) {
        currentMeasureBeat += currentBeatsPerMeasure;
      }
    }

    return getTimeAtBeat(currentMeasureBeat + measureDecimal * currentBeatsPerMeasure, timedBpmChanges);
  }, [timedBpmChanges]);

  const lastNoteTime = useMemo(() => (
    notes.reduce((maxTime, note) => Math.max(maxTime, note.time), 0)
  ), [notes]);
  const audioTimelineMeasures = useMemo(() => (
    Math.max(0, Math.ceil(getTimeposFromTime(audioTimelineDuration) - SNAP_EPSILON))
  ), [getTimeposFromTime, audioTimelineDuration]);
  const audioRoundedTimelineDuration = useMemo(() => (
    audioTimelineMeasures > 0 ? getTimeFromTimepos(audioTimelineMeasures) : 0
  ), [audioTimelineMeasures, getTimeFromTimepos]);
  const totalTimelineMeasures = useMemo(() => {
    if (lastNoteTime <= audioRoundedTimelineDuration + SNAP_EPSILON) {
      return audioTimelineMeasures;
    }

    return Math.max(
      audioTimelineMeasures,
      Math.ceil(getTimeposFromTime(lastNoteTime) - SNAP_EPSILON),
    );
  }, [audioRoundedTimelineDuration, audioTimelineMeasures, getTimeposFromTime, lastNoteTime]);
  const timelineDuration = useMemo(() => (
    totalTimelineMeasures > 0 ? getTimeFromTimepos(totalTimelineMeasures) : 0
  ), [getTimeFromTimepos, totalTimelineMeasures]);
  const formatTimelineMeasureProgress = useCallback((time: number) => {
    if (totalTimelineMeasures <= 0) {
      return '0/0';
    }

    const clampedTime = Math.max(0, Math.min(time, timelineDuration));
    const currentMeasure = Math.min(
      totalTimelineMeasures,
      Math.max(0, Math.floor(getTimeposFromTime(clampedTime) + SNAP_EPSILON)),
    );

    return `${currentMeasure}/${totalTimelineMeasures}`;
  }, [getTimeposFromTime, timelineDuration, totalTimelineMeasures]);

  useEffect(() => {
    const isTutorialPlaybackSetupStep = (
      isCurrentTutorialObjective('playbackMeasure2Completed')
      || isCurrentTutorialObjective('previewPlaybackMeasure2Completed')
    );
    if (!isTutorialPlaybackSetupStep || isTutorialPlaybackStepPreparedRef.current) {
      return;
    }

    isTutorialPlaybackStepPreparedRef.current = true;
    const tutorialNotes: Note[] = TUTORIAL_STEP_8_NOTES.map(note => ({
      id: note.id,
      type: note.type,
      time: getTimeFromTimepos(note.timepos),
      lane: note.lane,
      width: note.width,
      parentId: note.parentId,
    }));

    if (stateRef.current.isPlaying) {
      playRequestIdRef.current += 1;
      audioRef.current?.pause();
      stateRef.current.isPlaying = false;
      setIsPlaying(false);
    }
    setIsPreviewMode(false);

    setNotes(tutorialNotes);
    stateRef.current.notes = tutorialNotes;
    nextNoteIdRef.current = Math.max(...tutorialNotes.map(note => note.id), 0) + 1;
    setSelectedNoteIds([]);
    setDraggingNoteId(null);
    setSelectionBox(null);
    setHoverPreview(null);
    pendingDragUpdateRef.current = null;
    dragStartNoteRef.current = null;
    const startTime = 0;
    setCurrentTime(startTime);
    stateRef.current.currentTime = startTime;
    stateRef.current.playbackStartTime = startTime;
    stateRef.current.playbackStartPerformanceTime = performance.now();
    stateRef.current.playbackAudioClockReadyTime = 0;
    lastPlayedTimeRef.current = startTime;
    hitSoundCursorRef.current = 0;
    scheduledHitSoundKeysRef.current.clear();

    if (audioRef.current) {
      audioRef.current.currentTime = getMediaTimeFromPlaybackTime(
        startTime,
        getOffsetInSeconds(offset),
        audioTimingCorrectionRef.current,
      );
    }

    if (timeDisplayRef.current) {
      timeDisplayRef.current.textContent = formatTimelineMeasureProgress(startTime);
    }
    updateProgressBarValue(startTime, true);
    renderPausedTimelineAtFullFps();
  }, [formatTimelineMeasureProgress, getTimeFromTimepos, isCurrentTutorialObjective, offset, renderPausedTimelineAtFullFps, setNotes]);

  const bpmIndicatorEntries = useMemo(
    () => bpmChanges
      .map((change, index) => ({
        beat: getBeatAtTimepos(getBpmChangeTimepos(change), timedBpmChanges),
        change,
        id: index + 1,
      }))
      .sort((a, b) => a.beat - b.beat),
    [bpmChanges, timedBpmChanges],
  );
  const speedIndicatorEntries = useMemo(
    () => speedChanges
      .map((change, index) => ({
        beat: getBeatAtTimepos(change.timepos, timedBpmChanges),
        change,
        id: index + 1,
      }))
      .sort((a, b) => a.beat - b.beat),
    [speedChanges, timedBpmChanges],
  );

  const recheckChartIssues = useCallback(() => {
    setChartIssues(findChartIssues(notes, getTimeposFromTime));
  }, [getTimeposFromTime, notes]);

  useEffect(() => {
    if (hasScannedInitialChartIssuesRef.current) {
      return;
    }

    hasScannedInitialChartIssuesRef.current = true;

    if (mode !== 'import' || !onImportLoadStatusChange) {
      recheckChartIssues();
      return;
    }

    let firstFrameId: number | undefined;
    let secondFrameId: number | undefined;
    let readyTimeoutId: number | undefined;
    onImportLoadStatusChange(text.importStatus.loadingCanvas);

    firstFrameId = window.requestAnimationFrame(() => {
      onImportLoadStatusChange(text.importStatus.scanningIssues);

      secondFrameId = window.requestAnimationFrame(() => {
        recheckChartIssues();
        onImportLoadStatusChange(text.importStatus.ready);
        readyTimeoutId = window.setTimeout(() => {
          onImportLoadStatusChange(null);
        }, 350);
      });
    });

    return () => {
      if (firstFrameId !== undefined) {
        window.cancelAnimationFrame(firstFrameId);
      }
      if (secondFrameId !== undefined) {
        window.cancelAnimationFrame(secondFrameId);
      }
      if (readyTimeoutId !== undefined) {
        window.clearTimeout(readyTimeoutId);
      }
    };
  }, [mode, onImportLoadStatusChange, recheckChartIssues]);

  const clearActiveNoteInteraction = useCallback(() => {
    setDraggingNoteId(null);
    setSelectionBox(null);
    setHoverPreview(null);
    pendingDragUpdateRef.current = null;
    dragStartNoteRef.current = null;
  }, []);

  const speedDistanceIndex = useMemo(
    () => buildSpeedDistanceIndex(speedChanges),
    [speedChanges],
  );
  const previewSpeedChanges = isPreviewChartSpeedChangesEnabled
    ? speedChanges
    : PREVIEW_CONSTANT_SPEED_CHANGES;
  const previewPlaybackSpeedDistanceIndex = useMemo(
    () => buildSpeedDistanceIndex(previewSpeedChanges.map(change => ({
      ...change,
      timepos: getTimeFromTimepos(change.timepos),
    }))),
    [getTimeFromTimepos, previewSpeedChanges],
  );
  const isPreviewCanvasLoadingVisibleOnly = isPreviewMode && previewCanvasLoadPhase === 'visible';
  const previewCanvasCacheKey = previewCanvasCacheKeyRef.current;
  const canReuseFullPreviewCanvas = Boolean(
    previewCanvasCacheKey
    && previewCanvasCacheKey.notes === notes
    && previewCanvasCacheKey.bpmChanges === bpmChanges
    && previewCanvasCacheKey.speedChanges === speedChanges
    && previewCanvasCacheKey.previewSpeedChanges === previewSpeedChanges
    && previewCanvasCacheKey.isPreviewNoteSpeedChangesEnabled === isPreviewNoteSpeedChangesEnabled
    && previewCanvasCacheKey.isPreviewNoteAppearModeEnabled === isPreviewNoteAppearModeEnabled
    && previewCanvasCacheKey.usesOfficialPreviewRules === usesOfficialPreviewRules
  );
  const shouldBuildPreviewCanvasData = isPreviewMode || canReuseFullPreviewCanvas;
  // Skipped when neither the stats panel nor preview mode needs it: at 100k+ notes this
  // index build is an O(n log n) sort and shouldn't run on every edit unconditionally.
  const editorChartStatisticsIndex = useMemo(() => {
    if (!shouldShowChartStatistics && !shouldBuildPreviewCanvasData) {
      return EMPTY_CHART_STATISTICS_INDEX;
    }

    return buildChartStatisticsIndex({
      getTimeFromTimepos,
      notes,
      speedChanges,
    });
  }, [getTimeFromTimepos, notes, shouldBuildPreviewCanvasData, shouldShowChartStatistics, speedChanges]);
  const previewChartStatisticsFallbackIndex = useMemo<ChartStatisticsIndex>(() => {
    if (previewSpeedChanges === speedChanges) {
      return editorChartStatisticsIndex;
    }

    const sortedSpeedChanges = [...previewSpeedChanges].sort((a, b) => a.timepos - b.timepos);
    return {
      ...editorChartStatisticsIndex,
      sortedSpeedChanges,
      speedDistanceIndex: buildSpeedDistanceIndex(sortedSpeedChanges.map(change => ({
        ...change,
        timepos: getTimeFromTimepos(change.timepos),
      }))),
    };
  }, [editorChartStatisticsIndex, getTimeFromTimepos, previewSpeedChanges, speedChanges]);
  useEffect(() => {
    previewComboTimesRef.current = [];
    previewChartStatisticsIndexRef.current = null;
    previewPlaybackSpeedDistanceIndexRef.current = [];
  }, [previewSpeedChanges]);
  const previewInitialBeatWindow = useMemo(() => ({
    min: getBeatAtTime(
      Math.max(0, previewVisibleWindowTime - PREVIEW_INITIAL_CANVAS_SECONDS_BEHIND),
      timedBpmChanges,
    ),
    max: getBeatAtTime(
      previewVisibleWindowTime + PREVIEW_INITIAL_CANVAS_SECONDS_AHEAD,
      timedBpmChanges,
    ),
  }), [previewVisibleWindowTime, timedBpmChanges]);

  useEffect(() => {
    if (!isPreviewCanvasLoadingVisibleOnly) {
      return;
    }

    let idleCallbackId: number | undefined;
    let timeoutId: number | undefined;
    let isCancelled = false;

    const promoteToFullPreviewLoad = () => {
      if (isCancelled) {
        return;
      }

      previewCanvasCacheKeyRef.current = {
        notes,
        bpmChanges,
        speedChanges,
        previewSpeedChanges,
        isPreviewNoteSpeedChangesEnabled,
        isPreviewNoteAppearModeEnabled,
        usesOfficialPreviewRules,
      };
      setPreviewVisibleWindowTime(stateRef.current.currentTime);
      setPreviewCanvasLoadPhase('full');
    };

    const animationFrameId = window.requestAnimationFrame(() => {
      if ('requestIdleCallback' in window) {
        idleCallbackId = window.requestIdleCallback(promoteToFullPreviewLoad, { timeout: 1000 });
        return;
      }

      timeoutId = window.setTimeout(promoteToFullPreviewLoad, 0);
    });

    return () => {
      isCancelled = true;
      window.cancelAnimationFrame(animationFrameId);
      if (idleCallbackId !== undefined) {
        window.cancelIdleCallback(idleCallbackId);
      }
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    bpmChanges,
    isPreviewCanvasLoadingVisibleOnly,
    isPreviewNoteAppearModeEnabled,
    isPreviewNoteSpeedChangesEnabled,
    notes,
    previewSpeedChanges,
    speedChanges,
    usesOfficialPreviewRules,
  ]);

  const togglePreviewMode = useCallback(() => {
    setIsPreviewMode(current => {
      const nextPreviewMode = !current;
      const enteringPreviewDuringPlayback = nextPreviewMode && stateRef.current.isPlaying;
      const previewStartTime = enteringPreviewDuringPlayback
        ? Math.max(
            0,
            stateRef.current.playbackStartTime
              + ((performance.now() - stateRef.current.playbackStartPerformanceTime) / 1000)
                * stateRef.current.playbackSpeed,
          )
        : stateRef.current.currentTime;

      setIsExportMenuOpen(false);
      setIsPlaybackSpeedMenuOpen(false);
      setIsPreviewMenuOpen(false);
      resetPreviewJudgementState(previewStartTime, enteringPreviewDuringPlayback);

      if (nextPreviewMode) {
        setPreviewVisibleWindowTime(previewStartTime);
        setPreviewCanvasLoadPhase(canReuseFullPreviewCanvas ? 'full' : 'visible');

        if (!canReuseFullPreviewCanvas) {
          previewComboTimesRef.current = [];
          previewChartStatisticsIndexRef.current = null;
          previewPlaybackSpeedDistanceIndexRef.current = [];
          previewCameraTiltIntervalsRef.current = [];
        }
        previewCameraRotationRadiansRef.current = 0;
        previewTiltTimestampRef.current = 0;
        preview3DCameraScaleRef.current = 1;
        preview3DCameraYOffsetRef.current = 0;
        preview3DCameraTimestampRef.current = 0;
        setIsSettingsOpen(false);
        setIsHelpOpen(false);
        setIsStatisticsRefreshRateMenuOpen(false);
        setIsSelectionTypeMenuOpen(false);
        setCurveIdSelectTarget(null);
        setCurveNotesMessage('');
        setSelectedNoteIds([]);
        setIsCtrlHeld(false);
        setIsShiftHeld(false);
        clearActiveNoteInteraction();
        pasteTargetRef.current = null;
      } else {
        if (!canReuseFullPreviewCanvas) {
          setPreviewVisibleWindowTime(0);
          setPreviewCanvasLoadPhase('idle');
        }
        previewCameraRotationRadiansRef.current = 0;
        previewTiltTimestampRef.current = 0;
        preview3DCameraScaleRef.current = 1;
        preview3DCameraYOffsetRef.current = 0;
        preview3DCameraTimestampRef.current = 0;
      }

      return nextPreviewMode;
    });
  }, [canReuseFullPreviewCanvas, clearActiveNoteInteraction, resetPreviewJudgementState]);

  const handleCopySelectedNotes = useCallback(() => {
    const selectedIdSet = new Set(selectedNoteIds);
    copiedNotesRef.current = stateRef.current.notes
      .filter(note => selectedIdSet.has(note.id))
      .sort((a, b) => (a.time - b.time) || (a.id - b.id))
      .map(note => ({
        ...note,
        copiedTimepos: getTimeposFromTime(note.time),
      }));
    setCopiedNotesPreviewVersion(prev => prev + 1);
  }, [getTimeposFromTime, selectedNoteIds]);

  const handleClearCopiedNotes = useCallback(() => {
    if (copiedNotesRef.current.length === 0) return;

    copiedNotesRef.current = [];
    pasteTargetRef.current = null;
    setCopiedNotesPreviewVersion(prev => prev + 1);
  }, []);

  const restoreCurrentParentAfterDeletingNotes = useCallback((deletedNotes: Note[], preferredDeletedNoteId?: number) => {
    if (deletedNotes.length === 0) {
      return;
    }

    const parsedCurrentParentId = currentParentInput.trim() === ''
      ? nextNoteIdRef.current - 1
      : Number(currentParentInput.trim());

    const deletedNoteById = new Map(deletedNotes.map(note => [note.id, note]));
    const deletedCurrentParent = Number.isInteger(parsedCurrentParentId) && parsedCurrentParentId > 0
      ? deletedNoteById.get(parsedCurrentParentId)
      : undefined;
    const deletedAnchorNote = preferredDeletedNoteId === undefined
      ? deletedCurrentParent ?? deletedNotes[0]
      : deletedNoteById.get(preferredDeletedNoteId) ?? deletedCurrentParent ?? deletedNotes[0];

    let nextParentId = deletedAnchorNote.parentId;
    const visitedDeletedParentIds = new Set<number>();

    while (nextParentId !== null && deletedNoteById.has(nextParentId)) {
      if (visitedDeletedParentIds.has(nextParentId)) {
        nextParentId = null;
        break;
      }

      visitedDeletedParentIds.add(nextParentId);
      const deletedParent = deletedNoteById.get(nextParentId);
      nextParentId = deletedParent?.parentId ?? null;
    }

    setCurrentParentInput(nextParentId === null ? '' : nextParentId.toString());
  }, [currentParentInput]);

  const handleDeleteSelectedNotes = useCallback(() => {
    const noteIdsToDelete = new Set(selectedNoteIds);
    const deletedNotes = stateRef.current.notes.filter(n => noteIdsToDelete.has(n.id));
    if (deletedNotes.length === 0) return;

    recordOperation({
      category: 'note',
      title: deletedNotes.length === 1
        ? text.operations.deletedNote
        : formatTranslation(text.operations.deletedNotes, { count: deletedNotes.length }),
      detail: deletedNotes.length === 1
        ? getNoteHistoryDetail(deletedNotes[0])
        : formatTranslation(text.operations.idsDetail, { ids: formatGroupedIds(deletedNotes.map(note => note.id)) }),
    });

    restoreCurrentParentAfterDeletingNotes(deletedNotes);
    setNotes(prev => prev.filter(n => !noteIdsToDelete.has(n.id)));
    setSelectedNoteIds([]);
    clearActiveNoteInteraction();
  }, [clearActiveNoteInteraction, getNoteHistoryDetail, recordOperation, restoreCurrentParentAfterDeletingNotes, selectedNoteIds, setNotes]);

  const handleMirrorSelectedNotes = useCallback(() => {
    const selectedIdSet = new Set(selectedNoteIds);
    const selectedNotes = stateRef.current.notes.filter(note => selectedIdSet.has(note.id));
    if (selectedNotes.length === 0) return;

    const mirroredLaneById = new Map<number, number>();
    let changedCount = 0;

    selectedNotes.forEach(note => {
      const mirroredLane = getMirroredNoteLane(note);
      mirroredLaneById.set(note.id, mirroredLane);
      if (mirroredLane !== note.lane) {
        changedCount += 1;
      }
    });

    if (changedCount === 0) return;

    recordOperation({
      category: 'note',
      title: selectedNotes.length === 1
        ? text.operations.mirroredNote
        : formatTranslation(text.operations.mirroredNotes, { count: selectedNotes.length }),
      detail: formatTranslation(text.operations.mirroredAroundXpos, { ids: formatGroupedIds(selectedNotes.map(note => note.id)) }),
    });

    setNotes(prev => prev.map(note => {
      const mirroredLane = mirroredLaneById.get(note.id);
      return mirroredLane === undefined ? note : { ...note, lane: mirroredLane };
    }));
    clearActiveNoteInteraction();
  }, [clearActiveNoteInteraction, recordOperation, selectedNoteIds, setNotes]);

  const handleCenterSelectedNotes = useCallback(() => {
    const selectedIdSet = new Set(selectedNoteIds);
    const selectedNotes = stateRef.current.notes.filter(note => selectedIdSet.has(note.id));
    if (selectedNotes.length === 0) return;

    const groupLeft = Math.min(...selectedNotes.map(note => Math.min(note.lane, note.lane + note.width)));
    const groupRight = Math.max(...selectedNotes.map(note => Math.max(note.lane, note.lane + note.width)));
    const groupCenter = (groupLeft + groupRight) / 2;
    const laneOffset = X_POSITION_COUNT / 2 - groupCenter;

    if (Math.abs(laneOffset) <= SNAP_EPSILON) return;

    recordOperation({
      category: 'note',
      title: selectedNotes.length === 1
        ? text.operations.centeredNote
        : formatTranslation(text.operations.centeredNotes, { count: selectedNotes.length }),
      detail: formatTranslation(text.operations.centeredAtXpos, { ids: formatGroupedIds(selectedNotes.map(note => note.id)) }),
    });

    setNotes(prev => prev.map(note => (
      selectedIdSet.has(note.id) ? { ...note, lane: note.lane + laneOffset } : note
    )));
    clearActiveNoteInteraction();
  }, [clearActiveNoteInteraction, recordOperation, selectedNoteIds, setNotes]);

  const noteRenderIndex = useMemo(
    () => buildNoteRenderIndex(notes, timedBpmChanges),
    [notes, timedBpmChanges],
  );
  const hasPinkHoldCameraToolNotes = useMemo(
    () => notes.some(note => note.type === PINK_HOLD_CENTER_TYPE || note.type === PINK_HOLD_END_TYPE),
    [notes],
  );
  const cameraRotationToolGeneratedNoteIdSet = useMemo(
    () => new Set(cameraRotationToolGeneratedNoteIds),
    [cameraRotationToolGeneratedNoteIds],
  );
  const cameraRotationToolBaseNotes = useMemo(
    () => (isCameraRotationToolOpen ? notes.filter(note => !cameraRotationToolGeneratedNoteIdSet.has(note.id)) : []),
    [cameraRotationToolGeneratedNoteIdSet, isCameraRotationToolOpen, notes],
  );
  // Gated on the tool being open: this rebuilds a second full spatial index (5 sorts) from
  // scratch, which shouldn't run on every note edit when the camera rotation tool isn't in use.
  const cameraRotationToolBaseTiltSegments = useMemo(() => {
    if (!isCameraRotationToolOpen) {
      return [];
    }

    const baseNoteRenderIndex = buildNoteRenderIndex(cameraRotationToolBaseNotes, timedBpmChanges);

    return baseNoteRenderIndex.holdConnectorSegments
      .map((segment) => {
        const parentTimepos = roundCameraRotationToolChartValue(getTimeposFromTime(segment.parentNote.time));
        const noteTimepos = roundCameraRotationToolChartValue(getTimeposFromTime(segment.note.time));
        const parentLane = roundCameraRotationToolChartValue(segment.parentNote.lane);
        const noteLane = roundCameraRotationToolChartValue(segment.note.lane);
        const parentWidth = roundCameraRotationToolChartValue(segment.parentNote.width);
        const noteWidth = roundCameraRotationToolChartValue(segment.note.width);
        const parentTime = getTimeFromTimepos(parentTimepos);
        const noteTime = getTimeFromTimepos(noteTimepos);
        const noteCenterXPosition = noteLane + noteWidth / 2;
        const parentCenterXPosition = parentLane + parentWidth / 2;

        return {
          startTime: parentTime,
          endTime: noteTime,
          startTimepos: parentTimepos,
          endTimepos: noteTimepos,
          parentTiltDegrees: (parentCenterXPosition - X_POSITION_COUNT / 2) / PREVIEW_CONNECTOR_TILT_DIVISOR,
          noteTiltDegrees: (noteCenterXPosition - X_POSITION_COUNT / 2) / PREVIEW_CONNECTOR_TILT_DIVISOR,
        };
      })
      .filter(segment => segment.endTime - segment.startTime > SNAP_EPSILON)
      .sort((a, b) => (a.startTime - b.startTime) || (a.endTime - b.endTime));
  }, [cameraRotationToolBaseNotes, getTimeFromTimepos, getTimeposFromTime, isCameraRotationToolOpen, timedBpmChanges]);
  const getCameraRotationToolNativeTiltState = useCallback((timepos: number) => {
    const time = getTimeFromTimepos(timepos);
    const activeSegments = cameraRotationToolBaseTiltSegments.filter(segment => (
      segment.startTime <= time + SNAP_EPSILON
      && time < segment.endTime - SNAP_EPSILON
    ));
    const tiltTotal = activeSegments.reduce((total, segment) => {
      const progress = (time - segment.startTime) / (segment.endTime - segment.startTime);
      return total + segment.parentTiltDegrees + (segment.noteTiltDegrees - segment.parentTiltDegrees) * progress;
    }, 0);

    return {
      count: activeSegments.length,
      tiltTotal,
      tiltDegrees: activeSegments.length > 0 ? tiltTotal / activeSegments.length : 0,
    };
  }, [cameraRotationToolBaseTiltSegments, getTimeFromTimepos]);
  const getCameraRotationToolNativeAngleAtTimepos = useCallback(
    (timepos: number) => getCameraRotationToolNativeTiltState(timepos).tiltDegrees,
    [getCameraRotationToolNativeTiltState],
  );
  const previewNoteBeatEntriesSource = useMemo(() => {
    if (!shouldBuildPreviewCanvasData) {
      return [];
    }

    if (!isPreviewCanvasLoadingVisibleOnly) {
      return noteRenderIndex.noteBeatEntries;
    }

    return getNoteBeatEntriesInRange(
      noteRenderIndex.noteBeatEntries,
      previewInitialBeatWindow.min,
      previewInitialBeatWindow.max,
    );
  }, [
    isPreviewCanvasLoadingVisibleOnly,
    shouldBuildPreviewCanvasData,
    noteRenderIndex.noteBeatEntries,
    previewInitialBeatWindow,
  ]);
  const previewHoldConnectorSegmentsSource = useMemo(() => {
    if (!shouldBuildPreviewCanvasData) {
      return [];
    }

    if (!isPreviewCanvasLoadingVisibleOnly) {
      return noteRenderIndex.holdConnectorSegments;
    }

    return getHoldConnectorSegmentsInRange(
      noteRenderIndex.holdConnectorSegmentsByMinBeat,
      noteRenderIndex.holdConnectorSegmentsByMaxBeat,
      previewInitialBeatWindow.min,
      previewInitialBeatWindow.max,
    );
  }, [
    isPreviewCanvasLoadingVisibleOnly,
    shouldBuildPreviewCanvasData,
    noteRenderIndex.holdConnectorSegmentsByMaxBeat,
    noteRenderIndex.holdConnectorSegmentsByMinBeat,
    previewInitialBeatWindow,
  ]);
  const previewCanvasNotesSource = useMemo(
    () => isPreviewCanvasLoadingVisibleOnly
      ? previewNoteBeatEntriesSource.map(({ note }) => note)
      : notes,
    [isPreviewCanvasLoadingVisibleOnly, notes, previewNoteBeatEntriesSource],
  );
  const selectedParentNoteIds = useMemo(() => {
    if (selectedNoteIds.length !== 1) {
      return new Set<number>();
    }

    const selectedNote = noteRenderIndex.notesById.get(selectedNoteIds[0]);
    if (!selectedNote || !canTypeHaveParent(selectedNote.type) || selectedNote.parentId === null) {
      return new Set<number>();
    }

    return new Set([selectedNote.parentId]);
  }, [noteRenderIndex.notesById, selectedNoteIds]);
  const previewNoteRenderEntries = useMemo(
    () => {
      if (!shouldBuildPreviewCanvasData) {
        return [];
      }

      return previewNoteBeatEntriesSource.map(({ note, beat }) => {
        const timepos = getTimeposFromTime(note.time);
        return {
          note,
          beat,
          timepos,
          playbackTime: note.time,
          distance: getSpeedDistanceAtTimepos(note.time, previewPlaybackSpeedDistanceIndex),
          noteSpeed: parsePreviewNoteSpeed(
            getPreviewNoteSpeedSource(
              note,
              usesOfficialPreviewRules,
              isPreviewNoteSpeedChangesEnabled,
              isPreviewNoteAppearModeEnabled,
            ),
            timepos,
            speedDistanceIndex,
          ),
        };
      })
        .sort(comparePreviewNoteRenderEntries);
    },
    [
      getTimeposFromTime,
      isPreviewNoteAppearModeEnabled,
      isPreviewNoteSpeedChangesEnabled,
      shouldBuildPreviewCanvasData,
      previewNoteBeatEntriesSource,
      previewPlaybackSpeedDistanceIndex,
      speedDistanceIndex,
      usesOfficialPreviewRules,
    ],
  );
  const previewDistanceIndexedNoteRenderEntries = useMemo(
    () => previewNoteRenderEntries.filter(entry => entry.noteSpeed.kind !== 'curve'),
    [previewNoteRenderEntries],
  );
  const previewSpatialDistanceEntries = useMemo(
    () => previewDistanceIndexedNoteRenderEntries.filter(entry => (
      entry.note.appearMode !== 'L' && entry.note.appearMode !== 'R'
    )),
    [previewDistanceIndexedNoteRenderEntries],
  );
  const previewSideEntryDistanceEntries = useMemo(
    () => previewDistanceIndexedNoteRenderEntries.filter(entry => (
      entry.note.appearMode === 'L' || entry.note.appearMode === 'R'
    )),
    [previewDistanceIndexedNoteRenderEntries],
  );
  const previewDistanceEntriesByLaneStart = useMemo(
    () => [...previewSpatialDistanceEntries].sort((a, b) => (
      Math.min(a.note.lane, a.note.lane + a.note.width)
      - Math.min(b.note.lane, b.note.lane + b.note.width)
    ) || (a.note.id - b.note.id)),
    [previewSpatialDistanceEntries],
  );
  const previewDistanceEntriesByLaneEnd = useMemo(
    () => [...previewSpatialDistanceEntries].sort((a, b) => (
      Math.max(a.note.lane, a.note.lane + a.note.width)
      - Math.max(b.note.lane, b.note.lane + b.note.width)
    ) || (a.note.id - b.note.id)),
    [previewSpatialDistanceEntries],
  );
  const previewCurveNoteRenderEntries = useMemo(
    () => previewNoteRenderEntries.filter(entry => entry.noteSpeed.kind === 'curve'),
    [previewNoteRenderEntries],
  );
  const previewCurveNoteRenderEntryBuckets = useMemo(() => {
    const bucketSize = 1;
    const buckets = new Map<number, PreviewNoteRenderEntry[]>();

    previewCurveNoteRenderEntries.forEach((entry) => {
      if (entry.noteSpeed.kind !== 'curve') {
        return;
      }

      const animationStartTimepos = entry.noteSpeed.keyframes[0]?.time;
      if (animationStartTimepos === undefined) {
        return;
      }

      const startBucket = Math.floor((animationStartTimepos - SNAP_EPSILON) / bucketSize);
      const endBucket = Math.floor((entry.timepos - SNAP_EPSILON) / bucketSize);

      for (let bucket = startBucket; bucket <= endBucket; bucket += 1) {
        const bucketEntries = buckets.get(bucket);
        if (bucketEntries) {
          bucketEntries.push(entry);
        } else {
          buckets.set(bucket, [entry]);
        }
      }
    });

    return { bucketSize, buckets };
  }, [previewCurveNoteRenderEntries]);
  const previewNoteRenderEntryById = useMemo(
    () => new Map(previewNoteRenderEntries.map(entry => [entry.note.id, entry])),
    [previewNoteRenderEntries],
  );
  const previewHoldConnectorSegments = useMemo(
    () => {
      if (!shouldBuildPreviewCanvasData) {
        return [];
      }

      return previewHoldConnectorSegmentsSource.map((segment) => {
        const noteEntry = previewNoteRenderEntryById.get(segment.note.id);
        const parentEntry = previewNoteRenderEntryById.get(segment.parentNote.id);
        const noteTimepos = noteEntry?.timepos ?? getTimeposFromTime(segment.note.time);
        const parentTimepos = parentEntry?.timepos ?? getTimeposFromTime(segment.parentNote.time);
        const notePlaybackTime = noteEntry?.playbackTime ?? segment.note.time;
        const parentPlaybackTime = parentEntry?.playbackTime ?? segment.parentNote.time;
        const noteDistance = noteEntry?.distance ?? getSpeedDistanceAtTimepos(segment.note.time, previewPlaybackSpeedDistanceIndex);
        const parentDistance = parentEntry?.distance ?? getSpeedDistanceAtTimepos(segment.parentNote.time, previewPlaybackSpeedDistanceIndex);

        return {
          note: segment.note,
          parentNote: segment.parentNote,
          noteBeat: segment.noteBeat,
          parentBeat: segment.parentBeat,
          noteTimepos,
          parentTimepos,
          notePlaybackTime,
          parentPlaybackTime,
          noteDistance,
          parentDistance,
          noteSpeed: noteEntry?.noteSpeed ?? parsePreviewNoteSpeed(
            getPreviewNoteSpeedSource(
              segment.note,
              usesOfficialPreviewRules,
              isPreviewNoteSpeedChangesEnabled,
              isPreviewNoteAppearModeEnabled,
            ),
            noteTimepos,
            speedDistanceIndex,
          ),
          parentSpeed: parsePreviewNoteSpeed(
            getPreviewConnectorParentSpeedSource(
              segment.parentNote,
              usesOfficialPreviewRules,
              isPreviewNoteSpeedChangesEnabled,
              isPreviewNoteAppearModeEnabled,
            ),
            parentTimepos,
            speedDistanceIndex,
          ),
          minDistance: Math.min(noteDistance, parentDistance),
          maxDistance: Math.max(noteDistance, parentDistance),
        };
      })
        .sort((a, b) => (
          (a.minDistance - b.minDistance)
          || (a.maxDistance - b.maxDistance)
          || (a.note.id - b.note.id)
        ));
    },
    [
      getTimeposFromTime,
      isPreviewNoteAppearModeEnabled,
      isPreviewNoteSpeedChangesEnabled,
      shouldBuildPreviewCanvasData,
      previewHoldConnectorSegmentsSource,
      previewNoteRenderEntryById,
      previewPlaybackSpeedDistanceIndex,
      speedDistanceIndex,
      usesOfficialPreviewRules,
    ],
  );
  const previewHoldConnectorDrawSegments = useMemo(
    () => previewHoldConnectorSegments,
    [previewHoldConnectorSegments],
  );
  const previewJudgementNoteEntries = useMemo(
    () => shouldBuildPreviewCanvasData
      ? previewNoteBeatEntriesSource.map(({ note }) => ({
          id: note.id,
          time: note.time,
          type: note.type,
          lane: note.lane,
          width: note.width,
        }))
      : [],
    [previewNoteBeatEntriesSource, shouldBuildPreviewCanvasData],
  );
  const previewComboTimes = useMemo(
    () => shouldBuildPreviewCanvasData ? previewNoteBeatEntriesSource.map(({ note }) => note.time) : [],
    [previewNoteBeatEntriesSource, shouldBuildPreviewCanvasData],
  );
  const previewCameraMovementSegments = useMemo(
    () => {
      if (!shouldBuildPreviewCanvasData) {
        return [];
      }

      return previewHoldConnectorSegmentsSource
        .filter(segment => segment.note.type === PINK_HOLD_CENTER_TYPE || segment.note.type === PINK_HOLD_END_TYPE)
        .map((segment) => {
        const startTime = segment.parentNote.time;
        const endTime = segment.note.time;
        const parentCenter = segment.parentNote.lane + segment.parentNote.width / 2;
        const noteCenter = segment.note.lane + segment.note.width / 2;

        return {
          startTime,
          endTime,
          deltaXPosition: noteCenter - parentCenter,
        };
      })
        .filter(segment => Math.abs(segment.deltaXPosition) > SNAP_EPSILON)
        .sort((a, b) => (a.endTime - b.endTime) || (a.startTime - b.startTime));
    },
    [previewHoldConnectorSegmentsSource, shouldBuildPreviewCanvasData],
  );
  const previewCameraMovementIntervals = useMemo(
    () => buildPreviewCameraMovementIntervals(previewCameraMovementSegments),
    [previewCameraMovementSegments],
  );
  const hasPinkHoldCameraNotes = useMemo(
    () => shouldBuildPreviewCanvasData && previewCanvasNotesSource.some(note => note.type === PINK_HOLD_CENTER_TYPE || note.type === PINK_HOLD_END_TYPE),
    [previewCanvasNotesSource, shouldBuildPreviewCanvasData],
  );
  const preview3DZoomHeightCurve = useMemo(() => {
    if (!shouldBuildPreviewCanvasData) {
      return [];
    }

    const maxNoteTime = previewCanvasNotesSource.reduce((maxTime, note) => Math.max(maxTime, note.time), 0);
    const curveLength = Math.max(1, Math.ceil(Math.max(timelineDuration, maxNoteTime)) + 3);
    const heightList = Array.from({ length: curveLength }, () => 0);
    const setHeight = (second: number, value: number) => {
      if (second < 0 || second >= heightList.length) {
        return;
      }

      heightList[second] = Math.max(heightList[second], value);
    };

    previewCanvasNotesSource.forEach((note) => {
      const second = Math.floor(note.time);
      const noteLeft = note.lane;
      const noteRight = note.lane + note.width;
      let heightAmount = 0;

      if (noteLeft < 0) {
        heightAmount = Math.max(heightAmount, noteLeft / -X_POSITION_COUNT);
      }

      if (noteRight > X_POSITION_COUNT) {
        heightAmount = Math.max(heightAmount, (noteRight - X_POSITION_COUNT) / X_POSITION_COUNT);
      }

      if (heightAmount > 0) {
        setHeight(second, heightAmount);
        setHeight(second + 1, heightAmount);
      }

      let neighborHeightAmount = 0;
      if (noteLeft < -X_POSITION_COUNT / 2) {
        neighborHeightAmount = Math.max(neighborHeightAmount, noteLeft / -(X_POSITION_COUNT * 2));
      }

      if (noteRight > X_POSITION_COUNT * 1.5) {
        neighborHeightAmount = Math.max(neighborHeightAmount, (noteRight - X_POSITION_COUNT) / (X_POSITION_COUNT * 2));
      }

      if (neighborHeightAmount > 0) {
        setHeight(second - 1, neighborHeightAmount);
        setHeight(second + 2, neighborHeightAmount);
      }
    });

    return heightList;
  }, [previewCanvasNotesSource, shouldBuildPreviewCanvasData, timelineDuration]);
  const previewCameraTiltSegments = useMemo(
    () => {
      if (!shouldBuildPreviewCanvasData) {
        return [];
      }

      return previewHoldConnectorSegments.map((segment) => {
        const parentTimepos = roundCameraRotationToolChartValue(segment.parentTimepos);
        const noteTimepos = roundCameraRotationToolChartValue(segment.noteTimepos);
        const parentLane = roundCameraRotationToolChartValue(segment.parentNote.lane);
        const noteLane = roundCameraRotationToolChartValue(segment.note.lane);
        const parentWidth = roundCameraRotationToolChartValue(segment.parentNote.width);
        const noteWidth = roundCameraRotationToolChartValue(segment.note.width);
        const parentTime = getTimeFromTimepos(parentTimepos);
        const noteTime = getTimeFromTimepos(noteTimepos);
        const noteCenterXPosition = noteLane + noteWidth / 2;
        const parentCenterXPosition = parentLane + parentWidth / 2;

        return {
          startTime: parentTime,
          endTime: noteTime,
          startTimepos: parentTimepos,
          endTimepos: noteTimepos,
          parentTiltDegrees: (parentCenterXPosition - X_POSITION_COUNT / 2) / PREVIEW_CONNECTOR_TILT_DIVISOR,
          noteTiltDegrees: (noteCenterXPosition - X_POSITION_COUNT / 2) / PREVIEW_CONNECTOR_TILT_DIVISOR,
        };
      })
        .filter(segment => segment.endTime - segment.startTime > SNAP_EPSILON)
        .sort((a, b) => (a.startTime - b.startTime) || (a.endTime - b.endTime));
    },
    [getTimeFromTimepos, previewHoldConnectorSegments, shouldBuildPreviewCanvasData],
  );
  previewCameraTiltSegmentsRef.current = previewCameraTiltSegments;
  const previewCameraTiltIntervals = useMemo(
    () => buildPreviewCameraTiltIntervals(previewCameraTiltSegments),
    [previewCameraTiltSegments],
  );
  useEffect(() => {
    if (!isPreviewMode || !isPreviewPrecomputeEnabled || previewCanvasLoadPhase !== 'full') {
      if ((!isPreviewMode && !canReuseFullPreviewCanvas) || !isPreviewPrecomputeEnabled) {
        previewComboTimesRef.current = [];
        previewChartStatisticsIndexRef.current = null;
        previewPlaybackSpeedDistanceIndexRef.current = [];
        previewCameraTiltIntervalsRef.current = [];
      }
      return;
    }

    let idleCallbackId: number | undefined;
    let timeoutId: number | undefined;
    let isCancelled = false;

    const precomputePreviewMode = () => {
      if (isCancelled) {
        return;
      }

      const cachedPreviewPrecompute = previewModePrecomputeCacheRef.current;
      const cameraTiltSegments = previewCameraTiltSegmentsRef.current;
      const canReusePreviewPrecompute = Boolean(
        cachedPreviewPrecompute
        && cachedPreviewPrecompute.notes === stateRef.current.notes
        && cachedPreviewPrecompute.speedChanges === previewSpeedChanges
        && cachedPreviewPrecompute.bpmChanges === stateRef.current.bpmChanges
        && cachedPreviewPrecompute.playbackSpeedDistanceIndex === previewPlaybackSpeedDistanceIndex
        && cachedPreviewPrecompute.cameraTiltSegments === cameraTiltSegments
      );
      const previewPrecompute = canReusePreviewPrecompute
        ? cachedPreviewPrecompute!
        : {
            notes: stateRef.current.notes,
            speedChanges: previewSpeedChanges,
            bpmChanges: stateRef.current.bpmChanges,
            playbackSpeedDistanceIndex: previewPlaybackSpeedDistanceIndex,
            cameraTiltSegments,
            chartStatisticsIndex: previewChartStatisticsFallbackIndex,
            cameraTiltIntervals: previewCameraTiltIntervals,
          };

      if (isCancelled) {
        return;
      }

      previewModePrecomputeCacheRef.current = previewPrecompute;
      previewComboTimesRef.current = previewPrecompute.chartStatisticsIndex.sortedNoteTimes;
      previewChartStatisticsIndexRef.current = previewPrecompute.chartStatisticsIndex;
      previewPlaybackSpeedDistanceIndexRef.current = previewPrecompute.playbackSpeedDistanceIndex;
      previewCameraTiltIntervalsRef.current = previewPrecompute.cameraTiltIntervals;
    };

    if ('requestIdleCallback' in window) {
      idleCallbackId = window.requestIdleCallback(precomputePreviewMode, { timeout: 500 });
    } else {
      timeoutId = window.setTimeout(precomputePreviewMode, 0);
    }

    return () => {
      isCancelled = true;
      if (idleCallbackId !== undefined) {
        window.cancelIdleCallback(idleCallbackId);
      }
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    getTimeFromTimepos,
    canReuseFullPreviewCanvas,
    isPreviewMode,
    isPreviewPrecomputeEnabled,
    previewCanvasLoadPhase,
    previewCameraTiltIntervals,
    previewCameraTiltSegments,
    previewPlaybackSpeedDistanceIndex,
    previewSpeedChanges,
    previewChartStatisticsFallbackIndex,
  ]);
  const previewMinimumNoteSpeedMagnitude = useMemo(
    () => previewNoteRenderEntries.reduce((minimumMagnitude, entry) => (
      entry.noteSpeed.kind === 'multiplier'
        ? Math.min(minimumMagnitude, Math.max(0.05, Math.abs(entry.noteSpeed.multiplier)))
        : minimumMagnitude
    ), 1),
    [previewNoteRenderEntries],
  );

  const finishPendingDrag = useCallback(() => {
    if (dragUpdateFrameRef.current) {
      cancelAnimationFrame(dragUpdateFrameRef.current);
      dragUpdateFrameRef.current = undefined;
    }

    const pendingUpdate = pendingDragUpdateRef.current;
    const dragStartNote = dragStartNoteRef.current;
    let dragEndNote = dragStartNote
      ? stateRef.current.notes.find(note => note.id === dragStartNote.id) || null
      : null;

    if (pendingUpdate) {
      if (dragStartNote && dragStartNote.id === pendingUpdate.noteId) {
        dragEndNote = { ...dragStartNote, time: pendingUpdate.time, lane: pendingUpdate.lane };
      }

      setNotes((prev) => prev.map((note) => {
        if (note.id !== pendingUpdate.noteId) {
          return note;
        }

        if (note.time === pendingUpdate.time && note.lane === pendingUpdate.lane) {
          return note;
        }

        return { ...note, time: pendingUpdate.time, lane: pendingUpdate.lane };
      }));
      pendingDragUpdateRef.current = null;
    }

    if (dragStartNote && dragEndNote && (dragStartNote.time !== dragEndNote.time || dragStartNote.lane !== dragEndNote.lane)) {
      recordOperation({
        category: 'note',
        title: text.operations.movedNote,
        detail: formatTranslation(text.operations.movedNoteDetail, {
          noteId: dragStartNote.id,
          fromTime: formatTime(dragStartNote.time, timedBpmChanges),
          fromX: formatNoteLane(dragStartNote.lane),
          toTime: formatTime(dragEndNote.time, timedBpmChanges),
          toX: formatNoteLane(dragEndNote.lane),
        }),
      });
    }

    dragStartNoteRef.current = null;
    setDraggingNoteId(null);
  }, [recordOperation, setNotes, timedBpmChanges]);

  useEffect(() => {
    if (enabledHitSoundUrls.length === 0) {
      hitSoundEventsRef.current = [];
      hitSoundCursorRef.current = 0;
      scheduledHitSoundKeysRef.current.clear();
      lastPlayedTimeRef.current = stateRef.current.currentTime;
      return;
    }

    const hitSoundEventsByKey = new Map<string, HitSoundEvent>();

    notes.forEach(note => {
      const noteTypeInfo = NOTE_TYPES[note.type];
      if (!noteTypeInfo?.sound) return;

      const soundUrl = SOUND_URLS[noteTypeInfo.sound] || noteTypeInfo.sound;
      if (getHitSoundVolume(soundUrl, tapSoundVolume, flickSoundVolume) <= 0) return;

      const key = `${note.time}-${note.type}`;
      if (!hitSoundEventsByKey.has(key)) {
        hitSoundEventsByKey.set(key, { time: note.time, soundUrl, key });
      }
    });

    hitSoundEventsRef.current = Array.from(hitSoundEventsByKey.values()).sort((a, b) => a.time - b.time);
    hitSoundCursorRef.current = 0;
    scheduledHitSoundKeysRef.current.clear();
    lastPlayedTimeRef.current = stateRef.current.currentTime;
  }, [enabledHitSoundUrls.length, flickSoundVolume, notes, tapSoundVolume]);

  useEffect(() => {
    const handleMouseUp = () => {
      finishPendingDrag();
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [finishPendingDrag]);

  useEffect(() => {
    return () => {
      if (dragUpdateFrameRef.current) {
        cancelAnimationFrame(dragUpdateFrameRef.current);
      }
    };
  }, []);

  const showMetadataFieldValidation = (field: MetadataField) => {
    setMetadataTouchedFields(prev => ({ ...prev, [field]: true }));
  };

  const handleMetadataFieldKeyDown = (field: MetadataField, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      showMetadataFieldValidation(field);
    }
  };

  const handleConfirm = async ({
    formDataOverride,
    stayInEditInfo = false,
  }: { formDataOverride?: typeof formData; stayInEditInfo?: boolean } = {}) => {
    if (isProjectAudioConverting) return;

    const nextFormData = formDataOverride ?? formData;
    const nextInvalidMetadataFields = getInvalidMetadataFields(nextFormData);

    setMetadataTouchedFields(getRequiredMetadataTouchedFields());

    if (hasInvalidMetadataFields(nextInvalidMetadataFields)) {
      alert(text.editor.invalidMetadataAlert);
      return;
    }

    const wasProjectCreated = !projectData;
    let nextSongFile = nextFormData.songFile;
    let wasAudioConvertedToOgg = false;
    let audioUrl = projectData?.audioUrl || '';

    if (nextSongFile && nextSongFile !== projectData?.songFile) {
      wasAudioConvertedToOgg = !isOggAudioFile(nextSongFile);
      setIsProjectAudioConverting(true);

      try {
        nextSongFile = await convertNonOggAudioFileForProject(nextSongFile);
      } catch (error) {
        console.warn(text.editor.audioConversionFailedLog, error);
        alert(text.editor.audioConversionFailedAlert);
        setIsProjectAudioConverting(false);
        return;
      }

      if (audioUrl) URL.revokeObjectURL(audioUrl);
      audioUrl = URL.createObjectURL(nextSongFile);
    }

    const parsedBpm = parseFloat(nextFormData.songBpm);
    const fallbackBpm = projectData?.bpm || bpmChanges[0]?.bpm || 120;
    const nextBpm = Number.isFinite(parsedBpm) ? parsedBpm : fallbackBpm;
    const nextAudioDuration = nextSongFile === projectData?.songFile
      ? projectData.audioDuration
      : undefined;
    const sanitizedFormData = {
      ...nextFormData,
      songFile: nextSongFile,
      songId: stripInputWhitespace(nextFormData.songId),
      songName: stripInputWhitespace(nextFormData.songName),
      songArtist: stripInputWhitespace(nextFormData.songArtist),
      songBpm: stripInputWhitespace(nextFormData.songBpm),
      difficulty: stripInputWhitespace(nextFormData.difficulty),
    };
    const committedFormData = {
      ...sanitizedFormData,
      songBpm: nextBpm.toString(),
    };

    setProjectData({
      ...committedFormData,
      chartFormat: projectData?.chartFormat ?? 'Official',
      bpm: nextBpm,
      audioUrl,
      audioDuration: nextAudioDuration,
      audioConvertedToOgg: wasAudioConvertedToOgg || projectData?.audioConvertedToOgg,
    });
    setFormData(committedFormData);

    // Imported charts can exist before project metadata is set, so only seed BPMs for actual new projects.
    if (!projectData && mode === 'new') {
      setBpmChanges([{ timepos: 0, bpm: nextBpm, timeSignature: '4/4' }]);
    }

    setIsModalOpen(false);
    setIsProjectAudioConverting(false);
    if (wasAudioConvertedToOgg && !wasProjectCreated) {
      setIsAudioOffsetNoticeOpen(true);
    }
    if (activeLeftPanel === 'editInfo' && !stayInEditInfo) {
      setActiveLeftPanel('main');
    }
    setMetadataTouchedFields({});

    recordOperation({
      category: 'metadata',
      title: wasProjectCreated ? text.operations.createdProjectMetadata : text.operations.updatedChartMetadata,
      detail: `${committedFormData.songName || text.editor.untitledProject} | ${text.sidebar.bpm} ${formatHistoryNumber(nextBpm)} | ${text.modal.difficultyRequired.replace(' *', '')} ${committedFormData.difficulty || text.common.none}`,
    });
    if (committedFormData.difficulty === '15') {
      completeCurrentTutorialObjective('metadataSaved');
    }
  };

  const handleEditInfo = () => {
    const fallbackBpm = bpmChanges[0]?.bpm;
    setFormData({
      songId: projectData?.songId || '',
      songName: projectData?.songName || '',
      songArtist: projectData?.songArtist || '',
      songBpm: projectData?.bpm?.toString() || (fallbackBpm ? fallbackBpm.toString() : ''),
      difficulty: projectData?.difficulty || '1',
      songFile: projectData?.songFile || null,
      songIllustration: projectData?.songIllustration || null,
    });
    setMetadataTouchedFields(mode === 'import' ? getRequiredMetadataTouchedFields() : {});
    setActiveLeftPanel('editInfo');
  };

  const getHitSoundContext = useCallback(() => {
    if (hitSoundContextRef.current) return hitSoundContextRef.current;

    const AudioContextCtor = getAudioContextCtor();
    if (!AudioContextCtor) return null;

    const context = new AudioContextCtor({ latencyHint: 'interactive' });
    hitSoundContextRef.current = context;
    return context;
  }, []);

  const loadHitSoundBuffer = useCallback(async (soundUrl: string) => {
    const cachedBuffer = hitSoundBuffersRef.current.get(soundUrl);
    if (cachedBuffer) return cachedBuffer;

    const existingLoad = hitSoundLoadPromisesRef.current.get(soundUrl);
    if (existingLoad) return existingLoad;

    const loadPromise = (async () => {
      const context = getHitSoundContext();
      if (!context) return null;

      try {
        const response = await fetch(soundUrl);
        const audioData = await response.arrayBuffer();
        const buffer = await context.decodeAudioData(audioData);
        hitSoundBuffersRef.current.set(soundUrl, buffer);
        return buffer;
      } catch (error) {
        console.warn('Failed to load hitsound:', soundUrl, error);
        return null;
      } finally {
        hitSoundLoadPromisesRef.current.delete(soundUrl);
      }
    })();

    hitSoundLoadPromisesRef.current.set(soundUrl, loadPromise);
    return loadPromise;
  }, [getHitSoundContext]);

  const playHitSound = useCallback((soundUrl: string, delaySeconds = 0) => {
    if (getHitSoundVolume(soundUrl, tapSoundVolume, flickSoundVolume) <= 0) {
      return;
    }

    const context = getHitSoundContext();
    const buffer = hitSoundBuffersRef.current.get(soundUrl);
    if (!context || !buffer) {
      void loadHitSoundBuffer(soundUrl);
      return;
    }

    const source = context.createBufferSource();
    const gain = context.createGain();
    gain.gain.value = getHitSoundVolume(soundUrl, tapSoundVolume, flickSoundVolume);
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(context.destination);

    activeHitSounds.current.add(source);
    source.onended = () => {
      activeHitSounds.current.delete(source);
      source.disconnect();
      gain.disconnect();
    };

    source.start(context.currentTime + Math.max(0, delaySeconds));
  }, [flickSoundVolume, getHitSoundContext, loadHitSoundBuffer, tapSoundVolume]);

  const prepareHitSounds = useCallback(() => {
    if (enabledHitSoundUrls.length === 0) {
      return Promise.resolve([]);
    }

    const context = getHitSoundContext();
    if (context?.state === 'suspended') {
      context.resume().catch(() => {});
    }

    return Promise.all(
      enabledHitSoundUrls.map(soundUrl => loadHitSoundBuffer(soundUrl)),
    );
  }, [enabledHitSoundUrls, getHitSoundContext, loadHitSoundBuffer]);

  useEffect(() => {
    void prepareHitSounds();

    return () => {
      activeHitSounds.current.forEach(source => {
        try {
          source.stop();
        } catch {
          // Source may have already ended.
        }
      });
      activeHitSounds.current.clear();
      hitSoundContextRef.current?.close().catch(() => {});
      hitSoundContextRef.current = null;
      musicAudioContextRef.current = null;
      musicSourceRef.current = null;
      musicGainRef.current = null;
    };
  }, [prepareHitSounds]);

  const handleSeekChange = useCallback((e: React.ChangeEvent<HTMLInputElement> | React.FormEvent<HTMLInputElement>) => {
    stopHitsounds();
    const rawTargetTime = parseFloat(e.currentTarget.value);
    const targetTime = Number.isFinite(rawTargetTime)
      ? Math.min(rawTargetTime, timelineDuration || rawTargetTime)
      : 0;

    const sortedChanges = timedBpmChanges;
    const newTime = isPreviewMode
      ? targetTime
      : getTimeAtBeat(
          snapBeatToMeasureDivision(getBeatAtTime(targetTime, sortedChanges), effectiveGridZoom, sortedChanges),
          sortedChanges,
        );
    const shouldHidePastPreviewNotes = isPreviewMode && newTime > stateRef.current.currentTime;
    resetPreviewJudgementState(newTime, shouldHidePastPreviewNotes);
    
    setCurrentTime(newTime);
    stateRef.current.currentTime = newTime;
    stateRef.current.playbackStartTime = newTime;
    const seekStartTime = performance.now();
    stateRef.current.playbackStartPerformanceTime = seekStartTime;
    stateRef.current.playbackAudioClockReadyTime = seekStartTime + AUDIO_CLOCK_HANDOFF_DELAY_MS;
    lastPlayedTimeRef.current = newTime;
    hitSoundCursorRef.current = findHitSoundCursor(newTime);
    scheduledHitSoundKeysRef.current.clear();
    
    if (audioRef.current && !isDraggingProgress.current) {
      const audio = audioRef.current;
      const seekRequestId = audioSeekRequestIdRef.current + 1;
      audioSeekRequestIdRef.current = seekRequestId;
      const mediaTargetTime = getMediaTimeFromPlaybackTime(
        newTime,
        offsetInSeconds,
        audioTimingCorrectionRef.current,
      );
      const alignClockAfterSeek = () => {
        audio.removeEventListener('seeked', alignClockAfterSeek);
        if (audioSeekRequestIdRef.current !== seekRequestId || !stateRef.current.isPlaying) {
          return;
        }

        anchorPlaybackClock(getIntendedPlaybackTime(audio, offsetInSeconds, newTime));
      };

      if (stateRef.current.isPlaying) {
        audio.addEventListener('seeked', alignClockAfterSeek, { once: true });
      }

      audio.currentTime = mediaTargetTime;

      if (stateRef.current.isPlaying && !audio.seeking) {
        alignClockAfterSeek();
      }
    }
    if (timeDisplayRef.current && projectData) {
      timeDisplayRef.current.textContent = formatTimelineMeasureProgress(newTime);
    }
    renderPausedTimelineAtFullFps();
  }, [projectData, offsetInSeconds, effectiveGridZoom, formatTimelineMeasureProgress, isPreviewMode, renderPausedTimelineAtFullFps, resetPreviewJudgementState, timedBpmChanges, timelineDuration]);

  const beginProgressSeek = useCallback(() => {
    isDraggingProgress.current = true;
    isProgressBarInteractive.current = true;
    shouldResumeAfterProgressSeekRef.current = stateRef.current.isPlaying;

    if (!stateRef.current.isPlaying) {
      return;
    }

    playRequestIdRef.current += 1;
    clearPlayTimeout();
    stopHitsounds();

    const audio = audioRef.current;
    const seekStartTime = Math.max(0, getPlaybackTimeFromClock(audio, offsetInSeconds));
    audio?.pause();
    cancelEditorUpdate();

    stateRef.current.isPlaying = false;
    stateRef.current.currentTime = seekStartTime;
    stateRef.current.playbackStartTime = seekStartTime;
    stateRef.current.playbackStartPerformanceTime = performance.now();
    stateRef.current.playbackAudioClockReadyTime = 0;
    setIsPlaying(false);
    setCurrentTime(seekStartTime);
    lastPlayedTimeRef.current = seekStartTime;
    hitSoundCursorRef.current = findHitSoundCursor(seekStartTime);
    scheduledHitSoundKeysRef.current.clear();

    if (timeDisplayRef.current && projectData) {
      timeDisplayRef.current.textContent = formatTimelineMeasureProgress(seekStartTime);
    }
    updateProgressBarValue(seekStartTime, true);
  }, [cancelEditorUpdate, formatTimelineMeasureProgress, offsetInSeconds, projectData]);

  const finishProgressSeek = useCallback(async (isStillInteractive: boolean) => {
    isDraggingProgress.current = false;
    isProgressBarInteractive.current = isStillInteractive;

    const shouldResume = shouldResumeAfterProgressSeekRef.current;
    shouldResumeAfterProgressSeekRef.current = false;

    const audio = audioRef.current;
    if (!audio || !projectData) {
      return;
    }

    const seekTime = Math.max(0, stateRef.current.currentTime);
    const playRequestId = playRequestIdRef.current + 1;
    playRequestIdRef.current = playRequestId;
    clearPlayTimeout();
    stopHitsounds();

    await seekAudioToTime(
      audio,
      getMediaTimeFromPlaybackTime(seekTime, offsetInSeconds, audioTimingCorrectionRef.current),
    );

    if (playRequestIdRef.current !== playRequestId) {
      return;
    }

    const calibratedSeekTime = getIntendedPlaybackTime(audio, offsetInSeconds, seekTime);
    anchorPlaybackClock(calibratedSeekTime);

    if (!shouldResume) {
      return;
    }

    const musicContext = setupMusicGain();
    if (musicContext?.state === 'suspended') {
      await musicContext.resume().catch(() => {});
    }
    applyAudioPlaybackSpeed(audio, stateRef.current.playbackSpeed);
    void prepareHitSounds();
    stateRef.current.isPlaying = true;
    setIsPlaying(true);

    await audio.play().catch(() => {});
    if (playRequestIdRef.current === playRequestId && stateRef.current.isPlaying) {
      await waitForAudioPlaybackReady(audio, playRequestId);
    }
    if (playRequestIdRef.current === playRequestId && stateRef.current.isPlaying) {
      syncPlaybackToAudioClock(audio, offsetInSeconds, calibratedSeekTime);
    }
  }, [offsetInSeconds, prepareHitSounds, projectData, setupMusicGain]);

  const stopHitsounds = () => {
    activeHitSounds.current.forEach(source => {
      try {
        source.stop();
      } catch {
        // Source may have already ended.
      }
    });
    activeHitSounds.current.clear();
    scheduledHitSoundKeysRef.current.clear();
  };

  const resetHitSoundScheduler = (time: number, stopActiveSounds = false) => {
    if (stopActiveSounds) {
      stopHitsounds();
    } else {
      scheduledHitSoundKeysRef.current.clear();
    }

    lastPlayedTimeRef.current = time;
    hitSoundCursorRef.current = findHitSoundCursor(time);
  };

  const findHitSoundCursor = (time: number) => {
    const events = hitSoundEventsRef.current;
    let low = 0;
    let high = events.length;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (events[mid].time <= time) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return low;
  };

  const getIntendedPlaybackTime = (
    audio: HTMLAudioElement | null,
    offsetInSeconds: number,
    fallbackTime: number,
  ) => {
    const correction = audioTimingCorrectionRef.current;
    const rawPlaybackTime = audio && correction.isMediaClockReliable && !audio.paused && !audio.seeking
      ? getPlaybackTimeFromMediaTime(audio.currentTime, offsetInSeconds, correction)
      : fallbackTime;
    const clampedPlaybackTime = Math.max(0, rawPlaybackTime);
    const timedChanges = convertBpmChangesToTime(stateRef.current.bpmChanges);
    const intendedBeat = getBeatAtTime(clampedPlaybackTime, timedChanges);
    return getTimeAtBeat(intendedBeat, timedChanges);
  };

  const anchorPlaybackClock = (time: number, now = performance.now()) => {
    stateRef.current.currentTime = time;
    stateRef.current.playbackStartTime = time;
    stateRef.current.playbackStartPerformanceTime = now;
    stateRef.current.playbackAudioClockReadyTime = now + AUDIO_CLOCK_HANDOFF_DELAY_MS;
    resetHitSoundScheduler(time, true);
  };

  const syncPlaybackToAudioClock = (audio: HTMLAudioElement, offsetInSeconds: number, fallbackTime: number) => {
    const now = performance.now();
    anchorPlaybackClock(getIntendedPlaybackTime(audio, offsetInSeconds, fallbackTime), now);
  };

  const waitForAudioPlaybackReady = (audio: HTMLAudioElement, playRequestId: number) => new Promise<void>((resolve) => {
    if (playRequestIdRef.current !== playRequestId || !stateRef.current.isPlaying) {
      resolve();
      return;
    }

    if (!audio.paused && !audio.seeking && audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      requestAnimationFrame(() => resolve());
      return;
    }

    let settled = false;
    let timeoutId: number | undefined;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      audio.removeEventListener('playing', finish);
      audio.removeEventListener('timeupdate', finish);
      audio.removeEventListener('seeked', finish);
      requestAnimationFrame(() => resolve());
    };

    audio.addEventListener('playing', finish);
    audio.addEventListener('timeupdate', finish);
    audio.addEventListener('seeked', finish);
    timeoutId = window.setTimeout(finish, AUDIO_CLOCK_HANDOFF_DELAY_MS);
  });

  const scheduleHitSoundsThrough = useCallback((currentTime: number, activePlaybackSpeed: number) => {
    const events = hitSoundEventsRef.current;
    const lookaheadSeconds = document.hidden
      ? Math.max(HIT_SOUND_LOOKAHEAD_SECONDS, 1.25)
      : HIT_SOUND_LOOKAHEAD_SECONDS;
    const scheduleUntil = currentTime + lookaheadSeconds * activePlaybackSpeed;
    const lastScheduledTime = lastPlayedTimeRef.current;

    if (events.length === 0) {
      lastPlayedTimeRef.current = scheduleUntil;
      return;
    }

    if (currentTime + HIT_SOUND_JUMP_TOLERANCE_SECONDS < lastScheduledTime) {
      hitSoundCursorRef.current = findHitSoundCursor(currentTime);
      scheduledHitSoundKeysRef.current.clear();
    }

    let cursor = hitSoundCursorRef.current;

    while (cursor < events.length && events[cursor].time <= lastScheduledTime) {
      cursor += 1;
    }

    while (cursor < events.length && events[cursor].time <= scheduleUntil) {
      const event = events[cursor];
      if (!scheduledHitSoundKeysRef.current.has(event.key)) {
        scheduledHitSoundKeysRef.current.add(event.key);
        playHitSound(event.soundUrl, (event.time - currentTime) / activePlaybackSpeed);
      }
      cursor += 1;
    }

    hitSoundCursorRef.current = cursor;
    lastPlayedTimeRef.current = scheduleUntil;
  }, [playHitSound]);

  const getPlaybackTimeFromClock = (audio: HTMLAudioElement | null, offsetInSeconds: number) => {
    const now = performance.now();
    const projectedTime = Math.max(
      0,
      stateRef.current.playbackStartTime
        + ((now - stateRef.current.playbackStartPerformanceTime) / 1000) * stateRef.current.playbackSpeed,
    );

    if (
      audio
      && audioTimingCorrectionRef.current.isMediaClockReliable
      && !audio.paused
      && !audio.seeking
      && now >= stateRef.current.playbackAudioClockReadyTime
    ) {
      const audioTime = getPlaybackTimeFromMediaTime(
        audio.currentTime,
        offsetInSeconds,
        audioTimingCorrectionRef.current,
      );
      const timedChanges = convertBpmChangesToTime(stateRef.current.bpmChanges);
      const intendedAudioTime = getTimeAtBeat(getBeatAtTime(audioTime, timedChanges), timedChanges);
      const audioDrift = intendedAudioTime - projectedTime;
      if (Math.abs(audioDrift) > AUDIO_CLOCK_SYNC_TOLERANCE_SECONDS) {
        stateRef.current.playbackStartTime = intendedAudioTime;
        stateRef.current.playbackStartPerformanceTime = now;
        return intendedAudioTime;
      }
    }

    return projectedTime;
  };

  const clearPlayTimeout = () => {
    if (playTimeoutRef.current !== undefined) {
      window.clearTimeout(playTimeoutRef.current);
      playTimeoutRef.current = undefined;
    }
  };

  const changePlaybackSpeed = (nextSpeed: number) => {
    const audio = audioRef.current;
    const now = performance.now();
    const offsetInSeconds = parseFloat(offset.toString()) / 1000;
    const playbackTime = getPlaybackTimeFromClock(audio, offsetInSeconds);

    stateRef.current.playbackSpeed = nextSpeed;
    stateRef.current.playbackStartTime = playbackTime;
    stateRef.current.playbackStartPerformanceTime = now;
    stateRef.current.playbackAudioClockReadyTime = now + AUDIO_CLOCK_HANDOFF_DELAY_MS;

    if (audio) {
      applyAudioPlaybackSpeed(audio, nextSpeed);
    }

    if (stateRef.current.isPlaying && audio && audio.paused && offsetInSeconds > 0) {
      clearPlayTimeout();
      const audioStartTime = playbackTime - offsetInSeconds;
      audioSeekRequestIdRef.current += 1;

      if (audioStartTime < 0) {
        audio.currentTime = audioTimingCorrectionRef.current.mediaStartTime;
        playTimeoutRef.current = window.setTimeout(() => {
          playTimeoutRef.current = undefined;
          if (stateRef.current.isPlaying && audioRef.current) {
            applyAudioPlaybackSpeed(audioRef.current, stateRef.current.playbackSpeed);
            audioRef.current.play().catch(() => {});
          }
        }, (-audioStartTime / nextSpeed) * 1000);
      } else {
        audio.currentTime = getMediaTimeFromPlaybackTime(
          playbackTime,
          offsetInSeconds,
          audioTimingCorrectionRef.current,
        );
        audio.play().catch(() => {});
      }
    }

    setPlaybackSpeed(nextSpeed);
    setIsPlaybackSpeedMenuOpen(false);
  };

  const seekAudioToTime = (audio: HTMLAudioElement, time: number) => new Promise<void>((resolve) => {
    audioSeekRequestIdRef.current += 1;
    const targetTime = Math.max(0, time);
    let settled = false;
    let timeoutId: number | undefined;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      audio.removeEventListener('seeked', finish);
      resolve();
    };

    audio.addEventListener('seeked', finish);
    timeoutId = window.setTimeout(finish, AUDIO_SEEK_TIMEOUT_MS);
    audio.currentTime = targetTime;

    if (!audio.seeking && Math.abs(audio.currentTime - targetTime) <= AUDIO_CLOCK_SYNC_TOLERANCE_SECONDS) {
      finish();
    }
  });

  const loopPlaybackToBeginning = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !projectData || isLoopingPlaybackRef.current) return;

    isLoopingPlaybackRef.current = true;
    const playRequestId = playRequestIdRef.current + 1;
    playRequestIdRef.current = playRequestId;
    clearPlayTimeout();
    stopHitsounds();

    const loopStartTime = 0;
    resetPreviewJudgementState(loopStartTime);
    const now = performance.now();
    const offsetInSeconds = parseFloat(offset.toString()) / 1000;
    const activePlaybackSpeed = stateRef.current.playbackSpeed;
    const sortedChanges = convertBpmChangesToTime(stateRef.current.bpmChanges);

    setCurrentTime(loopStartTime);
    if (shouldUpdateLiveStatsRef.current) {
      setLiveStatsTime(loopStartTime);
    }
    stateRef.current.currentTime = loopStartTime;
    stateRef.current.playbackStartTime = loopStartTime;
    stateRef.current.playbackStartPerformanceTime = now;
    stateRef.current.playbackAudioClockReadyTime = now + AUDIO_CLOCK_HANDOFF_DELAY_MS;
    stateRef.current.isPlaying = true;
    lastPlayedTimeRef.current = loopStartTime;
    hitSoundCursorRef.current = findHitSoundCursor(loopStartTime);
    scheduledHitSoundKeysRef.current.clear();

    if (timeDisplayRef.current) {
      timeDisplayRef.current.textContent = formatTimelineMeasureProgress(loopStartTime);
    }
    updateProgressBarValue(loopStartTime, true);

    applyAudioPlaybackSpeed(audio, activePlaybackSpeed);

    if (offsetInSeconds > 0) {
      audio.pause();
      audio.currentTime = audioTimingCorrectionRef.current.mediaStartTime;
      playTimeoutRef.current = window.setTimeout(() => {
        playTimeoutRef.current = undefined;
        if (playRequestIdRef.current === playRequestId && stateRef.current.isPlaying && audioRef.current) {
          applyAudioPlaybackSpeed(audioRef.current, stateRef.current.playbackSpeed);
          audioRef.current.play()
            .then(() => {
              if (playRequestIdRef.current === playRequestId && stateRef.current.isPlaying && audioRef.current) {
                waitForAudioPlaybackReady(audioRef.current, playRequestId)
                  .then(() => {
                    if (playRequestIdRef.current === playRequestId && stateRef.current.isPlaying && audioRef.current) {
                      syncPlaybackToAudioClock(audioRef.current, offsetInSeconds, loopStartTime + offsetInSeconds);
                    }
                  });
              }
            })
            .catch(() => {});
        }
      }, (offsetInSeconds / activePlaybackSpeed) * 1000);
      isLoopingPlaybackRef.current = false;
      return;
    }

    await seekAudioToTime(
      audio,
      getMediaTimeFromPlaybackTime(loopStartTime, offsetInSeconds, audioTimingCorrectionRef.current),
    );
    if (playRequestIdRef.current === playRequestId && stateRef.current.isPlaying) {
      await audio.play().catch(() => {});
      if (playRequestIdRef.current === playRequestId && stateRef.current.isPlaying) {
        await waitForAudioPlaybackReady(audio, playRequestId);
      }
      if (playRequestIdRef.current === playRequestId && stateRef.current.isPlaying) {
        syncPlaybackToAudioClock(audio, offsetInSeconds, loopStartTime);
      }
    }
    isLoopingPlaybackRef.current = false;
  }, [effectiveGridZoom, formatTimelineMeasureProgress, offset, projectData, resetPreviewJudgementState]);

  const togglePlay = useCallback(async () => {
    if (!audioRef.current || !projectData) return;
    const offsetInSeconds = parseFloat(offset.toString()) / 1000;
    
    if (stateRef.current.isPlaying) {
      playRequestIdRef.current += 1;
      const playbackTime = Math.max(0, getPlaybackTimeFromClock(audioRef.current, offsetInSeconds));
      stopHitsounds();
      audioRef.current.pause();
      clearPlayTimeout();
      cancelEditorUpdate();
      stateRef.current.isPlaying = false;
      setIsPlaying(false);

      const sortedChanges = convertBpmChangesToTime(stateRef.current.bpmChanges);
      const snappedTime = isPreviewMode
        ? playbackTime
        : getTimeAtBeat(
            snapBeatToMeasureDivision(getBeatAtTime(playbackTime, sortedChanges), effectiveGridZoom, sortedChanges),
            sortedChanges,
          );
      resetPreviewJudgementState(snappedTime);
      
      setCurrentTime(snappedTime);
      stateRef.current.currentTime = snappedTime;
      stateRef.current.playbackStartTime = snappedTime;
      stateRef.current.playbackStartPerformanceTime = performance.now();
      stateRef.current.playbackAudioClockReadyTime = 0;
      lastPlayedTimeRef.current = snappedTime;
      hitSoundCursorRef.current = findHitSoundCursor(snappedTime);
      audioRef.current.currentTime = getMediaTimeFromPlaybackTime(
        snappedTime,
        offsetInSeconds,
        audioTimingCorrectionRef.current,
      );
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = formatTimelineMeasureProgress(snappedTime);
      }
      updateProgressBarValue(snappedTime, true);
    } else {
      const playRequestId = playRequestIdRef.current + 1;
      playRequestIdRef.current = playRequestId;
      stopHitsounds();
      const playbackStartTime = Math.max(0, stateRef.current.currentTime);
      resetPreviewJudgementState(playbackStartTime, isPreviewMode);
      const musicContext = setupMusicGain();
      if (musicContext?.state === 'suspended') {
        musicContext.resume().catch(() => {});
      }
      applyAudioPlaybackSpeed(audioRef.current, stateRef.current.playbackSpeed);
      void prepareHitSounds();
      const playbackClockStart = performance.now();
      stateRef.current.isPlaying = true;
      stateRef.current.currentTime = playbackStartTime;
      stateRef.current.playbackStartTime = playbackStartTime;
      stateRef.current.playbackStartPerformanceTime = playbackClockStart;
      stateRef.current.playbackAudioClockReadyTime = playbackClockStart + AUDIO_CLOCK_HANDOFF_DELAY_MS;
      setIsPlaying(true);
      hitSoundCursorRef.current = findHitSoundCursor(playbackStartTime);
      scheduledHitSoundKeysRef.current.clear();
      lastPlayedTimeRef.current = playbackStartTime;
      // Apply offset here. If delay (offset > 0), wait. If advance (offset < 0), seek.
      if (offsetInSeconds > 0) {
        // Delay music: Editor starts at current time, Music starts playing after offsetInSeconds past audio seek point
        const audioStartTime = playbackStartTime - offsetInSeconds;
        if (audioStartTime < 0) {
          audioRef.current.pause();
          audioRef.current.currentTime = audioTimingCorrectionRef.current.mediaStartTime;
          const audioDelaySeconds = -audioStartTime / stateRef.current.playbackSpeed;
          playTimeoutRef.current = window.setTimeout(() => {
            playTimeoutRef.current = undefined;
            if (playRequestIdRef.current === playRequestId && audioRef.current) {
              applyAudioPlaybackSpeed(audioRef.current, stateRef.current.playbackSpeed);
              audioRef.current.play()
                .then(() => {
                  if (playRequestIdRef.current === playRequestId && stateRef.current.isPlaying && audioRef.current) {
                    waitForAudioPlaybackReady(audioRef.current, playRequestId)
                      .then(() => {
                        if (playRequestIdRef.current === playRequestId && stateRef.current.isPlaying && audioRef.current) {
                          syncPlaybackToAudioClock(audioRef.current, offsetInSeconds, offsetInSeconds);
                        }
                      });
                  }
                })
                .catch(() => {});
            }
          }, audioDelaySeconds * 1000);
        } else {
          await seekAudioToTime(
            audioRef.current,
            getMediaTimeFromPlaybackTime(playbackStartTime, offsetInSeconds, audioTimingCorrectionRef.current),
          );
          if (playRequestIdRef.current !== playRequestId) {
            return;
          }
          await audioRef.current.play().catch(() => {});
          if (playRequestIdRef.current !== playRequestId) {
            return;
          }
          await waitForAudioPlaybackReady(audioRef.current, playRequestId);
          if (playRequestIdRef.current !== playRequestId) {
            return;
          }
          syncPlaybackToAudioClock(audioRef.current, offsetInSeconds, playbackStartTime);
        }
      } else {
        // Advance music: Start music early
        await seekAudioToTime(
          audioRef.current,
          getMediaTimeFromPlaybackTime(playbackStartTime, offsetInSeconds, audioTimingCorrectionRef.current),
        );
        if (playRequestIdRef.current !== playRequestId) {
          return;
        }
        await audioRef.current.play().catch(() => {});
        if (playRequestIdRef.current !== playRequestId) {
          return;
        }
        await waitForAudioPlaybackReady(audioRef.current, playRequestId);
        if (playRequestIdRef.current !== playRequestId) {
          return;
        }
        syncPlaybackToAudioClock(audioRef.current, offsetInSeconds, playbackStartTime);
      }
      if (playRequestIdRef.current !== playRequestId) {
        return;
      }
      if (!audioRef.current.paused && !audioRef.current.seeking) {
        syncPlaybackToAudioClock(audioRef.current, offsetInSeconds, playbackStartTime);
      }
    }
  }, [cancelEditorUpdate, effectiveGridZoom, formatTimelineMeasureProgress, prepareHitSounds, projectData, offset, resetPreviewJudgementState, setupMusicGain, isPreviewMode]);

  const restoreOperationSnapshot = useCallback((snapshot: OperationHistorySnapshot) => {
    if (stateRef.current.isPlaying) {
      playRequestIdRef.current += 1;
      stopHitsounds();
      audioRef.current?.pause();
      clearPlayTimeout();

      cancelEditorUpdate();

      stateRef.current.isPlaying = false;
      setIsPlaying(false);
    }

    // Note/change objects are never mutated in place elsewhere (always replaced via new
    // object literals), so snapshot arrays can be reused by reference instead of deep-cloned
    // every note on every undo/redo — this avoids ~100k object allocations per keypress on
    // large charts.
    const restoredNotes = snapshot.notes;
    const restoredBpmChanges = snapshot.bpmChanges;
    const restoredSpeedChanges = snapshot.speedChanges;
    const restoredProjectData = snapshot.projectData ? { ...snapshot.projectData } : null;

    setProjectData(restoredProjectData);
    if (restoredProjectData) {
      setFormData({
        songId: restoredProjectData.songId,
        songName: restoredProjectData.songName,
        songArtist: restoredProjectData.songArtist,
        songBpm: restoredProjectData.songBpm,
        difficulty: restoredProjectData.difficulty,
        songFile: restoredProjectData.songFile,
        songIllustration: restoredProjectData.songIllustration,
      });
    }
    setNotes(restoredNotes);
    setBpmChanges(restoredBpmChanges);
    setSpeedChanges(restoredSpeedChanges);
    setOffset(snapshot.offset);
    setSelectedNoteIds(prev => {
      const restoredNoteIds = new Set(restoredNotes.map(note => note.id));
      return prev.filter(id => restoredNoteIds.has(id));
    });
    setDraggingNoteId(null);
    setSelectionBox(null);
    setHoverPreview(null);
    pendingDragUpdateRef.current = null;
    dragStartNoteRef.current = null;

    stateRef.current.notes = restoredNotes;
    stateRef.current.bpmChanges = restoredBpmChanges;
    stateRef.current.speedChanges = restoredSpeedChanges;
    stateRef.current.offset = snapshot.offset;
    stateRef.current.bpm = restoredProjectData?.bpm || 120;
    renderPausedTimelineAtFullFps();
  }, [cancelEditorUpdate, renderPausedTimelineAtFullFps, setBpmChanges, setNotes, setOffset, setSpeedChanges]);

  const undoLastOperation = useCallback(() => {
    const entry = operationHistory.find(historyEntry => !undoneOperationIds.has(historyEntry.id));
    if (!entry) {
      return;
    }

    restoreOperationSnapshot(entry.before);
    setUndoneOperationIds(prev => {
      const next = new Set(prev);
      next.add(entry.id);
      return next;
    });
    setRedoableOperationIds(prev => [entry.id, ...prev]);
  }, [operationHistory, restoreOperationSnapshot, undoneOperationIds]);

  const redoLastOperation = useCallback(() => {
    const entryId = redoableOperationIds[0];
    const entry = operationHistory.find(historyEntry => historyEntry.id === entryId);
    if (!entry) {
      return;
    }

    restoreOperationSnapshot(entry.after);
    setUndoneOperationIds(prev => {
      const next = new Set(prev);
      next.delete(entry.id);
      return next;
    });
    setRedoableOperationIds(prev => prev.slice(1));
  }, [operationHistory, redoableOperationIds, restoreOperationSnapshot]);

  const selectAdjacentNoteType = useCallback((direction: -1 | 1) => {
    setSelectedNoteType(prev => {
      const availableTypes = getAllowedSelectedNoteTypes();
      const currentIndex = availableTypes.indexOf(prev);
      const nextType = currentIndex === -1
        ? availableTypes[0]
        : availableTypes[
        (currentIndex + direction + availableTypes.length) % availableTypes.length
      ];

      if (nextType === 5) {
        completeCurrentTutorialObjective('noteTypeSelected');
      }

      return nextType;
    });
  }, [completeCurrentTutorialObjective, getAllowedSelectedNoteTypes]);

  useEffect(() => {
    const isOnlyKeyPressed = (e: KeyboardEvent) => (
      !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey
    );

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

      const key = e.key.toLowerCase();
      const canUseAnyKeyboardShortcut = canUseTutorialOperation('keyboardShortcuts');
      const canUseNoteTypeHotkeys = canUseTutorialOperation('noteTypeHotkeys');
      const canUsePlayback = canUseTutorialOperation('playback');
      const canUsePreviewMode = canUseTutorialOperation('previewMode');

      if (!canUseAnyKeyboardShortcut) {
        if (canUseNoteTypeHotkeys && isOnlyKeyPressed(e) && (key === 'a' || key === 'd')) {
          e.preventDefault();
          selectAdjacentNoteType(key === 'a' ? -1 : 1);
          return;
        }

        if (canUsePlayback && isOnlyKeyPressed(e) && (e.code === 'Space' || key === 'p')) {
          e.preventDefault();
          togglePlay();
          return;
        }

        if (canUsePreviewMode && isOnlyKeyPressed(e) && key === 'i') {
          e.preventDefault();
          if (!e.repeat) {
            togglePreviewMode();
          }
          return;
        }

        e.preventDefault();
        return;
      }

      if (isPreviewMode) {
        if (!isOnlyKeyPressed(e)) {
          return;
        }

        if (e.code === 'Space' || e.key.toLowerCase() === 'p') {
          e.preventDefault();
          togglePlay();
        }

        if (e.key.toLowerCase() === 'i') {
          e.preventDefault();
          if (!e.repeat) {
            togglePreviewMode();
          }
        }

        if (e.key.toLowerCase() === 'r') {
          setPixelsPerBeat(prev => Math.min(MAX_PIXELS_PER_BEAT, prev + 20));
        }

        if (e.key.toLowerCase() === 'f') {
          setPixelsPerBeat(prev => Math.max(MIN_PIXELS_PER_BEAT, prev - 20));
        }

        return;
      }

      if (e.key === 'Control') {
        setIsCtrlHeld(true);
      }

      if (e.key === 'Shift') {
        setIsShiftHeld(true);
      }

      if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (!e.repeat) {
          undoLastOperation();
        }
        return;
      }

      if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (!e.repeat) {
          redoLastOperation();
        }
        return;
      }

      if (!e.ctrlKey && !e.altKey && !e.metaKey && e.shiftKey && e.key.toLowerCase() === 'w') {
        setGridZoom(prev => prev + 1);
        return;
      }

      if (!e.ctrlKey && !e.altKey && !e.metaKey && e.shiftKey && e.key.toLowerCase() === 's') {
        setGridZoom(prev => Math.max(0, prev - 1));
        return;
      }

      if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        if (e.repeat) return;

        handleCopySelectedNotes();
        return;
      }

      if (e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        if (e.repeat) return;

        const shouldMirrorPaste = e.shiftKey;
        const copiedNotes = copiedNotesRef.current;
        const pasteTarget = pasteTargetRef.current;
        if (copiedNotes.length === 0 || !pasteTarget) return;

        const baseTimepos = Math.min(...copiedNotes.map(note => note.copiedTimepos));
        const pasteTimepos = getTimeposFromTime(pasteTarget.time);
        const idMap = new Map<number, number>();

        copiedNotes.forEach(note => {
          idMap.set(note.id, nextNoteIdRef.current++);
        });

        const pastedNotes: Note[] = copiedNotes.map(({ copiedTimepos, ...note }) => {
          const nextId = idMap.get(note.id) ?? nextNoteIdRef.current++;
          const nextParentId = note.parentId !== null && idMap.has(note.parentId)
            ? idMap.get(note.parentId) ?? null
            : note.parentId;

          return {
            ...note,
            id: nextId,
            time: getTimeFromTimepos(pasteTimepos + copiedTimepos - baseTimepos),
            lane: shouldMirrorPaste
              ? getMirroredNoteLane(note)
              : note.lane,
            parentId: nextParentId,
          };
        });

        setNotes(prev => [...prev, ...pastedNotes]);
        setSelectedNoteIds(pastedNotes.map(note => note.id));
        setDraggingNoteId(null);
        setSelectionBox(null);
        setHoverPreview(null);
        pendingDragUpdateRef.current = null;
        dragStartNoteRef.current = null;

        recordOperation({
          category: 'note',
          title: pastedNotes.length === 1
            ? shouldMirrorPaste ? text.operations.mirroredAndPastedNote : text.operations.pastedNote
            : shouldMirrorPaste
              ? formatTranslation(text.operations.mirroredAndPastedNotes, { count: pastedNotes.length })
              : formatTranslation(text.operations.pastedNotes, { count: pastedNotes.length }),
          detail: pastedNotes.length === 1
            ? getNoteHistoryDetail(pastedNotes[0])
            : formatTranslation(text.operations.pastedNotesDetail, {
              ids: formatGroupedIds(pastedNotes.map(note => note.id)),
              time: formatTime(pasteTarget.time, timedBpmChanges),
            }),
        });
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteSelectedNotes();
        return;
      }

      if (!isOnlyKeyPressed(e)) return;
      
      if (e.code === 'Space' || e.key.toLowerCase() === 'p') {
        e.preventDefault();
        togglePlay();
      }

      if (e.key.toLowerCase() === 'i') {
        e.preventDefault();
        if (!e.repeat) {
          togglePreviewMode();
        }
      }
      
      if (e.key.toLowerCase() === 'w') {
        setGridZoom(prev => prev + 4);
      }
      
      if (e.key.toLowerCase() === 's') {
        setGridZoom(prev => Math.max(0, prev - 4));
      }

      if (e.key.toLowerCase() === 'r') {
        setPixelsPerBeat(prev => Math.min(MAX_PIXELS_PER_BEAT, prev + 20));
      }

      if (e.key.toLowerCase() === 'f') {
        setPixelsPerBeat(prev => Math.max(MIN_PIXELS_PER_BEAT, prev - 20));
      }

      if (e.key.toLowerCase() === 'b') {
        setSelectedNoteType(10);
      }

      if (e.key.toLowerCase() === 't') {
        setSelectedNoteType(1);
      }

      if (e.key.toLowerCase() === 'a') {
        selectAdjacentNoteType(-1);
      }

      if (e.key.toLowerCase() === 'd') {
        selectAdjacentNoteType(1);
      }

      if (e.key.toLowerCase() === 'q') {
        setNoteWidth(prev => Math.max(1, prev - 1));
      }

      if (e.key.toLowerCase() === 'e') {
        setNoteWidth(prev => Math.min(16, prev + 1));
      }

    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        setIsCtrlHeld(false);
      }

      if (e.key === 'Shift') {
        setIsShiftHeld(false);
      }
    };

    const handleWindowBlur = () => {
      setIsCtrlHeld(false);
      setIsShiftHeld(false);
      setHoverPreview(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [canUseTutorialOperation, getNoteHistoryDetail, getTimeFromTimepos, getTimeposFromTime, handleCopySelectedNotes, handleDeleteSelectedNotes, isPreviewMode, recordOperation, redoLastOperation, selectAdjacentNoteType, timedBpmChanges, togglePlay, togglePreviewMode, undoLastOperation]);

  const drawGrid = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const displayWidth = Math.max(1, Math.floor(rect.width));
    const displayHeight = Math.max(1, Math.floor(rect.height));
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.floor(displayWidth * dpr);
    const pixelHeight = Math.floor(displayHeight * dpr);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = displayWidth;
    const height = displayHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    let objectCount = 0;
    const shouldCountRenderedObjects = shouldCountRenderedObjectsRef.current;
    const countRenderedObject = () => {
      if (shouldCountRenderedObjects) {
        objectCount += 1;
      }
    };

    const drawInvertedTriangle = (
      centerX: number,
      centerY: number,
      sideLength: number,
    ) => {
      const triangleHeight = (Math.sqrt(3) / 2) * sideLength;

      ctx.beginPath();
      ctx.moveTo(centerX - sideLength / 2, centerY - triangleHeight / 2);
      ctx.lineTo(centerX + sideLength / 2, centerY - triangleHeight / 2);
      ctx.lineTo(centerX, centerY + triangleHeight / 2);
      ctx.closePath();
      ctx.fill();
    };

    const drawCircleMark = (
      centerX: number,
      centerY: number,
      radius: number,
    ) => {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.stroke();
    };

    const drawArrow = (
      centerX: number,
      centerY: number,
      direction: 'left' | 'right' | 'up' | 'down',
      size: number,
    ) => {
      const tail = size * 0.85;
      const wing = size * 0.45;

      ctx.beginPath();

      switch (direction) {
        case 'left':
          ctx.moveTo(centerX + tail / 2, centerY);
          ctx.lineTo(centerX - tail / 2, centerY);
          ctx.lineTo(centerX - tail / 2 + wing, centerY - wing);
          ctx.moveTo(centerX - tail / 2, centerY);
          ctx.lineTo(centerX - tail / 2 + wing, centerY + wing);
          break;
        case 'right':
          ctx.moveTo(centerX - tail / 2, centerY);
          ctx.lineTo(centerX + tail / 2, centerY);
          ctx.lineTo(centerX + tail / 2 - wing, centerY - wing);
          ctx.moveTo(centerX + tail / 2, centerY);
          ctx.lineTo(centerX + tail / 2 - wing, centerY + wing);
          break;
        case 'up':
          ctx.moveTo(centerX, centerY + tail / 2);
          ctx.lineTo(centerX, centerY - tail / 2);
          ctx.lineTo(centerX - wing, centerY - tail / 2 + wing);
          ctx.moveTo(centerX, centerY - tail / 2);
          ctx.lineTo(centerX + wing, centerY - tail / 2 + wing);
          break;
        case 'down':
          ctx.moveTo(centerX, centerY - tail / 2);
          ctx.lineTo(centerX, centerY + tail / 2);
          ctx.lineTo(centerX - wing, centerY + tail / 2 - wing);
          ctx.moveTo(centerX, centerY + tail / 2);
          ctx.lineTo(centerX + wing, centerY + tail / 2 - wing);
          break;
      }

      ctx.stroke();
    };

    const drawNoteLetter = (
      centerX: number,
      centerY: number,
      letter: string,
      scale = 1,
    ) => {
      ctx.fillStyle = letter === '?' ? '#000000' : '#ffffff';
      ctx.font = `bold ${12 * scale}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, centerX, centerY);
    };

    const isLoadedPreviewSprite = (image: HTMLImageElement | undefined) => (
      image !== undefined
      && decodedPreviewSpritesRef.current.has(image)
      && image.complete
      && image.naturalWidth > 0
      && image.naturalHeight > 0
    );
    const getPreviewSpriteSource = (image: HTMLImageElement) => (
      previewSpriteBitmapsRef.current.get(image) ?? image
    );

    const getCachedPreviewNoteSprite = (
      noteType: number,
      noteTexture: HTMLImageElement,
      textureWidth: number,
      textureHeight: number,
    ) => {
      const bucketedWidth = Math.max(
        1,
        Math.round(textureWidth / PREVIEW_NOTE_TEXTURE_WIDTH_BUCKET_SIZE) * PREVIEW_NOTE_TEXTURE_WIDTH_BUCKET_SIZE,
      );
      const noteTextureSource = getPreviewSpriteSource(noteTexture);
      const dprBucket = Math.max(1, Math.round(dpr * 100) / 100);
      const cacheKey = `${noteType}:${bucketedWidth}:${dprBucket}`;
      const cachedSprite = previewNoteSpriteCanvasCacheRef.current.get(cacheKey);
      if (cachedSprite) {
        return cachedSprite;
      }

      const sourceCapWidth = Math.min(
        PREVIEW_NOTE_TEXTURE_EDGE_CAP_WIDTH,
        noteTexture.naturalWidth / 2,
      );
      const destinationCapWidth = Math.min(
        sourceCapWidth * PREVIEW_NOTE_TEXTURE_EDGE_CAP_SCALE,
        bucketedWidth / 2,
      );
      const sourceCenterWidth = noteTexture.naturalWidth - sourceCapWidth * 2;
      const destinationCenterWidth = bucketedWidth - destinationCapWidth * 2;
      const sourceSectionOverlap = Math.max(0, Math.min(
        PREVIEW_NOTE_TEXTURE_SECTION_OVERLAP,
        sourceCapWidth,
        sourceCenterWidth / 2,
      ));
      const destinationSectionOverlap = Math.max(0, Math.min(
        PREVIEW_NOTE_TEXTURE_SECTION_OVERLAP,
        destinationCapWidth,
        destinationCenterWidth / 2,
      ));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(bucketedWidth * dprBucket));
      canvas.height = Math.max(1, Math.ceil(textureHeight * dprBucket));

      const spriteCtx = canvas.getContext('2d');
      if (!spriteCtx) {
        return null;
      }

      spriteCtx.setTransform(dprBucket, 0, 0, dprBucket, 0, 0);
      spriteCtx.clearRect(0, 0, bucketedWidth, textureHeight);

      if (sourceCenterWidth <= 0 || destinationCenterWidth <= 0) {
        spriteCtx.drawImage(noteTextureSource, 0, 0, bucketedWidth, textureHeight);
      } else {
        spriteCtx.drawImage(
          noteTextureSource,
          0,
          0,
          sourceCapWidth,
          noteTexture.naturalHeight,
          0,
          0,
          destinationCapWidth,
          textureHeight,
        );
        spriteCtx.drawImage(
          noteTextureSource,
          sourceCapWidth - sourceSectionOverlap,
          0,
          sourceCenterWidth + sourceSectionOverlap * 2,
          noteTexture.naturalHeight,
          destinationCapWidth - destinationSectionOverlap,
          0,
          destinationCenterWidth + destinationSectionOverlap * 2,
          textureHeight,
        );
        spriteCtx.drawImage(
          noteTextureSource,
          noteTexture.naturalWidth - sourceCapWidth,
          0,
          sourceCapWidth,
          noteTexture.naturalHeight,
          destinationCapWidth + destinationCenterWidth,
          0,
          destinationCapWidth,
          textureHeight,
        );
      }

      const nextCachedSprite = {
        canvas,
        width: bucketedWidth,
        height: textureHeight,
      };

      const cache = previewNoteSpriteCanvasCacheRef.current;
      if (cache.size >= PREVIEW_NOTE_TEXTURE_CACHE_MAX_ENTRIES) {
        cache.clear();
      }
      cache.set(cacheKey, nextCachedSprite);

      return nextCachedSprite;
    };

    const drawPreviewNoteSprite = (
      noteType: number,
      centerX: number,
      centerY: number,
      textureWidth: number,
      cacheTextureWidth = textureWidth,
    ) => {
      if (PREVIEW_NOTE_TEXTURE_OMITTED_TYPES.has(noteType)) {
        return null;
      }

      const noteTexture = previewNoteTexturesRef.current.get(noteType);
      if (!isLoadedPreviewSprite(noteTexture)) {
        return null;
      }

      const textureHeight = noteTexture.naturalHeight * PREVIEW_NOTE_TEXTURE_HEIGHT_SCALE;
      const textureX = centerX - textureWidth / 2;
      const textureY = centerY - textureHeight / 2;

      const cachedSprite = getCachedPreviewNoteSprite(noteType, noteTexture, cacheTextureWidth, textureHeight);
      if (!cachedSprite) {
        return null;
      }
      ctx.drawImage(cachedSprite.canvas, textureX, textureY, textureWidth, textureHeight);

      return {
        x: textureX,
        y: textureY,
        width: textureWidth,
        height: textureHeight,
      };
    };

    const drawPreviewArrowSprite = (
      noteType: number,
      centerX: number,
      centerY: number,
    ) => {
      const arrowSprite = previewNoteArrowsRef.current.get(noteType);
      if (!isLoadedPreviewSprite(arrowSprite)) {
        return;
      }

      const arrowCenterY = centerY + PREVIEW_NOTE_ARROW_Y_OFFSET;
      ctx.drawImage(
        getPreviewSpriteSource(arrowSprite),
        centerX - arrowSprite.naturalWidth / 2,
        arrowCenterY - arrowSprite.naturalHeight / 2,
      );
    };

    if (!projectData) return;

    const sortedChanges = timedBpmChanges;
    const offsetInSeconds = parseFloat(offset.toString()) / 1000;

    let time = stateRef.current.currentTime;
    
    if (stateRef.current.isPlaying && audioRef.current) {
      time = getPlaybackTimeFromClock(audioRef.current, offsetInSeconds);
      stateRef.current.currentTime = time;
    }

    if (timeDisplayRef.current) {
      timeDisplayRef.current.textContent = formatTimelineMeasureProgress(time);
    }
    updateProgressBarValue(time);

    const isPreviewPlaybackCanvas = isPreviewMode;
    const shouldUsePreviewSprites = isPreviewPlaybackCanvas && isPreviewSpritesEnabled;
    const currentBeat = isPreviewPlaybackCanvas ? 0 : getBeatAtTime(time, sortedChanges);
    const hitLineY = height - 150;
    const isPreview3DMode = isPreviewPlaybackCanvas && previewDisplayMode === '3d';
    const shouldClipPreviewHoldConnectors = !isPreviewPlaybackCanvas || stateRef.current.isPlaying;
    const activePreviewPlaybackSpeedDistanceIndex = isPreviewPlaybackCanvas
      ? (
          isPreviewPrecomputeEnabled
            ? (
                previewPlaybackSpeedDistanceIndexRef.current.length > 0
                  ? previewPlaybackSpeedDistanceIndexRef.current
                  : previewPlaybackSpeedDistanceIndex
              )
            : previewPlaybackSpeedDistanceIndex
        )
      : previewPlaybackSpeedDistanceIndex;
    const currentPreviewTimepos = isPreviewPlaybackCanvas ? getTimeposFromTime(time) : 0;
    const currentPreviewDistance = isPreviewPlaybackCanvas
      ? getSpeedDistanceAtTimepos(time, activePreviewPlaybackSpeedDistanceIndex)
      : 0;
    const previewDistanceScale = 4 * pixelsPerBeat;
    const previewCameraXOffset = isPreviewPlaybackCanvas && isPreviewCameraMovementEnabled
      ? getPreviewCameraXPositionOffset(previewCameraMovementIntervals, time)
      : 0;
    const preview3DHorizonY = -height * PREVIEW_3D_HORIZON_VIEWPORT_MULTIPLIER;
    const preview3DMaxTravel = Math.max(1, hitLineY - preview3DHorizonY);
    const preview3DFocalDistance = preview3DMaxTravel / PREVIEW_3D_NEAR_SPEED_MULTIPLIER;
    const projectPreviewY = (linearY: number) => {
      if (!isPreview3DMode) {
        return linearY;
      }

      const distanceFromJudgementLine = hitLineY - linearY;
      if (distanceFromJudgementLine <= 0) {
        return linearY;
      }

      const projectedDistance = (
        preview3DMaxTravel
        * distanceFromJudgementLine
        / (distanceFromJudgementLine + preview3DFocalDistance)
      );

      return hitLineY - projectedDistance;
    };
    const previewVisibleMinVisualDistance = -(height - hitLineY + 40) / previewDistanceScale;
    const previewVisibleMaxVisualDistance = (
      isPreview3DMode
        ? preview3DMaxTravel * PREVIEW_3D_FAR_DISTANCE_MULTIPLIER + 40
        : hitLineY + 40
    ) / previewDistanceScale;
    const previewVisibleDistanceRadius = Math.max(
      Math.abs(previewVisibleMinVisualDistance),
      Math.abs(previewVisibleMaxVisualDistance),
    ) / previewMinimumNoteSpeedMagnitude;
    const previewVisibleMinDistance = currentPreviewDistance - previewVisibleDistanceRadius;
    const previewVisibleMaxDistance = currentPreviewDistance + previewVisibleDistanceRadius;

    const getPreviewYFromTimepos = (timepos: number) => projectPreviewY(
      hitLineY - (getSpeedDistanceAtTimepos(getTimeFromTimepos(timepos), activePreviewPlaybackSpeedDistanceIndex) - currentPreviewDistance) * previewDistanceScale
    );

    const getCanvasYFromBeat = (beat: number) => (
      isPreviewPlaybackCanvas
        ? getPreviewYFromTimepos(getTimeposFromTime(getTimeAtBeat(beat, sortedChanges)))
        : hitLineY - (beat - currentBeat) * pixelsPerBeat
    );

    const getCanvasYFromTime = (targetTime: number, fallbackBeat?: number) => (
      isPreviewPlaybackCanvas
        ? getPreviewYFromTimepos(getTimeposFromTime(targetTime))
        : hitLineY - ((fallbackBeat ?? getBeatAtTime(targetTime, sortedChanges)) - currentBeat) * pixelsPerBeat
    );

    const getPreviewYFromNoteDistance = (
      noteDistance: number,
      noteTimepos: number,
      notePlaybackTime: number,
      noteSpeed: PreviewNoteSpeed,
    ) => projectPreviewY(
      hitLineY - getPreviewNoteVisualDistance(
        noteDistance,
        noteTimepos,
        notePlaybackTime,
        noteSpeed,
        currentPreviewDistance,
        currentPreviewTimepos,
        getTimeFromTimepos,
      ) * previewDistanceScale
    );

    const lanes = LANE_COUNT;
    const baseLaneWidth = Math.min(60, width / (lanes + 2));
    const baseGridWidth = lanes * baseLaneWidth;
    const preview3DSideLineSlope = Math.tan((preview3DTiltDegrees * Math.PI) / 180);
    const preview3DGridWidth = Math.min(
      width * PREVIEW_3D_MAX_GRID_WIDTH_RATIO,
      baseGridWidth + preview3DSideLineSlope * preview3DMaxTravel * 2,
    );
    const laneWidth = isPreview3DMode ? preview3DGridWidth / lanes : baseLaneWidth;
    const gridWidth = lanes * laneWidth;
    const startX = (width - gridWidth) / 2;
    const xPositionWidth = laneWidth / 2;
    const cameraOffsetX = -previewCameraXOffset * xPositionWidth;
    const chartStartX = startX + cameraOffsetX;
    const effectivePreview3DSideLineSlope = isPreview3DMode
      ? Math.max(0, Math.min(preview3DSideLineSlope, (gridWidth - baseGridWidth) / (preview3DMaxTravel * 2)))
      : 0;
    const getPreviewLaneLeftX = (y: number) => (
      isPreview3DMode ? chartStartX + (hitLineY - y) * effectivePreview3DSideLineSlope : chartStartX
    );
    const getPreviewLaneRightX = (y: number) => (
      isPreview3DMode ? chartStartX + gridWidth - (hitLineY - y) * effectivePreview3DSideLineSlope : chartStartX + gridWidth
    );
    const getPreviewLaneWidthAtY = (y: number) => getPreviewLaneRightX(y) - getPreviewLaneLeftX(y);
    const getProjectedXPositionWidth = (y: number) => (
      isPreview3DMode ? getPreviewLaneWidthAtY(y) / X_POSITION_COUNT : xPositionWidth
    );
    const getProjectedScale = (y: number) => (
      isPreview3DMode ? getProjectedXPositionWidth(y) / xPositionWidth : 1
    );
    const getProjectedXFromLane = (lane: number, y: number) => (
      isPreview3DMode
        ? getPreviewLaneLeftX(y) + lane * getProjectedXPositionWidth(y)
        : chartStartX + lane * xPositionWidth
    );
    const getProjectedNoteWidth = (noteWidth: number, y: number) => (
      noteWidth * getProjectedXPositionWidth(y)
    );
    const easePreviewAppearOut = (value: number) => 1 - ((1 - value) ** 3);
    const easePreviewAppearIn = (value: number) => value ** 3;
    const getPreview3DAppearModePosition = (
      note: Note,
      targetX: number,
      targetY: number,
      targetNotePixelWidth: number,
      visualDistance: number,
      linearY: number,
    ) => {
      if (note.appearMode === 'L' || note.appearMode === 'R') {
        const linearProgress = Math.max(0, Math.min(1, 1 - Math.max(0, visualDistance) / APPEAR_MODE_ENTRY_DISTANCE));
        const targetLaneLeftX = getPreviewLaneLeftX(targetY);
        const targetLaneWidth = getPreviewLaneWidthAtY(targetY);
        const startX = note.appearMode === 'L'
          ? targetLaneLeftX - targetLaneWidth * APPEAR_MODE_SIDE_ENTRY_MULTIPLIER - targetNotePixelWidth
          : targetLaneLeftX + targetLaneWidth * (1 + APPEAR_MODE_SIDE_ENTRY_MULTIPLIER);

        return {
          x: startX + (targetX - startX) * linearProgress,
          y: targetY,
          scale: 1,
        };
      }

      if (note.appearMode === 'H') {
        const linearProgress = Math.max(0, Math.min(1, 1 - Math.max(0, visualDistance) / APPEAR_MODE_ENTRY_DISTANCE));
        const hProgress = linearProgress ** APPEAR_MODE_H_ENTRY_PROGRESS_EXPONENT;
        const yProgress = easePreviewAppearOut(hProgress);
        const scaleProgress = easePreviewAppearIn(hProgress);
        const startY = projectPreviewY(linearY - APPEAR_MODE_H_FLY_DOWN_PIXELS);
        const startX = getProjectedXFromLane(note.lane, startY);
        const startNotePixelWidth = getProjectedNoteWidth(note.width, startY);
        const targetCenterX = targetX + targetNotePixelWidth / 2;
        const startCenterX = startX + startNotePixelWidth / 2;
        const currentCenterX = startCenterX + (targetCenterX - startCenterX) * yProgress;
        const startScale = targetNotePixelWidth > SNAP_EPSILON
          ? (startNotePixelWidth * APPEAR_MODE_H_START_SCALE) / targetNotePixelWidth
          : APPEAR_MODE_H_START_SCALE;
        const scale = startScale + (1 - startScale) * scaleProgress;

        return {
          x: currentCenterX - targetNotePixelWidth / 2,
          y: startY + (targetY - startY) * yProgress,
          scale,
        };
      }

      return { x: targetX, y: targetY, scale: 1 };
    };
    const getProjectedNoteBodyInset = (notePixelWidth: number, y: number) => (
      Math.min(Math.max(0.5, 2 * getProjectedScale(y)), Math.max(0, notePixelWidth / 2))
    );
    const getProjectedNoteEdges = (note: Note, y: number) => {
      const noteX = getProjectedXFromLane(note.lane, y);
      const notePixelWidth = getProjectedNoteWidth(note.width, y);
      const inset = getProjectedNoteBodyInset(notePixelWidth, y);

      return {
        left: noteX + inset,
        right: noteX + Math.max(inset, notePixelWidth - inset),
      };
    };
    const getProjectedEditorStyleConnectorEdges = (note: Note, y: number) => {
      const noteX = getProjectedXFromLane(note.lane, y);
      const notePixelWidth = getProjectedNoteWidth(note.width, y);
      const inset = Math.min(
        Math.max(
          0,
          getProjectedNoteBodyInset(notePixelWidth, y)
            + EDITOR_STYLE_HOLD_CONNECTOR_EXTRA_INSET_PIXELS * getProjectedScale(y),
        ),
        Math.max(0, notePixelWidth / 2),
      );

      return {
        left: noteX + inset,
        right: noteX + Math.max(inset, notePixelWidth - inset),
      };
    };
    const getInterpolatedConnectorNote = (fromNote: Note, toNote: Note, progress: number): Note => ({
      ...fromNote,
      lane: fromNote.lane + (toNote.lane - fromNote.lane) * progress,
      width: fromNote.width + (toNote.width - fromNote.width) * progress,
    });
    const getClippedPreviewConnector = (
      fromNote: Note,
      fromY: number,
      toNote: Note,
      toY: number,
    ) => {
      if (!isPreview3DMode) {
        return {
          fromNote,
          fromY,
          toNote,
          toY,
        };
      }

      const minY = -PREVIEW_3D_CONNECTOR_CLIP_PADDING;
      const maxY = height + PREVIEW_3D_CONNECTOR_CLIP_PADDING;
      const connectorMinY = Math.min(fromY, toY);
      const connectorMaxY = Math.max(fromY, toY);

      if (connectorMaxY < minY || connectorMinY > maxY) {
        return null;
      }

      if (Math.abs(toY - fromY) <= SNAP_EPSILON) {
        const clippedY = Math.min(maxY, Math.max(minY, fromY));
        return {
          fromNote,
          fromY: clippedY,
          toNote,
          toY: clippedY,
        };
      }

      let startProgress = 0;
      let endProgress = 1;
      const yAtProgress = (progress: number) => fromY + (toY - fromY) * progress;
      const progressAtY = (targetY: number) => (targetY - fromY) / (toY - fromY);

      if (fromY < toY) {
        if (fromY < minY) {
          startProgress = Math.max(startProgress, progressAtY(minY));
        }
        if (toY > maxY) {
          endProgress = Math.min(endProgress, progressAtY(maxY));
        }
      } else {
        if (fromY > maxY) {
          startProgress = Math.max(startProgress, progressAtY(maxY));
        }
        if (toY < minY) {
          endProgress = Math.min(endProgress, progressAtY(minY));
        }
      }

      if (startProgress > endProgress) {
        return null;
      }

      return {
        fromNote: getInterpolatedConnectorNote(fromNote, toNote, startProgress),
        fromY: yAtProgress(startProgress),
        toNote: getInterpolatedConnectorNote(fromNote, toNote, endProgress),
        toY: yAtProgress(endProgress),
      };
    };
    const drawProjectedConnectorQuad = (
      connectorType: number,
      fromNote: Note,
      fromY: number,
      toNote: Note,
      toY: number,
    ) => {
      const drawVerticalOutlineFaces = (
        fromEdges: { left: number; right: number },
        fromEdgeY: number,
        toEdges: { left: number; right: number },
        toEdgeY: number,
      ) => {
        const outlineWidth = HOLD_CONNECTOR_VERTICAL_OUTLINE_WIDTH;
        const outlineColor = getNativeHoldConnectorSpriteColors(connectorType).outline;

        ctx.save();
        ctx.globalAlpha *= HOLD_CONNECTOR_VERTICAL_OUTLINE_ALPHA;
        ctx.fillStyle = outlineColor;
        ctx.beginPath();
        ctx.moveTo(fromEdges.left - outlineWidth, fromEdgeY);
        ctx.lineTo(fromEdges.left, fromEdgeY);
        ctx.lineTo(toEdges.left, toEdgeY);
        ctx.lineTo(toEdges.left - outlineWidth, toEdgeY);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(fromEdges.right, fromEdgeY);
        ctx.lineTo(fromEdges.right + outlineWidth, fromEdgeY);
        ctx.lineTo(toEdges.right + outlineWidth, toEdgeY);
        ctx.lineTo(toEdges.right, toEdgeY);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };

      if (!isPreview3DMode) {
        const fromEdges = getProjectedEditorStyleConnectorEdges(fromNote, fromY);
        const toEdges = getProjectedEditorStyleConnectorEdges(toNote, toY);

        drawVerticalOutlineFaces(fromEdges, fromY, toEdges, toY);
        ctx.beginPath();
        ctx.moveTo(fromEdges.left, fromY);
        ctx.lineTo(fromEdges.right, fromY);
        ctx.lineTo(toEdges.right, toY);
        ctx.lineTo(toEdges.left, toY);
        ctx.closePath();
        ctx.fill();
        return;
      }

      const segmentCount = Math.max(
        1,
        Math.ceil(Math.abs(toY - fromY) / PREVIEW_3D_CONNECTOR_MAX_SEGMENT_HEIGHT),
      );

      for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
        const startProgress = segmentIndex / segmentCount;
        const endProgress = (segmentIndex + 1) / segmentCount;
        const segmentFromNote = getInterpolatedConnectorNote(fromNote, toNote, startProgress);
        const segmentToNote = getInterpolatedConnectorNote(fromNote, toNote, endProgress);
        const segmentFromY = fromY + (toY - fromY) * startProgress;
        const segmentToY = fromY + (toY - fromY) * endProgress;
        const fromEdges = getProjectedEditorStyleConnectorEdges(segmentFromNote, segmentFromY);
        const toEdges = getProjectedEditorStyleConnectorEdges(segmentToNote, segmentToY);

        drawVerticalOutlineFaces(fromEdges, segmentFromY, toEdges, segmentToY);
        ctx.beginPath();
        ctx.moveTo(fromEdges.left, segmentFromY);
        ctx.lineTo(fromEdges.right, segmentFromY);
        ctx.lineTo(toEdges.right, segmentToY);
        ctx.lineTo(toEdges.left, segmentToY);
        ctx.closePath();
        ctx.fill();
      }
    };
    const hiddenPreviewNoteIds = isPreviewMode
      ? hiddenPreviewNoteIdsRef.current
      : null;
    const isPreviewNoteHidden = (note: Note) => Boolean(
      hiddenPreviewNoteIds?.has(note.id)
      || (isPreviewPlaybackCanvas && note.time <= previewHiddenThroughTimeRef.current + SNAP_EPSILON)
    );
    const previewVisibleHoldConnectorSegments = isPreviewPlaybackCanvas
      ? getPreviewConnectorSegmentsInDistanceRange(
          previewHoldConnectorDrawSegments,
          previewVisibleMinDistance,
          previewVisibleMaxDistance,
        )
      : [];
    const activePreviewCameraTiltIntervals = isPreviewPlaybackCanvas
      ? (
          isPreviewPrecomputeEnabled
            ? (
                previewCameraTiltIntervalsRef.current.length > 0
                  ? previewCameraTiltIntervalsRef.current
                  : previewCameraTiltIntervals
              )
            : previewCameraTiltIntervals
        )
      : [];
    const previewCameraTiltState = isPreviewPlaybackCanvas && isPreviewCameraTiltEnabled
      ? getPreviewCameraTiltState(activePreviewCameraTiltIntervals, time)
      : { hasActiveTails: false, rotationRadians: 0, tiltDegrees: 0 };
    const targetPreviewRotationRadians = previewCameraTiltState.rotationRadians;
    const tiltNow = performance.now();
    const previousTiltTimestamp = previewTiltTimestampRef.current || tiltNow;
    const tiltElapsedMs = Math.max(0, tiltNow - previousTiltTimestamp);
    const previewTiltEaseSpeed = previewCameraTiltState.hasActiveTails
      ? PREVIEW_CONNECTOR_TILT_ACTIVE_EASE_SPEED
      : PREVIEW_CONNECTOR_TILT_RETURN_EASE_SPEED;
    const previewTiltEase = isPreviewPlaybackCanvas
      ? getFrameRateStableEase(previewTiltEaseSpeed, tiltElapsedMs)
      : 1;
    previewCameraRotationRadiansRef.current += (
      targetPreviewRotationRadians - previewCameraRotationRadiansRef.current
    ) * previewTiltEase;
    if (!isPreviewPlaybackCanvas || Math.abs(previewCameraRotationRadiansRef.current) < SNAP_EPSILON) {
      previewCameraRotationRadiansRef.current = isPreviewPlaybackCanvas ? 0 : targetPreviewRotationRadians;
    }
    previewTiltTimestampRef.current = tiltNow;
    const previewCameraRotationRadians = previewCameraRotationRadiansRef.current;
    const preview3DCameraCenterX = chartStartX + gridWidth / 2;
    const getPreview3DZoomHeightAtTime = (targetTime: number) => {
      if (preview3DZoomHeightCurve.length === 0) {
        return 0;
      }

      const clampedTime = Math.max(0, Math.min(targetTime, preview3DZoomHeightCurve.length - 1));
      const previousSecond = Math.floor(clampedTime);
      const nextSecond = Math.min(preview3DZoomHeightCurve.length - 1, previousSecond + 1);
      const progress = clampedTime - previousSecond;

      return preview3DZoomHeightCurve[previousSecond]
        + (preview3DZoomHeightCurve[nextSecond] - preview3DZoomHeightCurve[previousSecond]) * progress;
    };
    let targetPreview3DCameraScale = 1;
    let targetPreview3DCameraYOffset = 0;
    if (isPreview3DMode && !hasPinkHoldCameraNotes) {
      const preview3DZoomHeight = getPreview3DZoomHeightAtTime(time);
      const targetPreview3DCameraZ = PREVIEW_3D_CAMERA_BASE_Z + PREVIEW_3D_CAMERA_Z_PER_HEIGHT * preview3DZoomHeight;

      targetPreview3DCameraScale = Math.abs(PREVIEW_3D_CAMERA_BASE_Z) / Math.max(0.001, Math.abs(targetPreview3DCameraZ));
      targetPreview3DCameraYOffset = PREVIEW_3D_CAMERA_Y_OFFSET_PER_HEIGHT * preview3DZoomHeight;
    }
    const previousPreview3DCameraTimestamp = preview3DCameraTimestampRef.current || tiltNow;
    const preview3DCameraDeltaSeconds = Math.max(0, (tiltNow - previousPreview3DCameraTimestamp) / 1000);
    const preview3DCameraEase = isPreview3DMode
      ? Math.min(1, PREVIEW_3D_CAMERA_EASE_PER_SECOND * preview3DCameraDeltaSeconds)
      : 1;

    if (!isPreview3DMode) {
      preview3DCameraScaleRef.current = 1;
      preview3DCameraYOffsetRef.current = 0;
    } else {
      preview3DCameraScaleRef.current += (
        targetPreview3DCameraScale - preview3DCameraScaleRef.current
      ) * preview3DCameraEase;
      preview3DCameraYOffsetRef.current += (
        targetPreview3DCameraYOffset - preview3DCameraYOffsetRef.current
      ) * preview3DCameraEase;
    }
    preview3DCameraTimestampRef.current = tiltNow;
    const preview3DCameraScale = preview3DCameraScaleRef.current;
    const preview3DCameraYOffset = preview3DCameraYOffsetRef.current;
    const applyPreviewCameraTransform = () => {
      if (
        isPreview3DMode
        && (
          Math.abs(preview3DCameraScale - 1) > SNAP_EPSILON
          || Math.abs(preview3DCameraYOffset) > SNAP_EPSILON
        )
      ) {
        ctx.translate(preview3DCameraCenterX, hitLineY + preview3DCameraYOffset);
        ctx.scale(preview3DCameraScale, preview3DCameraScale);
        ctx.translate(-preview3DCameraCenterX, -hitLineY);
      }
      if (isPreviewPlaybackCanvas && Math.abs(previewCameraRotationRadians) > SNAP_EPSILON) {
        const editorCanvasCenterX = chartStartX + gridWidth / 2;
        ctx.translate(editorCanvasCenterX, height / 2);
        ctx.rotate(previewCameraRotationRadians);
        ctx.translate(-editorCanvasCenterX, -height / 2);
      }
    };

    const isTransformedPolygonVisible = (
      points: ReadonlyArray<{ x: number; y: number }>,
      padding = 8,
    ) => {
      const transform = ctx.getTransform();
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;

      for (const point of points) {
        const transformedX = transform.a * point.x + transform.c * point.y + transform.e;
        const transformedY = transform.b * point.x + transform.d * point.y + transform.f;
        minX = Math.min(minX, transformedX);
        maxX = Math.max(maxX, transformedX);
        minY = Math.min(minY, transformedY);
        maxY = Math.max(maxY, transformedY);
      }

      const pixelPadding = padding * dpr;
      return Number.isFinite(minX)
        && maxX >= -pixelPadding
        && minX <= pixelWidth + pixelPadding
        && maxY >= -pixelPadding
        && minY <= pixelHeight + pixelPadding;
    };

    const isTransformedRectVisible = (
      x: number,
      y: number,
      rectWidth: number,
      rectHeight: number,
      padding = 8,
    ) => isTransformedPolygonVisible([
      { x, y },
      { x: x + rectWidth, y },
      { x: x + rectWidth, y: y + rectHeight },
      { x, y: y + rectHeight },
    ], padding);

    ctx.save();
    applyPreviewCameraTransform();

    const getVisibleLaneRange = () => {
      if (isPreview3DMode) {
        return { start: Number.NEGATIVE_INFINITY, end: Number.POSITIVE_INFINITY };
      }

      try {
        const inverseTransform = ctx.getTransform().inverse();
        const viewportCorners = [
          new DOMPoint(0, 0),
          new DOMPoint(pixelWidth, 0),
          new DOMPoint(pixelWidth, pixelHeight),
          new DOMPoint(0, pixelHeight),
        ].map(point => point.matrixTransform(inverseTransform));
        const minX = Math.min(...viewportCorners.map(point => point.x));
        const maxX = Math.max(...viewportCorners.map(point => point.x));
        const lanePadding = 2;

        return {
          start: (minX - chartStartX) / xPositionWidth - lanePadding,
          end: (maxX - chartStartX) / xPositionWidth + lanePadding,
        };
      } catch {
        return { start: Number.NEGATIVE_INFINITY, end: Number.POSITIVE_INFINITY };
      }
    };
    const visibleLaneRange = getVisibleLaneRange();

    // Draw background for the grid area
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    if (isPreview3DMode) {
      ctx.beginPath();
      ctx.moveTo(getPreviewLaneLeftX(0), 0);
      ctx.lineTo(getPreviewLaneRightX(0), 0);
      ctx.lineTo(getPreviewLaneRightX(height), height);
      ctx.lineTo(getPreviewLaneLeftX(height), height);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(isPreviewPlaybackCanvas ? chartStartX : startX, 0, gridWidth, height);
    }

    if (isPreviewMode) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(getPreviewLaneLeftX(0), 0);
      ctx.lineTo(getPreviewLaneLeftX(height), height);
      ctx.moveTo(getPreviewLaneRightX(0), 0);
      ctx.lineTo(getPreviewLaneRightX(height), height);
      ctx.stroke();
      countRenderedObject();
      countRenderedObject();
    }

    // Draw x-position lanes when snap is enabled.
    if (isXPositionGridEnabled && !isPreviewMode) {
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= lanes; i++) {
        const x = startX + i * laneWidth;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        countRenderedObject();
      }
      ctx.stroke();
    }

    // Draw beats
    const beatsVisibleAbove = hitLineY / pixelsPerBeat;
    const beatsVisibleBelow = (height - hitLineY) / pixelsPerBeat;
    
    const startBeat = Math.floor(currentBeat - beatsVisibleBelow);
    const endBeat = Math.ceil(currentBeat + beatsVisibleAbove);
    const noteVisibilityPaddingBeats = 50 / pixelsPerBeat;
    const visibleStartBeat = currentBeat - beatsVisibleBelow - noteVisibilityPaddingBeats;
    const visibleEndBeat = currentBeat + beatsVisibleAbove + noteVisibilityPaddingBeats;
    const pendingDragUpdate = pendingDragUpdateRef.current;
    const pendingDragBeat = pendingDragUpdate && !isPreviewPlaybackCanvas
      ? getBeatAtTime(pendingDragUpdate.time, sortedChanges)
      : null;
    const visiblePreviewDistanceNoteEntries = isPreviewPlaybackCanvas
      ? [
          ...getPreviewNoteEntriesInViewport(
            previewSpatialDistanceEntries,
            previewDistanceEntriesByLaneStart,
            previewDistanceEntriesByLaneEnd,
            previewVisibleMinDistance,
            previewVisibleMaxDistance,
            visibleLaneRange.start,
            visibleLaneRange.end,
          ),
          ...getPreviewNoteEntriesInDistanceRange(
            previewSideEntryDistanceEntries,
            previewVisibleMinDistance,
            previewVisibleMaxDistance,
          ),
        ].sort(comparePreviewNoteRenderEntries)
      : [];
    const visiblePreviewCurveNoteEntries = isPreviewPlaybackCanvas
      ? (
          previewCurveNoteRenderEntryBuckets.buckets
            .get(Math.floor(currentPreviewTimepos / previewCurveNoteRenderEntryBuckets.bucketSize))
            ?.filter((entry) => {
              if (entry.noteSpeed.kind !== 'curve') {
                return false;
              }

              const animationStartTimepos = entry.noteSpeed.keyframes[0]?.time;
              return animationStartTimepos !== undefined
                && currentPreviewTimepos >= animationStartTimepos - SNAP_EPSILON
                && currentPreviewTimepos < entry.timepos - SNAP_EPSILON;
            }) ?? []
        )
      : [];
    const visibleNoteEntries = isPreviewPlaybackCanvas
      ? (
          visiblePreviewCurveNoteEntries.length > 0
            ? [
                ...visiblePreviewDistanceNoteEntries,
                ...visiblePreviewCurveNoteEntries,
              ].sort(comparePreviewNoteRenderEntries)
            : visiblePreviewDistanceNoteEntries
        )
      : getNoteBeatEntriesInViewport(
          noteRenderIndex.noteBeatEntries,
          noteRenderIndex.noteBeatEntriesByLaneStart,
          noteRenderIndex.noteBeatEntriesByLaneEnd,
          visibleStartBeat,
          visibleEndBeat,
          visibleLaneRange.start,
          visibleLaneRange.end,
        );
    const visibleHoldConnectorSegments = isPreviewPlaybackCanvas
      ? previewVisibleHoldConnectorSegments
      : getHoldConnectorSegmentsInRange(
          noteRenderIndex.holdConnectorSegmentsByMinBeat,
          noteRenderIndex.holdConnectorSegmentsByMaxBeat,
          visibleStartBeat,
          visibleEndBeat,
        );

    if (
      !isPreviewPlaybackCanvas &&
      pendingDragUpdate &&
      pendingDragBeat !== null &&
      pendingDragBeat >= visibleStartBeat &&
      pendingDragBeat <= visibleEndBeat &&
      !visibleNoteEntries.some(({ note }) => note.id === pendingDragUpdate.noteId)
    ) {
      const draggedNote = noteRenderIndex.notesById.get(pendingDragUpdate.noteId);
      if (draggedNote) {
        visibleNoteEntries.push({ note: draggedNote, beat: pendingDragBeat });
      }
    }

    const gridLines: Array<{
      beat: number;
      timepos: number | null;
      isMeasureLine: boolean;
      measureNumber: number | null;
    }> = [];

    if (!isPreviewPlaybackCanvas) {
      let currentMeasureBeat = 0;
      let measureCount = 0;

      while (currentMeasureBeat <= endBeat) {
        const beatsPerMeasure = getBeatsPerMeasureAtBeat(currentMeasureBeat, sortedChanges);
        const nextMeasureBeat = currentMeasureBeat + beatsPerMeasure;

        if (currentMeasureBeat >= startBeat) {
          gridLines.push({
            beat: currentMeasureBeat,
            timepos: null,
            isMeasureLine: true,
            measureNumber: measureCount,
          });
        }

        if (effectiveGridZoom > 0) {
          const step = beatsPerMeasure / effectiveGridZoom;

          for (let division = 1; division < effectiveGridZoom; division += 1) {
            const divisionBeat = currentMeasureBeat + division * step;
            if (divisionBeat < startBeat || divisionBeat > endBeat) continue;

            gridLines.push({
              beat: divisionBeat,
              timepos: null,
              isMeasureLine: false,
              measureNumber: null,
            });
          }
        }

        currentMeasureBeat = nextMeasureBeat;
        measureCount++;
      }
    }

    for (const gridLine of gridLines) {
      if (gridLine.beat < 0) continue;
      const y = gridLine.timepos === null
        ? getCanvasYFromBeat(gridLine.beat)
        : getPreviewYFromTimepos(gridLine.timepos);

      if (y < 0 || y > height) continue;

      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(startX + gridWidth, y);

      if (gridLine.isMeasureLine) {
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
      }
      ctx.stroke();
      countRenderedObject();
      
      if (gridLine.isMeasureLine && !isPreviewMode) {
        ctx.fillStyle = '#888';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${gridLine.measureNumber}`, startX - 10, y);
        countRenderedObject();
      }
    }

    if (!isPreviewMode) {
      const indicatorX = startX + gridWidth + 10;
      const indicatorLineHeight = 13;
      const indicatorGroups = new Map<string, {
        anchorY: number;
        speedLabels: string[];
        bpmLabels: string[];
      }>();

      const getIndicatorGroup = (indicatorKey: string, anchorY: number) => {
        const existingGroup = indicatorGroups.get(indicatorKey);
        if (existingGroup) {
          return existingGroup;
        }

        const nextGroup = {
          anchorY,
          speedLabels: [],
          bpmLabels: [],
        };
        indicatorGroups.set(indicatorKey, nextGroup);
        return nextGroup;
      };

      // Queue BPM/Time Signature change indicators on the right side.
      getBeatIndexedEntriesInRange(bpmIndicatorEntries, visibleStartBeat, visibleEndBeat).forEach(({ beat: changeBeat, change, id }) => {
        const y = hitLineY - (changeBeat - currentBeat) * pixelsPerBeat;

        if (y > 0 && y < height) {
          const indicatorKey = getIndicatorKeyAtBeat(changeBeat);
          const bpmLabel = isOfficialChartFormat
            ? `BPM: ${change.bpm} [ID=${id}]`
            : `BPM: ${change.bpm} | ${change.timeSignature} [ID=${id}]`;
          getIndicatorGroup(indicatorKey, y).bpmLabels.push(bpmLabel);
        }
      });

      // Queue speed change indicators above BPM changes at the same time position.
      getBeatIndexedEntriesInRange(speedIndicatorEntries, visibleStartBeat, visibleEndBeat).forEach(({ beat: scBeat, change: sc, id }) => {
        const y = hitLineY - (scBeat - currentBeat) * pixelsPerBeat;

        if (y > 0 && y < height) {
          const indicatorKey = getIndicatorKeyAtBeat(scBeat);
          getIndicatorGroup(indicatorKey, y).speedLabels.push(`SC: ${sc.speedChange}x [ID=${id}]`);
        }
      });

      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      const indicatorStacks = Array.from(indicatorGroups.values()).map(group => {
        const labels = [
          ...group.speedLabels.map(text => ({ text, color: '#06b6d4' })),
          ...group.bpmLabels.map(text => ({ text, color: '#f59e0b' })),
        ];

        const stackHeight = labels.length * indicatorLineHeight;
        const minTop = 2;
        const maxTop = Math.max(minTop, height - stackHeight - 2);
        const centeredTop = group.anchorY - stackHeight / 2;

        return {
          labels,
          height: stackHeight,
          top: areTimingChangeIndicatorsAdjusted
            ? Math.min(Math.max(centeredTop, minTop), maxTop)
            : centeredTop,
        };
      }).filter(stack => stack.labels.length > 0)
        .sort((a, b) => a.top - b.top);

      if (areTimingChangeIndicatorsAdjusted) {
        const indicatorGap = 2;
        const minIndicatorTop = 2;
        const maxIndicatorBottom = height - 2;
        let previousBottom = minIndicatorTop - indicatorGap;

        indicatorStacks.forEach(stack => {
          stack.top = Math.max(stack.top, previousBottom + indicatorGap);
          previousBottom = stack.top + stack.height;
        });

        const overflow = previousBottom - maxIndicatorBottom;
        if (overflow > 0) {
          indicatorStacks.forEach(stack => {
            stack.top -= overflow;
          });

          previousBottom = minIndicatorTop - indicatorGap;
          indicatorStacks.forEach(stack => {
            stack.top = Math.max(stack.top, previousBottom + indicatorGap);
            previousBottom = stack.top + stack.height;
          });
        }
      }

      indicatorStacks.forEach(stack => {
        stack.labels.forEach((label, index) => {
          ctx.fillStyle = label.color;
          ctx.fillText(label.text, indicatorX, stack.top + index * indicatorLineHeight + indicatorLineHeight / 2);
          countRenderedObject();
        });
      });
    }

    const parsedPreviewStartId = curveStartIdInput.trim() === '' ? NaN : Number(curveStartIdInput);
    const parsedPreviewEndId = curveEndIdInput.trim() === '' ? NaN : Number(curveEndIdInput);
    const previewStartNote = Number.isInteger(parsedPreviewStartId)
      ? noteRenderIndex.notesById.get(parsedPreviewStartId) ?? null
      : null;
    const previewEndNote = Number.isInteger(parsedPreviewEndId)
      ? noteRenderIndex.notesById.get(parsedPreviewEndId) ?? null
      : null;
    const previewCurveDensity = Number(curveDensityInput);
    const hasValidPreviewCurveDensity = Number.isInteger(previewCurveDensity) && previewCurveDensity > 0;
    const previewCurveEasingOption = CURVE_EASINGS_BY_ID.get(getCurveEasingId(curveEasingFamily, curveEasingType));
    const shouldDrawCurvePreview = Boolean(
      !isPreviewMode
      && activeLeftPanel === 'curveNotes'
      && curveStartIdInput.trim() !== ''
      && curveEndIdInput.trim() !== ''
      && AVAILABLE_NOTE_TYPES.includes(curveNoteType)
      && hasValidPreviewCurveDensity
      && previewCurveEasingOption
      && !curveIdSelectTarget
      && previewStartNote
      && previewEndNote
      && previewStartNote.id !== previewEndNote.id
    );
    const curvePreviewNotes: Array<Note & { beat: number }> = [];

    if (shouldDrawCurvePreview && previewStartNote && previewEndNote && previewCurveEasingOption) {
      const startCurveBeat = getBeatAtTime(previewStartNote.time, sortedChanges);
      const endCurveBeat = getBeatAtTime(previewEndNote.time, sortedChanges);
      const curveSnapBeats = getCurveSnapBeatsBetween(startCurveBeat, endCurveBeat, previewCurveDensity, sortedChanges);
      const startCenter = previewStartNote.lane + previewStartNote.width / 2;
      const endCenter = previewEndNote.lane + previewEndNote.width / 2;
      const beatSpan = endCurveBeat - startCurveBeat;

      curveSnapBeats.forEach((beat, index) => {
        const progress = beatSpan === 0 ? 0 : (beat - startCurveBeat) / beatSpan;
        const easedProgress = previewCurveEasingOption.ease(progress);
        const interpolatedWidth = previewStartNote.width + (previewEndNote.width - previewStartNote.width) * easedProgress;
        const width = Math.max(1, Number(interpolatedWidth.toFixed(3)));
        const center = startCenter + (endCenter - startCenter) * easedProgress;
        const lane = Number((center - width / 2).toFixed(3));

        curvePreviewNotes.push({
          id: -index - 1,
          time: getTimeAtBeat(beat, sortedChanges),
          lane,
          type: curveNoteType,
          width,
          parentId: null,
          beat,
        });
      });
    }

    const drawHoldConnectorSegment = (segment: typeof visibleHoldConnectorSegments[number]) => {
      if (isPreviewNoteHidden(segment.note)) {
        return;
      }
      const previewSegment = segment as PreviewHoldConnectorSegment;
      if (isPreviewPlaybackCanvas && previewSegment.noteSpeed.kind === 'curve') {
        const animationStartTimepos = previewSegment.noteSpeed.keyframes[0]?.time;
        if (
          currentPreviewTimepos >= previewSegment.noteTimepos - SNAP_EPSILON
          || (
            animationStartTimepos !== undefined
            && currentPreviewTimepos < animationStartTimepos - SNAP_EPSILON
          )
        ) {
          return;
        }
      }

      const noteBeat = segment.note.id === pendingDragUpdate?.noteId && pendingDragBeat !== null
        ? pendingDragBeat
        : segment.noteBeat;
      const parentBeat = segment.parentNote.id === pendingDragUpdate?.noteId && pendingDragBeat !== null
        ? pendingDragBeat
        : segment.parentBeat;

      const note = segment.note.id === pendingDragUpdate?.noteId
        ? { ...segment.note, lane: pendingDragUpdate.lane, time: pendingDragUpdate.time }
        : segment.note;
      const parentNote = segment.parentNote.id === pendingDragUpdate?.noteId
        ? { ...segment.parentNote, lane: pendingDragUpdate.lane, time: pendingDragUpdate.time }
        : segment.parentNote;
      const noteY = isPreviewPlaybackCanvas
        ? getPreviewYFromNoteDistance(
            previewSegment.noteDistance,
            previewSegment.noteTimepos,
            previewSegment.notePlaybackTime,
            previewSegment.noteSpeed,
          )
        : getCanvasYFromTime(note.time, noteBeat);
      const parentY = isPreviewPlaybackCanvas
        ? getPreviewYFromNoteDistance(
            previewSegment.parentDistance,
            previewSegment.parentTimepos,
            previewSegment.parentPlaybackTime,
            previewSegment.parentSpeed,
          )
        : getCanvasYFromTime(parentNote.time, parentBeat);

      if (isPreviewPlaybackCanvas) {
        if (Math.min(noteY, parentY) > height + 40 || Math.max(noteY, parentY) < -40) {
          return;
        }
      } else {
        const minSegmentBeat = Math.min(noteBeat, parentBeat);
        const maxSegmentBeat = Math.max(noteBeat, parentBeat);
        const editorSegment = segment as typeof noteRenderIndex.holdConnectorSegments[number];

        if (!pendingDragUpdate && editorSegment.minBeat > visibleEndBeat) {
          return;
        }

        if (maxSegmentBeat < visibleStartBeat || minSegmentBeat > visibleEndBeat) {
          return;
        }
      }

      const clippedConnector = getClippedPreviewConnector(parentNote, parentY, note, noteY);
      if (!clippedConnector) {
        return;
      }

      const connectorFromEdges = getProjectedEditorStyleConnectorEdges(
        clippedConnector.fromNote,
        clippedConnector.fromY,
      );
      const connectorToEdges = getProjectedEditorStyleConnectorEdges(
        clippedConnector.toNote,
        clippedConnector.toY,
      );
      if (!isTransformedPolygonVisible([
        { x: connectorFromEdges.left, y: clippedConnector.fromY },
        { x: connectorFromEdges.right, y: clippedConnector.fromY },
        { x: connectorToEdges.right, y: clippedConnector.toY },
        { x: connectorToEdges.left, y: clippedConnector.toY },
      ])) {
        return;
      }

      const isPreviewConnectorBeingJudged = isPreviewPlaybackCanvas
        && currentPreviewTimepos >= Math.min(previewSegment.parentTimepos, previewSegment.noteTimepos) - SNAP_EPSILON
        && currentPreviewTimepos <= Math.max(previewSegment.parentTimepos, previewSegment.noteTimepos) + SNAP_EPSILON;
      const shouldClipPreviewConnectorAtJudgementLine = shouldClipPreviewHoldConnectors
        && isPreviewConnectorBeingJudged
        && Math.max(clippedConnector.fromY, clippedConnector.toY) > hitLineY;
      if (
        shouldClipPreviewHoldConnectors
        && isPreviewConnectorBeingJudged
        && Math.min(clippedConnector.fromY, clippedConnector.toY) >= hitLineY
      ) {
        return;
      }

      if (shouldClipPreviewConnectorAtJudgementLine) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(-width, -height, width * 3, hitLineY + height);
        ctx.clip();
      }

      ctx.fillStyle = getNativeHoldConnectorSpriteColors(note.type).body;
      const previousAlpha = ctx.globalAlpha;
      ctx.globalAlpha *= NATIVE_HOLD_CONNECTOR_ALPHA;
      drawProjectedConnectorQuad(
        note.type,
        clippedConnector.fromNote,
        clippedConnector.fromY,
        clippedConnector.toNote,
        clippedConnector.toY,
      );
      ctx.globalAlpha = previousAlpha;
      if (shouldClipPreviewConnectorAtJudgementLine) {
        ctx.restore();
      }
      countRenderedObject();
    };
    // Draw hold connections before note bodies so linked notes render on top.
    for (const segment of visibleHoldConnectorSegments) {
      drawHoldConnectorSegment(segment);
    }

    if (curvePreviewNotes.length > 0 && canTypeHaveParent(curveNoteType) && previewStartNote) {
      const connectorAlpha = 0.15;
      let parentNote = previewStartNote;
      let parentBeat = getBeatAtTime(previewStartNote.time, sortedChanges);

      ctx.save();
      ctx.globalAlpha = connectorAlpha;
      ctx.fillStyle = getConnectorFill(curveNoteType);

      curvePreviewNotes.forEach((previewNote) => {
        const noteY = hitLineY - (previewNote.beat - currentBeat) * pixelsPerBeat;
        const parentY = hitLineY - (parentBeat - currentBeat) * pixelsPerBeat;
        const noteEdges = getProjectedNoteEdges(previewNote, noteY);
        const parentEdges = getProjectedNoteEdges(parentNote, parentY);

        if (
          Math.max(previewNote.beat, parentBeat) >= visibleStartBeat
          && Math.min(previewNote.beat, parentBeat) <= visibleEndBeat
        ) {
          ctx.beginPath();
          ctx.moveTo(parentEdges.left, parentY);
          ctx.lineTo(parentEdges.right, parentY);
          ctx.lineTo(noteEdges.right, noteY);
          ctx.lineTo(noteEdges.left, noteY);
          ctx.closePath();
          ctx.fill();
          countRenderedObject();
        }

        parentNote = previewNote;
        parentBeat = previewNote.beat;
      });

      if (canTypeHaveParent(previewEndNote?.type ?? 0)) {
        const noteBeat = getBeatAtTime(previewEndNote!.time, sortedChanges);
        const noteY = hitLineY - (noteBeat - currentBeat) * pixelsPerBeat;
        const parentY = hitLineY - (parentBeat - currentBeat) * pixelsPerBeat;
        const noteEdges = getProjectedNoteEdges(previewEndNote!, noteY);
        const parentEdges = getProjectedNoteEdges(parentNote, parentY);

        if (
          Math.max(noteBeat, parentBeat) >= visibleStartBeat
          && Math.min(noteBeat, parentBeat) <= visibleEndBeat
        ) {
          ctx.beginPath();
          ctx.moveTo(parentEdges.left, parentY);
          ctx.lineTo(parentEdges.right, parentY);
          ctx.lineTo(noteEdges.right, noteY);
          ctx.lineTo(noteEdges.left, noteY);
          ctx.closePath();
          ctx.fill();
          countRenderedObject();
        }
      }

      ctx.restore();
    }

    const shouldSortPreviewNotes = isPreviewPlaybackCanvas && (isPreview3DMode || isPreviewNoteAppearModeEnabled);
    const orderedVisibleNoteEntries = isPreviewPlaybackCanvas
      ? [...visibleNoteEntries].sort((a, b) => {
          const damageSort = Number(PREVIEW_DAMAGE_NOTE_TYPES.has(b.note.type)) - Number(PREVIEW_DAMAGE_NOTE_TYPES.has(a.note.type));
          if (damageSort !== 0) {
            return damageSort;
          }

          if (!shouldSortPreviewNotes) {
            return 0;
          }

          if (isPreview3DMode) {
            const distanceSort = (b as PreviewNoteRenderEntry).distance - (a as PreviewNoteRenderEntry).distance;
            if (Math.abs(distanceSort) > SNAP_EPSILON) {
              return distanceSort;
            }
          }

          if (!isPreviewNoteAppearModeEnabled) {
            return 0;
          }

          const aIsH = a.note.appearMode === 'H';
          const bIsH = b.note.appearMode === 'H';

          if (aIsH !== bIsH) {
            return aIsH ? 1 : -1;
          }

          if (aIsH && bIsH) {
            return a.note.id - b.note.id;
          }

          return 0;
        })
      : visibleNoteEntries;

    const previewArrowSpriteDraws: Array<{
      noteId: number;
      noteType: number;
      centerX: number;
      centerY: number;
    }> = [];
    const shouldDrawPreviewNoteAsHOverlay = (entry: typeof orderedVisibleNoteEntries[number]) => (
      isPreviewPlaybackCanvas
      && isPreviewNoteAppearModeEnabled
      && entry.note.appearMode === 'H'
    );
    const hPreviewOverlayNoteEntries = orderedVisibleNoteEntries.filter(shouldDrawPreviewNoteAsHOverlay);

    const drawVisibleNoteEntry = (
      entry: typeof orderedVisibleNoteEntries[number],
      arrowSpriteDraws: typeof previewArrowSpriteDraws,
    ) => {
      const { note, beat: noteBeat } = entry;
      if (isPreviewNoteHidden(note)) {
        return;
      }

      const renderedNote = note.id === pendingDragUpdate?.noteId
        ? { ...note, lane: pendingDragUpdate.lane, time: pendingDragUpdate.time }
        : note;
      if (isPreviewPlaybackCanvas && stateRef.current.isPlaying && renderedNote.time <= time + SNAP_EPSILON) {
        previewHiddenThroughTimeRef.current = Math.max(previewHiddenThroughTimeRef.current, time);
        return;
      }

      const renderedNoteBeat = note.id === pendingDragUpdate?.noteId && pendingDragBeat !== null
        ? pendingDragBeat
        : noteBeat;

      const previewEntry = entry as PreviewNoteRenderEntry;
      const previewVisualDistance = isPreviewPlaybackCanvas
        ? getPreviewNoteVisualDistance(
            previewEntry.distance,
            previewEntry.timepos,
            previewEntry.playbackTime,
            previewEntry.noteSpeed,
            currentPreviewDistance,
            currentPreviewTimepos,
            getTimeFromTimepos,
          )
        : 0;
      const previewLinearY = hitLineY - previewVisualDistance * previewDistanceScale;
      const y = isPreviewPlaybackCanvas
        ? projectPreviewY(previewLinearY)
        : getCanvasYFromTime(renderedNote.time, renderedNoteBeat);

      if (isPreviewPlaybackCanvas && previewEntry.noteSpeed.kind === 'curve') {
        const animationStartTimepos = previewEntry.noteSpeed.keyframes[0]?.time;
        if (
          currentPreviewTimepos >= previewEntry.timepos - SNAP_EPSILON
          || (
            animationStartTimepos !== undefined
            && currentPreviewTimepos < animationStartTimepos - SNAP_EPSILON
          )
        ) {
          return;
        }
      }

      if (isPreviewPlaybackCanvas && isPreviewNoteAppearModeEnabled && renderedNote.appearMode === 'P') {
        if (previewVisualDistance > APPEAR_MODE_P_RENDER_DISTANCE) {
          return;
        }
      }

      if (!isPreviewPlaybackCanvas && (renderedNoteBeat < visibleStartBeat || renderedNoteBeat > visibleEndBeat)) {
        return;
      }

      if (isPreviewPlaybackCanvas && PREVIEW_NOTE_TEXTURE_OMITTED_TYPES.has(renderedNote.type)) {
        return;
      }

      const x = getProjectedXFromLane(renderedNote.lane, y);
      const notePixelWidth = getProjectedNoteWidth(renderedNote.width, y);
      const projectedScale = getProjectedScale(y);
      const noteLaneLeftX = getPreviewLaneLeftX(y);
      const noteLaneWidth = getPreviewLaneWidthAtY(y);
      const appearedPosition = isPreviewPlaybackCanvas && isPreviewNoteAppearModeEnabled
        ? (
            isPreview3DMode
              ? getPreview3DAppearModePosition(
                  renderedNote,
                  x,
                  y,
                  notePixelWidth,
                  previewVisualDistance,
                  previewLinearY,
                )
              : getPreviewAppearModePosition(
                  renderedNote,
                  x,
                  y,
                  notePixelWidth,
                  previewVisualDistance,
                  noteLaneLeftX,
                  noteLaneWidth,
                )
          )
        : { x, y, scale: 1 };
      const appearedX = appearedPosition.x;
      const appearedY = appearedPosition.y;
      if (isPreviewPlaybackCanvas && (appearedY < -40 || appearedY > height + 40)) {
        return;
      }

      const appearedScale = appearedPosition.scale;
      const combinedScale = appearedScale * projectedScale;
      const scaledNotePixelWidth = notePixelWidth * appearedScale;
      const noteHeightScale = HOLD_CENTER_TYPE_SET.has(renderedNote.type)
        ? EDITOR_HOLD_CENTER_NOTE_HEIGHT_SCALE
        : 1;
      const scaledNoteHeight = 20 * combinedScale * noteHeightScale;
      const scaledX = appearedX + (notePixelWidth - scaledNotePixelWidth) / 2;
      const noteCenterX = appearedX + notePixelWidth / 2;
      const noteBodyInset = 2 * combinedScale;
      const noteBodyWidth = Math.max(1, scaledNotePixelWidth - noteBodyInset * 2);
      const noteBodyX = scaledX + noteBodyInset;
      const markAvailableWidth = Math.max(1, scaledNotePixelWidth - 12 * combinedScale);
      const shouldDrawTopIndicators = scaledNotePixelWidth > 0;
      if (!isTransformedRectVisible(
        scaledX,
        appearedY - scaledNoteHeight / 2,
        scaledNotePixelWidth,
        scaledNoteHeight,
        16,
      )) {
        return;
      }
      let noteSelectionBounds = {
        x: scaledX,
        y: appearedY - scaledNoteHeight / 2,
        width: scaledNotePixelWidth,
        height: scaledNoteHeight,
      };
      const editorJudgementOverlayElapsed = isEditorJudgementGlowEnabled && !isPreviewPlaybackCanvas && stateRef.current.isPlaying
        ? time - renderedNote.time
        : Number.POSITIVE_INFINITY;
      const editorJudgementOverlayAmount = editorJudgementOverlayElapsed >= 0
        && editorJudgementOverlayElapsed <= EDITOR_NOTE_JUDGEMENT_OVERLAY_DURATION_SECONDS
        ? 1 - editorJudgementOverlayElapsed / EDITOR_NOTE_JUDGEMENT_OVERLAY_DURATION_SECONDS
        : 0;
        
      const previewSpriteCacheWidth = isPreviewPlaybackCanvas
        && isPreviewNoteAppearModeEnabled
        && renderedNote.appearMode === 'H'
        ? notePixelWidth
        : scaledNotePixelWidth;
      const previewSpriteBounds = shouldUsePreviewSprites
        ? drawPreviewNoteSprite(renderedNote.type, noteCenterX, appearedY, scaledNotePixelWidth, previewSpriteCacheWidth)
        : null;

      if (previewSpriteBounds) {
        noteSelectionBounds = previewSpriteBounds;
        if (isLoadedPreviewSprite(previewNoteArrowsRef.current.get(renderedNote.type))) {
          arrowSpriteDraws.push({
            noteId: renderedNote.id,
            noteType: renderedNote.type,
            centerX: noteCenterX,
            centerY: appearedY,
          });
        }
      } else {
        const noteTypeInfo = NOTE_TYPES[renderedNote.type] || UNKNOWN_NOTE_TYPE;
        ctx.fillStyle = noteTypeInfo.color;
        ctx.fillRect(noteBodyX, appearedY - scaledNoteHeight / 2, noteBodyWidth, scaledNoteHeight);
          
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 * combinedScale;
        ctx.strokeRect(noteBodyX, appearedY - scaledNoteHeight / 2, noteBodyWidth, scaledNoteHeight);

        if (editorJudgementOverlayAmount > 0) {
          ctx.save();
          ctx.globalAlpha = EDITOR_NOTE_JUDGEMENT_OVERLAY_MAX_ALPHA * editorJudgementOverlayAmount;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(noteBodyX, appearedY - scaledNoteHeight / 2, noteBodyWidth, scaledNoteHeight);
          ctx.restore();
        }

        const numberedNoteLabel = getEditorNumberedNoteLabel(renderedNote.type);
        if (shouldDrawTopIndicators && numberedNoteLabel) {
          drawNoteLetter(noteCenterX, appearedY, numberedNoteLabel, combinedScale);
        }

        if (shouldDrawTopIndicators && !numberedNoteLabel && (renderedNote.type === 1 || renderedNote.type === 2)) {
          ctx.fillStyle = '#ffffff';
          drawInvertedTriangle(noteCenterX, appearedY, Math.min(markAvailableWidth, 12 * combinedScale));
        }

        if (shouldDrawTopIndicators && renderedNote.type === 9) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2 * combinedScale;
          drawCircleMark(noteCenterX, appearedY, Math.min(markAvailableWidth / 2, 6 * combinedScale));
        }

        if (shouldDrawTopIndicators && HOLD_START_TYPE_SET.has(renderedNote.type)) {
          drawNoteLetter(noteCenterX, appearedY, 'S', combinedScale);
        }

        if (shouldDrawTopIndicators && HOLD_CENTER_TYPE_SET.has(renderedNote.type)) {
          drawNoteLetter(noteCenterX, appearedY, 'C', combinedScale);
        }

        if (shouldDrawTopIndicators && HOLD_END_TYPE_SET.has(renderedNote.type)) {
          drawNoteLetter(noteCenterX, appearedY, 'E', combinedScale);
        }

        if (shouldDrawTopIndicators && !(renderedNote.type in NOTE_TYPES)) {
          drawNoteLetter(noteCenterX, appearedY, '?', combinedScale);
        }

        if (shouldDrawTopIndicators && isArrowFlickType(renderedNote.type)) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2 * combinedScale;

          if (renderedNote.type === 13) {
            drawArrow(noteCenterX, appearedY, 'left', 10 * combinedScale);
          }

          if (renderedNote.type === 14) {
            drawArrow(noteCenterX, appearedY, 'right', 10 * combinedScale);
          }

          if (renderedNote.type === 15) {
            drawArrow(noteCenterX, appearedY, 'up', 10 * combinedScale);
          }

          if (renderedNote.type === 16) {
            drawArrow(noteCenterX, appearedY, 'down', 10 * combinedScale);
          }
        }
      }

      // Highlight if selected
      if (selectedNoteIdSet.has(renderedNote.id)) {
        ctx.setLineDash([]);
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 4;
        ctx.strokeRect(noteSelectionBounds.x, noteSelectionBounds.y - 2, noteSelectionBounds.width, noteSelectionBounds.height + 4);
      } else if (selectedParentNoteIds.has(renderedNote.id)) {
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 3;
        ctx.strokeRect(noteSelectionBounds.x, noteSelectionBounds.y - 2, noteSelectionBounds.width, noteSelectionBounds.height + 4);
        ctx.setLineDash([]);
      }

      if (isPreviewMode) {
        countRenderedObject();
      }

      if (!isPreviewMode) {
        // Draw note ID
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const groupedIdsLabel = noteRenderIndex.groupedIdLabelsByNoteId.get(renderedNote.id) ?? `${renderedNote.id}`;
        if (groupedIdsLabel) {
          ctx.fillText(groupedIdsLabel, noteCenterX, appearedY + 12);
          countRenderedObject();
        }
      }
    };

    // Draw non-H notes first. H appear-mode notes are rendered as a final overlay so they fly above sprites, arrows, and combo.
    orderedVisibleNoteEntries.forEach((entry) => {
      if (shouldDrawPreviewNoteAsHOverlay(entry)) {
        return;
      }

      drawVisibleNoteEntry(entry, previewArrowSpriteDraws);
    });

    previewArrowSpriteDraws
      .sort((a, b) => a.noteId - b.noteId)
      .forEach(({ noteType, centerX, centerY }) => {
        drawPreviewArrowSprite(noteType, centerX, centerY);
      });

    if (curvePreviewNotes.length > 0) {
      const xPositionWidth = laneWidth / 2;
      const previewTypeInfo = NOTE_TYPES[curveNoteType] || UNKNOWN_NOTE_TYPE;
      const fillAlpha = 0.14;
      const outlineAlpha = 0.42;

      curvePreviewNotes.forEach((previewNote) => {
        if (previewNote.beat < visibleStartBeat || previewNote.beat > visibleEndBeat) {
          return;
        }

        const previewY = hitLineY - (previewNote.beat - currentBeat) * pixelsPerBeat;
        const previewX = chartStartX + previewNote.lane * xPositionWidth;
        const previewPixelWidth = xPositionWidth * previewNote.width;
        const previewCenterX = previewX + previewPixelWidth / 2;
        const previewNoteHeight = 20 * (
          HOLD_CENTER_TYPE_SET.has(curveNoteType) ? EDITOR_HOLD_CENTER_NOTE_HEIGHT_SCALE : 1
        );

        ctx.save();
        ctx.globalAlpha = fillAlpha;
        ctx.fillStyle = previewTypeInfo.color;
        ctx.fillRect(previewX + 2, previewY - previewNoteHeight / 2, previewPixelWidth - 4, previewNoteHeight);

        const numberedNoteLabel = getEditorNumberedNoteLabel(curveNoteType);
        if (numberedNoteLabel) {
          drawNoteLetter(previewCenterX, previewY, numberedNoteLabel);
        }

        if (!numberedNoteLabel && (curveNoteType === 1 || curveNoteType === 2)) {
          ctx.fillStyle = '#ffffff';
          drawInvertedTriangle(
            previewCenterX,
            previewY,
            Math.min(previewPixelWidth - 12, 12),
          );
        }

        if (curveNoteType === 9) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          drawCircleMark(
            previewCenterX,
            previewY,
            Math.min((previewPixelWidth - 12) / 2, 6),
          );
        }

        if (HOLD_START_TYPE_SET.has(curveNoteType)) {
          drawNoteLetter(previewCenterX, previewY, 'S');
        }

        if (HOLD_CENTER_TYPE_SET.has(curveNoteType)) {
          drawNoteLetter(previewCenterX, previewY, 'C');
        }

        if (HOLD_END_TYPE_SET.has(curveNoteType)) {
          drawNoteLetter(previewCenterX, previewY, 'E');
        }

        if (!(curveNoteType in NOTE_TYPES)) {
          drawNoteLetter(previewCenterX, previewY, '?');
        }

        if (isArrowFlickType(curveNoteType)) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;

          if (curveNoteType === 13) {
            drawArrow(previewCenterX, previewY, 'left', 10);
          }

          if (curveNoteType === 14) {
            drawArrow(previewCenterX, previewY, 'right', 10);
          }

          if (curveNoteType === 15) {
            drawArrow(previewCenterX, previewY, 'up', 10);
          }

          if (curveNoteType === 16) {
            drawArrow(previewCenterX, previewY, 'down', 10);
          }
        }

        ctx.globalAlpha = outlineAlpha;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(previewX + 2, previewY - previewNoteHeight / 2, previewPixelWidth - 4, previewNoteHeight);
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(previewX, previewY - 12, previewPixelWidth, 24);
        ctx.restore();
        countRenderedObject();
      });
    }

    const drawPreviewNote = (
      previewX: number,
      previewY: number,
      previewPixelWidth: number,
      previewType: number,
      fillAlpha: number,
      outlineAlpha: number,
    ) => {
      const previewCenterX = previewX + previewPixelWidth / 2;
      const previewTypeInfo = NOTE_TYPES[previewType] || UNKNOWN_NOTE_TYPE;
      const shouldDrawTopIndicators = previewPixelWidth > 0;
      const previewBodyWidth = Math.max(1, previewPixelWidth - 4);
      const previewNoteHeight = 20 * (
        HOLD_CENTER_TYPE_SET.has(previewType) ? EDITOR_HOLD_CENTER_NOTE_HEIGHT_SCALE : 1
      );

      ctx.save();
      ctx.globalAlpha = fillAlpha;
      ctx.fillStyle = previewTypeInfo.color;
      ctx.fillRect(previewX + 2, previewY - previewNoteHeight / 2, previewBodyWidth, previewNoteHeight);
      const numberedNoteLabel = getEditorNumberedNoteLabel(previewType);
      if (shouldDrawTopIndicators && numberedNoteLabel) {
        drawNoteLetter(previewCenterX, previewY, numberedNoteLabel);
      }
      if (shouldDrawTopIndicators && !numberedNoteLabel && (previewType === 1 || previewType === 2)) {
        ctx.fillStyle = '#ffffff';
        drawInvertedTriangle(
          previewCenterX,
          previewY,
          Math.min(previewPixelWidth - 12, 12),
        );
      }
      if (shouldDrawTopIndicators && previewType === 9) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        drawCircleMark(
          previewCenterX,
          previewY,
          Math.min((previewPixelWidth - 12) / 2, 6),
        );
      }
      if (shouldDrawTopIndicators && HOLD_START_TYPE_SET.has(previewType)) {
        drawNoteLetter(previewCenterX, previewY, 'S');
      }
      if (shouldDrawTopIndicators && HOLD_CENTER_TYPE_SET.has(previewType)) {
        drawNoteLetter(previewCenterX, previewY, 'C');
      }
      if (shouldDrawTopIndicators && HOLD_END_TYPE_SET.has(previewType)) {
        drawNoteLetter(previewCenterX, previewY, 'E');
      }
      if (shouldDrawTopIndicators && !(previewType in NOTE_TYPES)) {
        drawNoteLetter(previewCenterX, previewY, '?');
      }
      if (shouldDrawTopIndicators && isArrowFlickType(previewType)) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;

        if (previewType === 13) {
          drawArrow(previewCenterX, previewY, 'left', 10);
        }

        if (previewType === 14) {
          drawArrow(previewCenterX, previewY, 'right', 10);
        }

        if (previewType === 15) {
          drawArrow(previewCenterX, previewY, 'up', 10);
        }

        if (previewType === 16) {
          drawArrow(previewCenterX, previewY, 'down', 10);
        }
      }
      ctx.globalAlpha = outlineAlpha;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(previewX + 2, previewY - previewNoteHeight / 2, previewBodyWidth, previewNoteHeight);
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#ffffff';
      ctx.strokeRect(previewX, previewY - 12, Math.max(1, previewPixelWidth), 24);
      ctx.restore();
      countRenderedObject();
    };

    if (hoverPreview && !isCtrlHeld && !isShiftHeld) {
      const xPositionWidth = laneWidth / 2;
      const copiedNotes = copiedNotesRef.current;

      if (copiedNotes.length > 0) {
        const baseTimepos = Math.min(...copiedNotes.map(note => note.copiedTimepos));
        const previewTimepos = getTimeposFromTime(hoverPreview.time);
        const copiedPreviewNotes = copiedNotes.map((note) => {
          const previewBeat = getBeatAtTime(
            getTimeFromTimepos(previewTimepos + note.copiedTimepos - baseTimepos),
            sortedChanges,
          );

          return {
            note,
            previewBeat,
            previewY: hitLineY - (previewBeat - currentBeat) * pixelsPerBeat,
          };
        });
        const copiedPreviewNoteById = new Map(copiedPreviewNotes.map(entry => [entry.note.id, entry]));

        ctx.save();
        ctx.globalAlpha = 0.08;
        copiedPreviewNotes.forEach(({ note, previewY }) => {
          if (!HOLD_CONNECTOR_TYPE_SET.has(note.type) || HOLD_START_TYPE_SET.has(note.type) || note.parentId === null) {
            return;
          }

          const parentEntry = copiedPreviewNoteById.get(note.parentId);
          if (!parentEntry) {
            return;
          }

          const parentNote = parentEntry.note;
          const parentY = parentEntry.previewY;
          if (Math.min(previewY, parentY) > height + 50 || Math.max(previewY, parentY) < -50) {
            return;
          }

          const noteWidthPx = xPositionWidth * note.width;
          const parentWidthPx = xPositionWidth * parentNote.width;
          const noteLeftX = chartStartX + note.lane * xPositionWidth + 2;
          const noteRightX = noteLeftX + noteWidthPx - 4;
          const parentLeftX = chartStartX + parentNote.lane * xPositionWidth + 2;
          const parentRightX = parentLeftX + parentWidthPx - 4;

          ctx.fillStyle = getConnectorFill(note.type);
          ctx.beginPath();
          ctx.moveTo(parentLeftX, parentY);
          ctx.lineTo(parentRightX, parentY);
          ctx.lineTo(noteRightX, previewY);
          ctx.lineTo(noteLeftX, previewY);
          ctx.closePath();
          ctx.fill();
          countRenderedObject();
        });
        ctx.restore();

        copiedPreviewNotes.forEach(({ note, previewY }) => {
          if (previewY <= -50 || previewY >= height + 50) {
            return;
          }

          drawPreviewNote(
            chartStartX + note.lane * xPositionWidth,
            previewY,
            xPositionWidth * note.width,
            note.type,
            0.18,
            0.5,
          );
        });
      } else {
        const previewBeat = getBeatAtTime(hoverPreview.time, sortedChanges);
        const previewY = hitLineY - (previewBeat - currentBeat) * pixelsPerBeat;

        if (previewY > -50 && previewY < height + 50) {
          drawPreviewNote(
            chartStartX + hoverPreview.lane * xPositionWidth,
            previewY,
            xPositionWidth * noteWidth,
            selectedNoteType,
            0.18,
            0.5,
          );
        }
      }
    }

    // Draw selection box
    if (selectionBox) {
      const xPositionWidth = laneWidth / 2;
      const startSelectionX = chartStartX + selectionBox.startXPosition * xPositionWidth;
      const endSelectionX = chartStartX + selectionBox.endXPosition * xPositionWidth;
      const startSelectionY = hitLineY - (selectionBox.startBeat - currentBeat) * pixelsPerBeat;
      const endSelectionY = hitLineY - (selectionBox.endBeat - currentBeat) * pixelsPerBeat;

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(
        Math.min(startSelectionX, endSelectionX),
        Math.min(startSelectionY, endSelectionY),
        Math.abs(endSelectionX - startSelectionX),
        Math.abs(endSelectionY - startSelectionY)
      );
      ctx.setLineDash([]);
      countRenderedObject();
    }

    const activePreviewHitFxEvents = isPreviewPlaybackCanvas && isPreviewHitFxEnabled && previewHitFxEventsRef.current.length > 0
      ? previewHitFxEventsRef.current.filter((effect) => {
          const elapsed = time - effect.time;
          return elapsed >= 0 && elapsed <= PREVIEW_HIT_FX_DURATION_SECONDS;
        })
      : [];
    if (previewHitFxEventsRef.current.length !== activePreviewHitFxEvents.length) {
      previewHitFxEventsRef.current = activePreviewHitFxEvents;
    }

    const getCachedPreviewHitFxFrame = (
      kind: 'circle' | 'slash',
      notePixelWidth: number,
      scale: number,
      progress: number,
      options: { color?: string; direction?: 'horizontal' | 'vertical' },
    ) => {
      const frameIndex = Math.max(
        0,
        Math.min(PREVIEW_HIT_FX_FRAME_COUNT - 1, Math.floor(progress * PREVIEW_HIT_FX_FRAME_COUNT)),
      );
      const frameProgress = frameIndex / Math.max(1, PREVIEW_HIT_FX_FRAME_COUNT - 1);
      const dprBucket = Math.max(1, Math.round(dpr * 100) / 100);
      const widthBucket = Math.max(1, Math.round(notePixelWidth));
      const scaleBucket = Math.max(1, Math.round(scale * 100) / 100);
      const color = options.color ?? PREVIEW_HIT_FX_GOLD;
      const direction = options.direction ?? 'horizontal';
      const cacheKey = [
        kind,
        color,
        direction,
        widthBucket,
        scaleBucket,
        dprBucket,
        frameIndex,
      ].join(':');
      const cachedFrame = previewHitFxCanvasCacheRef.current.get(cacheKey);
      if (cachedFrame) {
        return cachedFrame;
      }

      const alpha = kind === 'circle'
        ? (1 - frameProgress) ** 1.4
        : (1 - frameProgress) ** 1.25;
      const easeOut = 1 - ((1 - frameProgress) ** 3);
      const lineWidth = kind === 'circle'
        ? Math.max(1.5, 4.5 * scaleBucket * (1 - frameProgress))
        : Math.max(2, 12 * scaleBucket * (1 - frameProgress));
      const maxCircleRadius = Math.max(24 * scaleBucket, widthBucket * 0.55) * 1.28;
      const radius = kind === 'circle'
        ? maxCircleRadius * (0.32 + easeOut * 0.68)
        : maxCircleRadius;
      const slashLength = Math.max(82 * scaleBucket, widthBucket * 1.9) * (0.88 + easeOut * 0.34);
      const halfLength = slashLength / 2;
      const padding = kind === 'circle'
        ? 24 * scaleBucket + lineWidth
        : 28 * scaleBucket + lineWidth;
      const logicalWidth = Math.ceil(kind === 'circle'
        ? (radius + padding) * 2
        : direction === 'horizontal'
          ? (halfLength + padding) * 2
          : (lineWidth + padding) * 2);
      const logicalHeight = Math.ceil(kind === 'circle'
        ? (radius + padding) * 2
        : direction === 'horizontal'
          ? (lineWidth + padding) * 2
          : (halfLength + padding) * 2);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(logicalWidth * dprBucket));
      canvas.height = Math.max(1, Math.ceil(logicalHeight * dprBucket));

      const hitFxCtx = canvas.getContext('2d');
      if (!hitFxCtx) {
        return null;
      }

      const centerX = logicalWidth / 2;
      const centerY = logicalHeight / 2;
      hitFxCtx.setTransform(dprBucket, 0, 0, dprBucket, 0, 0);
      hitFxCtx.clearRect(0, 0, logicalWidth, logicalHeight);
      hitFxCtx.globalCompositeOperation = 'lighter';

      if (kind === 'circle') {
        hitFxCtx.globalAlpha = alpha;
        hitFxCtx.strokeStyle = color;
        hitFxCtx.lineWidth = lineWidth;
        hitFxCtx.shadowColor = color;
        hitFxCtx.shadowBlur = 18 * scaleBucket * alpha;
        hitFxCtx.beginPath();
        hitFxCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        hitFxCtx.stroke();
      } else {
        const x1 = direction === 'horizontal' ? centerX - halfLength : centerX;
        const y1 = direction === 'horizontal' ? centerY : centerY - halfLength;
        const x2 = direction === 'horizontal' ? centerX + halfLength : centerX;
        const y2 = direction === 'horizontal' ? centerY : centerY + halfLength;

        hitFxCtx.lineCap = 'round';
        hitFxCtx.globalAlpha = alpha;
        hitFxCtx.strokeStyle = PREVIEW_HIT_FX_GOLD;
        hitFxCtx.lineWidth = lineWidth;
        hitFxCtx.shadowColor = PREVIEW_HIT_FX_GOLD;
        hitFxCtx.shadowBlur = 24 * scaleBucket * alpha;
        hitFxCtx.beginPath();
        hitFxCtx.moveTo(x1, y1);
        hitFxCtx.lineTo(x2, y2);
        hitFxCtx.stroke();
        hitFxCtx.globalAlpha = alpha * 0.78;
        hitFxCtx.strokeStyle = PREVIEW_HIT_FX_WHITE;
        hitFxCtx.lineWidth = Math.max(1.5, lineWidth * 0.28);
        hitFxCtx.shadowBlur = 10 * scaleBucket * alpha;
        hitFxCtx.beginPath();
        hitFxCtx.moveTo(x1, y1);
        hitFxCtx.lineTo(x2, y2);
        hitFxCtx.stroke();
      }

      const nextCachedFrame = {
        canvas,
        width: logicalWidth,
        height: logicalHeight,
      };
      const cache = previewHitFxCanvasCacheRef.current;
      if (cache.size >= PREVIEW_HIT_FX_CACHE_MAX_ENTRIES) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined) {
          cache.delete(oldestKey);
        }
      }
      cache.set(cacheKey, nextCachedFrame);

      return nextCachedFrame;
    };

    const drawCachedPreviewHitFxFrame = (
      centerX: number,
      centerY: number,
      cachedFrame: PreviewCachedHitFxFrame | null,
    ) => {
      if (!cachedFrame) {
        return false;
      }

      const x = centerX - cachedFrame.width / 2;
      const y = centerY - cachedFrame.height / 2;

      if (
        x + cachedFrame.width < 0
        || x > width
        || y + cachedFrame.height < 0
        || y > height
      ) {
        return false;
      }

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(cachedFrame.canvas, x, y, cachedFrame.width, cachedFrame.height);
      ctx.restore();
      return true;
    };

    const drawPreviewHitCircleFx = (
      centerX: number,
      centerY: number,
      notePixelWidth: number,
      scale: number,
      progress: number,
      color: string,
    ) => {
      return drawCachedPreviewHitFxFrame(
        centerX,
        centerY,
        getCachedPreviewHitFxFrame('circle', notePixelWidth, scale, progress, { color }),
      );
    };

    const drawPreviewHitSlashFx = (
      centerX: number,
      centerY: number,
      notePixelWidth: number,
      scale: number,
      progress: number,
      direction: 'horizontal' | 'vertical',
    ) => {
      return drawCachedPreviewHitFxFrame(
        centerX,
        centerY,
        getCachedPreviewHitFxFrame('slash', notePixelWidth, scale, progress, { direction }),
      );
    };

    activePreviewHitFxEvents.forEach((effect) => {
      const progress = (time - effect.time) / PREVIEW_HIT_FX_DURATION_SECONDS;
      const effectScale = getProjectedScale(hitLineY);
      const effectPixelWidth = getProjectedNoteWidth(PREVIEW_HIT_FX_REFERENCE_WIDTH, hitLineY);
      const notePixelWidth = getProjectedNoteWidth(effect.width, hitLineY);
      const centerX = getProjectedXFromLane(effect.lane, hitLineY) + notePixelWidth / 2;
      let didDrawEffect = false;

      if (effect.type === 9 || effect.type === 13 || effect.type === 14) {
        didDrawEffect = drawPreviewHitSlashFx(centerX, hitLineY, effectPixelWidth, effectScale, progress, 'horizontal');
      } else if (effect.type === 15 || effect.type === 16) {
        didDrawEffect = drawPreviewHitSlashFx(centerX, hitLineY, effectPixelWidth, effectScale, progress, 'vertical');
      } else {
        const color = effect.type === 1 || effect.type === 2 || effect.type === 25 || effect.type === 26 || effect.type === 27
          ? PREVIEW_HIT_FX_GOLD
          : PREVIEW_HIT_FX_WHITE;
        didDrawEffect = drawPreviewHitCircleFx(centerX, hitLineY, effectPixelWidth, effectScale, progress, color);
      }

      if (didDrawEffect) {
        countRenderedObject();
      }
    });

    // Draw hit line
    const hitLineStartX = !isPreviewPlaybackCanvas && isOutOfBoundsPlacementEnabled
      ? 0
      : isPreview3DMode
        ? getPreviewLaneLeftX(hitLineY)
        : isPreviewPlaybackCanvas
          ? chartStartX
          : startX;
    const hitLineEndX = !isPreviewPlaybackCanvas && isOutOfBoundsPlacementEnabled
      ? width
      : isPreview3DMode
        ? getPreviewLaneRightX(hitLineY)
        : (isPreviewPlaybackCanvas ? chartStartX : startX) + gridWidth;

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hitLineStartX, hitLineY);
    ctx.lineTo(hitLineEndX, hitLineY);
    ctx.stroke();
    
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
    countRenderedObject();
    ctx.restore();

    if (isPreviewMode) {
      const activePreviewComboTimes = isPreviewPrecomputeEnabled && previewComboTimesRef.current.length > 0
        ? previewComboTimesRef.current
        : previewComboTimes;
      const previewCanvasCombo = getPreviewComboAtTime(activePreviewComboTimes, time);

      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = '700 32px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 8;
      ctx.fillText(`${previewCanvasCombo}`, chartStartX + gridWidth / 2, 80);
      ctx.restore();
      countRenderedObject();
    }

    if (hPreviewOverlayNoteEntries.length > 0) {
      const hPreviewArrowSpriteDraws: typeof previewArrowSpriteDraws = [];

      ctx.save();
      applyPreviewCameraTransform();
      hPreviewOverlayNoteEntries.forEach((entry) => {
        drawVisibleNoteEntry(entry, hPreviewArrowSpriteDraws);
      });

      hPreviewArrowSpriteDraws
        .sort((a, b) => a.noteId - b.noteId)
        .forEach(({ noteType, centerX, centerY }) => {
          drawPreviewArrowSprite(noteType, centerX, centerY);
        });
      ctx.restore();
    }

    renderedObjectsRef.current = objectCount;

    // Deliberately omits `notes` from deps: drawGrid only ever reads note data through
    // `noteRenderIndex` (and the other derived preview arrays below), which already gets a new
    // identity whenever `notes` changes. Including `notes` directly caused this callback (and the
    // RAF-driven animation effect subscribed to it) to churn on every edit for no rendering benefit.
  }, [activeLeftPanel, areTimingChangeIndicatorsAdjusted, bpmIndicatorEntries, copiedNotesPreviewVersion, curveDensityInput, curveEasingFamily, curveEasingType, curveEndIdInput, curveIdSelectTarget, curveNoteType, curveStartIdInput, effectiveGridZoom, formatTimelineMeasureProgress, getTimeFromTimepos, getTimeposFromTime, hasPinkHoldCameraNotes, pixelsPerBeat, projectData, isEditorJudgementGlowEnabled, isOfficialChartFormat, isOutOfBoundsPlacementEnabled, isPreviewMode, isPreviewCameraMovementEnabled, isPreviewCameraTiltEnabled, isPreviewHitFxEnabled, isPreviewNoteAppearModeEnabled, isPreviewPrecomputeEnabled, isPreviewSpritesEnabled, isXPositionGridEnabled, hoverPreview, isCtrlHeld, isShiftHeld, noteWidth, preview3DTiltDegrees, preview3DZoomHeightCurve, previewCameraMovementIntervals, previewCameraTiltIntervals, previewComboTimes, previewCurveNoteRenderEntryBuckets, previewDisplayMode, previewDistanceEntriesByLaneEnd, previewDistanceEntriesByLaneStart, previewDistanceIndexedNoteRenderEntries, previewHoldConnectorDrawSegments, previewMinimumNoteSpeedMagnitude, previewNoteRenderEntries, previewNoteSpriteLoadVersion, previewPlaybackSpeedDistanceIndex, previewSideEntryDistanceEntries, previewSpatialDistanceEntries, selectedNoteIdSet, selectedParentNoteIds, selectedNoteType, selectionBox, speedDistanceIndex, speedIndicatorEntries, timedBpmChanges, noteRenderIndex, offset]);

  const shouldAnimateCanvas = isPlaying || isPausedTimelineRendering;

  const updateRenderedObjectsDisplay = useCallback((force = false) => {
    if (!shouldCountRenderedObjectsRef.current) {
      return;
    }

    const now = performance.now();
    if (!force && now - renderedObjectsDisplayLastUpdateRef.current < PERFORMANCE_STATS_UPDATE_INTERVAL_MS) {
      return;
    }

    renderedObjectsDisplayLastUpdateRef.current = now;
    setRenderedObjects(renderedObjectsRef.current);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') {
      return;
    }

    const drawResizedCanvas = () => {
      if (resizeRenderFrameRef.current !== undefined) {
        window.cancelAnimationFrame(resizeRenderFrameRef.current);
      }

      resizeRenderFrameRef.current = window.requestAnimationFrame(() => {
        resizeRenderFrameRef.current = undefined;
        drawGrid();
        updateRenderedObjectsDisplay(true);
      });
    };

    const resizeObserver = new ResizeObserver(drawResizedCanvas);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (resizeRenderFrameRef.current !== undefined) {
        window.cancelAnimationFrame(resizeRenderFrameRef.current);
        resizeRenderFrameRef.current = undefined;
      }
    };
  }, [drawGrid, updateRenderedObjectsDisplay]);

  const update = useCallback((frameTime = performance.now()) => {
    if (stateRef.current.isPlaying && audioRef.current) {
      const offsetInSeconds = parseFloat(offset.toString()) / 1000;
      const activePlaybackSpeed = stateRef.current.playbackSpeed;
      const currentTime = getPlaybackTimeFromClock(audioRef.current, offsetInSeconds);
      const now = frameTime;
      if (
        isCurrentTutorialObjective('playbackMeasure2Completed')
        && currentTime >= getTimeFromTimepos(TUTORIAL_STEP_8_END_TIMEPOS) - SNAP_EPSILON
      ) {
        completeCurrentTutorialObjective('playbackMeasure2Completed');
      }
      if (
        isCurrentTutorialObjective('previewPlaybackMeasure2Completed')
        && isPreviewMode
        && currentTime >= getTimeFromTimepos(TUTORIAL_STEP_8_END_TIMEPOS) - SNAP_EPSILON
      ) {
        completeCurrentTutorialObjective('previewPlaybackMeasure2Completed');
      }

      if (timelineDuration > 0 && currentTime >= timelineDuration) {
        void loopPlaybackToBeginning();
        recordFpsSample(frameTime);
        drawGrid();
        updateRenderedObjectsDisplay();
        scheduleEditorUpdate(update);
        return;
      }

      if (isPreviewMode) {
        const previousJudgementTime = previewJudgementCursorTimeRef.current;

        if (
          currentTime + HIT_SOUND_JUMP_TOLERANCE_SECONDS < previousJudgementTime
          || currentTime - previousJudgementTime > HIT_SOUND_JUMP_TOLERANCE_SECONDS
        ) {
          resetPreviewJudgementState(currentTime, currentTime > previousJudgementTime);
        } else if (currentTime > previousJudgementTime) {
          const firstJudgedIndex = findFirstPreviewJudgementNoteIndex(
            previewJudgementNoteEntries,
            previousJudgementTime + SNAP_EPSILON,
          );
          for (let noteIndex = firstJudgedIndex; noteIndex < previewJudgementNoteEntries.length; noteIndex += 1) {
            const note = previewJudgementNoteEntries[noteIndex];
            if (note.time > currentTime) {
              break;
            }

            hiddenPreviewNoteIdsRef.current.add(note.id);
            if (isPreviewHitFxEnabled) {
              previewHitFxEventsRef.current.push({
                id: `${note.id}-${note.time}-${currentTime}`,
                noteId: note.id,
                time: note.time,
                type: note.type,
                lane: note.lane,
                width: note.width,
              });
            }
          }
          previewJudgementCursorTimeRef.current = currentTime;
        }

        if (previewHitFxEventsRef.current.length > 0) {
          previewHitFxEventsRef.current = isPreviewHitFxEnabled
            ? previewHitFxEventsRef.current.filter(effect => (
                currentTime - effect.time <= PREVIEW_HIT_FX_DURATION_SECONDS
              ))
            : [];
        }
      }

      scheduleHitSoundsThrough(currentTime, activePlaybackSpeed);

      if (shouldUpdateLiveStatsRef.current && now - liveStatsLastUpdateRef.current >= statisticsRefreshIntervalMs) {
        liveStatsLastUpdateRef.current = now;
        setLiveStatsTime(currentTime);
      }
    } else {
      lastPlayedTimeRef.current = stateRef.current.currentTime;
    }

    recordFpsSample(frameTime);
    drawGrid();
    updateRenderedObjectsDisplay();
    if (stateRef.current.isPlaying) {
      scheduleEditorUpdate(update);
    } else if (isPausedTimelineRendering && performance.now() < pausedTimelineRenderUntilRef.current) {
      scheduleEditorUpdate(update);
    } else {
      requestRef.current = undefined;
      requestSchedulerRef.current = undefined;
    }
  }, [completeCurrentTutorialObjective, drawGrid, getTimeFromTimepos, isCurrentTutorialObjective, isPreviewHitFxEnabled, offset, recordFpsSample, scheduleHitSoundsThrough, isPausedTimelineRendering, isPreviewMode, previewJudgementNoteEntries, resetPreviewJudgementState, scheduleEditorUpdate, statisticsRefreshIntervalMs, timelineDuration, loopPlaybackToBeginning, updateRenderedObjectsDisplay]);

  useEffect(() => {
    if (!shouldAnimateCanvas) {
      fpsFrameCountRef.current = 0;
      fpsWindowStartRef.current = performance.now();
      setFps(0);
      updateRenderedObjectsDisplay();
      drawGrid();
      cancelEditorUpdate();
      return;
    }

    if (requestRef.current === undefined) {
      fpsFrameCountRef.current = 0;
      fpsWindowStartRef.current = performance.now();
      scheduleEditorUpdate(update);
    }

    return () => {
      cancelEditorUpdate();
    };
  }, [cancelEditorUpdate, drawGrid, scheduleEditorUpdate, shouldAnimateCanvas, update, updateRenderedObjectsDisplay]);

  useEffect(() => {
    const resyncVisiblePlayback = () => {
      if (document.hidden || !stateRef.current.isPlaying || !audioRef.current) {
        return;
      }

      const audio = audioRef.current;
      const offsetInSeconds = parseFloat(offset.toString()) / 1000;
      if (!audio.paused && !audio.seeking) {
        syncPlaybackToAudioClock(audio, offsetInSeconds, stateRef.current.currentTime);
      } else {
        const now = performance.now();
        stateRef.current.playbackStartTime = stateRef.current.currentTime;
        stateRef.current.playbackStartPerformanceTime = now;
        stateRef.current.playbackAudioClockReadyTime = now + AUDIO_CLOCK_HANDOFF_DELAY_MS;
      }

      fpsFrameCountRef.current = 0;
      fpsWindowStartRef.current = performance.now();

      if (requestRef.current === undefined) {
        scheduleEditorUpdate(update);
      }
    };

    document.addEventListener('visibilitychange', resyncVisiblePlayback);
    window.addEventListener('focus', resyncVisiblePlayback);
    return () => {
      document.removeEventListener('visibilitychange', resyncVisiblePlayback);
      window.removeEventListener('focus', resyncVisiblePlayback);
    };
  }, [offset, scheduleEditorUpdate, update]);

  useEffect(() => {
    if (!isPlaying) {
      if (hitSoundSchedulerIntervalRef.current !== undefined) {
        window.clearInterval(hitSoundSchedulerIntervalRef.current);
        hitSoundSchedulerIntervalRef.current = undefined;
      }
      return;
    }

    hitSoundSchedulerIntervalRef.current = window.setInterval(() => {
      if (!stateRef.current.isPlaying || !audioRef.current) {
        return;
      }

      const offsetInSeconds = parseFloat(offset.toString()) / 1000;
      const playbackTime = getPlaybackTimeFromClock(audioRef.current, offsetInSeconds);
      scheduleHitSoundsThrough(playbackTime, stateRef.current.playbackSpeed);
    }, 25);

    return () => {
      if (hitSoundSchedulerIntervalRef.current !== undefined) {
        window.clearInterval(hitSoundSchedulerIntervalRef.current);
        hitSoundSchedulerIntervalRef.current = undefined;
      }
    };
  }, [isPlaying, offset, scheduleHitSoundsThrough]);

  useEffect(() => {
    return () => {
      if (pausedTimelineRenderTimeoutRef.current !== undefined) {
        window.clearTimeout(pausedTimelineRenderTimeoutRef.current);
        pausedTimelineRenderTimeoutRef.current = undefined;
      }
    };
  }, []);

  const getLaneFromCanvasX = (
    canvasX: number,
    gridStartX: number,
    laneWidth: number,
    laneCount: number,
    placementNoteWidth: number | null = null,
    allowOutOfBounds = false,
    snapToLaneGrid = false,
  ) => {
    const xPositionWidth = laneWidth / 2;
    const rawLane = (canvasX - gridStartX) / xPositionWidth;
    const xPositionCount = laneCount * 2;
    const clampLane = (lane: number) => (
      allowOutOfBounds
        ? lane
        : placementNoteWidth === null
          ? Math.max(0, Math.min(xPositionCount, lane))
          : clampNoteLaneToBounds(lane, placementNoteWidth)
    );

    if (snapToLaneGrid) {
      const snappedLane = Math.round(rawLane / 2) * 2;
      return clampLane(snappedLane);
    }

    if (isXPositionGridEnabled) {
      const snappedLane = Math.round(rawLane);
      return allowOutOfBounds || placementNoteWidth !== null
        ? clampLane(snappedLane)
        : Math.max(0, Math.min(xPositionCount - 1, snappedLane));
    }

    const lane = allowOutOfBounds ? rawLane : Math.max(0, Math.min(xPositionCount, rawLane));
    return Number(clampLane(lane).toFixed(3));
  };

  const getSelectionPointFromClient = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;
    const lanes = LANE_COUNT;
    const laneWidth = Math.min(60, rect.width / (lanes + 2));
    const gridWidth = lanes * laneWidth;
    const startX = (rect.width - gridWidth) / 2;
    const xPositionWidth = laneWidth / 2;
    const hitLineY = rect.height - 150;
    const currentBeat = getBeatAtTime(stateRef.current.currentTime, timedBpmChanges);

    return {
      xPosition: (canvasX - startX) / xPositionWidth,
      beat: currentBeat + (hitLineY - canvasY) / pixelsPerBeat,
    };
  }, [pixelsPerBeat, timedBpmChanges]);

  const updateSelectionBoxEndFromClient = useCallback((clientX: number, clientY: number) => {
    const selectionPoint = getSelectionPointFromClient(clientX, clientY);
    if (!selectionPoint) return;

    setSelectionBox(prev => prev
      ? {
          ...prev,
          endXPosition: selectionPoint.xPosition,
          endBeat: selectionPoint.beat,
        }
      : null);
  }, [getSelectionPointFromClient]);

  const trackTutorialHoldSequencePlacement = useCallback((placedNote: Note) => {
    if (!isCurrentTutorialObjective('holdSequencePlaced')) {
      return;
    }

    const sequence = tutorialHoldSequenceRef.current;
    let nextSequence: Note[] = [];

    if (placedNote.type === 5) {
      nextSequence = [placedNote];
    } else if (
      placedNote.type === 6
      && sequence.length === 1
      && sequence[0].type === 5
      && placedNote.time > sequence[0].time
      && placedNote.parentId === sequence[0].id
    ) {
      nextSequence = [...sequence, placedNote];
    } else if (
      placedNote.type === 7
      && sequence.length === 2
      && sequence[0].type === 5
      && sequence[1].type === 6
      && placedNote.time > sequence[1].time
      && placedNote.parentId === sequence[1].id
    ) {
      nextSequence = [...sequence, placedNote];
    }

    tutorialHoldSequenceRef.current = nextSequence;

    if (
      nextSequence.length === 3
      && nextSequence[0].type === 5
      && nextSequence[1].type === 6
      && nextSequence[2].type === 7
    ) {
      completeCurrentTutorialObjective('holdSequencePlaced');
      tutorialHoldSequenceRef.current = [];
    }
  }, [completeCurrentTutorialObjective, isCurrentTutorialObjective]);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canUseTutorialOperation('canvasPointer')) return;
    if (isPreviewMode) return;
    if (isOrganizingNotes) return;

    const canvas = canvasRef.current;
    if (!canvas || !projectData) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const { width, height } = rect;
    const lanes = LANE_COUNT;
    const laneWidth = Math.min(60, width / (lanes + 2));
    const gridWidth = lanes * laneWidth;
    const startX = (width - gridWidth) / 2;
    const canPlaceAtX = isOutOfBoundsPlacementEnabled || (clickX >= startX && clickX < startX + gridWidth);

    const hitLineY = height - 150;
    
    const sortedChanges = convertBpmChangesToTime(stateRef.current.bpmChanges);
    const currentBeat = getBeatAtTime(stateRef.current.currentTime, sortedChanges);
    
    const clickBeat = currentBeat + (hitLineY - clickY) / pixelsPerBeat;
    
    // Snap to grid
    const snappedBeat = snapBeatToMeasureDivision(clickBeat, gridZoom, sortedChanges);
    
    if (snappedBeat < 0) return;
    
    const snappedTime = getTimeAtBeat(snappedBeat, sortedChanges);

    const noteHitPaddingBeats = 10 / pixelsPerBeat;
    const hitNotes = getNoteBeatEntriesInRange(
      noteRenderIndex.noteBeatEntries,
      clickBeat - noteHitPaddingBeats,
      clickBeat + noteHitPaddingBeats,
    ).map(({ note, beat: noteBeat }) => {
      const noteY = hitLineY - (noteBeat - currentBeat) * pixelsPerBeat;
      const xPositionWidth = laneWidth / 2;
      const noteStartX = startX + note.lane * xPositionWidth;
      const noteWidthPx = xPositionWidth * note.width;
      const noteCenterX = noteStartX + noteWidthPx / 2;
      const noteHitHalfWidth = note.width === 0 ? Math.max(4, xPositionWidth / 4) : Math.abs(noteWidthPx) / 2;
      return clickX >= noteCenterX - noteHitHalfWidth && clickX <= noteCenterX + noteHitHalfWidth && clickY >= noteY - 10 && clickY <= noteY + 10
        ? note
        : null;
    }).filter((note): note is Note => note !== null);
    const clickedNote = hitNotes.reduce<Note | null>((highestNote, note) => (
      !highestNote || note.id > highestNote.id ? note : highestNote
    ), null);

    if (curveIdSelectTarget) {
      pasteTargetRef.current = null;
      setHoverPreview(null);

      if (e.button !== 0) {
        setCurveNotesMessage(text.operations.clickNoteToSelectId);
        return;
      }

      if (clickedNote) {
        if (curveIdSelectTarget === 'start') {
          setCurveStartIdInput(clickedNote.id.toString());
        } else {
          setCurveEndIdInput(clickedNote.id.toString());
        }

        setCurveNotesMessage(formatTranslation(
          curveIdSelectTarget === 'start' ? text.operations.startIdSet : text.operations.endIdSet,
          { noteId: clickedNote.id },
        ));
        setCurveIdSelectTarget(null);
      } else {
        setCurveNotesMessage(text.operations.clickNoteToSelectId);
      }
      return;
    }

    if (canPlaceAtX) {
      pasteTargetRef.current = {
        lane: getLaneFromCanvasX(clickX, startX, laneWidth, lanes, null, isOutOfBoundsPlacementEnabled),
        time: snappedTime,
      };
    }

    const ctrlClickedNote = hitNotes.reduce<Note | null>((selectedNote, note) => (
      selectedNoteIdSet.has(note.id) && (!selectedNote || note.id > selectedNote.id)
        ? note
        : selectedNote
    ), null) ?? clickedNote;

    if (e.button === 0) { // Left click
      if (e.ctrlKey) {
        if (ctrlClickedNote) {
          setSelectedNoteIds(prev => (
            prev.includes(ctrlClickedNote.id)
              ? prev.filter(id => id !== ctrlClickedNote.id)
              : [...prev, ctrlClickedNote.id]
          ));
        }
        return;
      }

      if (e.shiftKey && clickedNote) {
        setSelectedNoteIds([clickedNote.id]);
        setDraggingNoteId(clickedNote.id);
        dragStartNoteRef.current = clickedNote;
        return;
      }

      if (canPlaceAtX) {
        const lane = getLaneFromCanvasX(clickX, startX, laneWidth, lanes, noteWidth, isOutOfBoundsPlacementEnabled);
        const newId = nextNoteIdRef.current++;
        const isHoldConnector = HOLD_CONNECTOR_TYPES.includes(selectedNoteType);
        const isHoldStart = HOLD_START_TYPES.includes(selectedNoteType);
        const currentNotes = stateRef.current.notes;
        const currentId = Math.max(newId - 1, 0);
        const manualParentInputId =
          currentParentInput.trim() === '' ? null : parseInt(currentParentInput, 10);
        const manualParentId =
          manualParentInputId !== null
          && !Number.isNaN(manualParentInputId)
          && noteRenderIndex.notesById.has(manualParentInputId)
            ? manualParentInputId
            : null;
        const autoParentId = isHoldConnector && !isHoldStart
          ? currentId > 0 && noteRenderIndex.notesById.has(currentId)
            ? currentId
            : null
          : null;
        const parentId = isHoldConnector && !isHoldStart
          ? manualParentId ?? autoParentId
          : null;
        const placedNote: Note = {
          id: newId,
          time: snappedTime,
          lane,
          type: selectedNoteType,
          width: noteWidth,
          parentId,
        };

        setNotes(prev => [...prev, placedNote]);

        recordOperation({
          category: 'note',
          title: text.operations.placedNote,
          detail: `${getNoteHistoryDetail(placedNote)}${parentId === null ? '' : formatTranslation(text.operations.parentDetail, { parentId })}`,
        });
        completeCurrentTutorialObjective('notePlaced');
        trackTutorialHoldSequencePlacement(placedNote);

        if (currentParentInput.trim() !== '') {
          setCurrentParentInput(newId.toString());
        }
      }
    } else if (e.button === 1) { // Middle click
      e.preventDefault();

      if (e.shiftKey) {
        if (clickedNote) {
          setDraggingNoteId(clickedNote.id);
          dragStartNoteRef.current = clickedNote;
        }
      } else if (clickedNote) {
        setSelectedNoteIds([clickedNote.id]);
      } else {
        const selectionPoint = getSelectionPointFromClient(e.clientX, e.clientY);
        if (!selectionPoint) return;

        setSelectionBox({
          startXPosition: selectionPoint.xPosition,
          startBeat: selectionPoint.beat,
          endXPosition: selectionPoint.xPosition,
          endBeat: selectionPoint.beat,
        });
        setSelectedNoteIds([]);
      }
    } else if (e.button === 2) { // Right click
      if (clickedNote) {
        const noteIdsToDelete = selectedNoteIdSet.has(clickedNote.id) ? selectedNoteIds : [clickedNote.id];
        const noteIdsToDeleteSet = new Set(noteIdsToDelete);
        const deletedNotes = stateRef.current.notes.filter(note => noteIdsToDeleteSet.has(note.id));
        if (deletedNotes.length > 0) {
          recordOperation({
            category: 'note',
            title: deletedNotes.length === 1
              ? text.operations.deletedNote
              : formatTranslation(text.operations.deletedNotes, { count: deletedNotes.length }),
            detail: deletedNotes.length === 1
              ? getNoteHistoryDetail(deletedNotes[0])
              : formatTranslation(text.operations.idsDetail, { ids: formatGroupedIds(deletedNotes.map(note => note.id)) }),
          });
        }
        restoreCurrentParentAfterDeletingNotes(deletedNotes, clickedNote.id);
        setNotes(prev => prev.filter(note => !noteIdsToDeleteSet.has(note.id)));
        setSelectedNoteIds(prev => prev.filter(id => !noteIdsToDeleteSet.has(id)));
        if (deletedNotes.length > 0) {
          completeCurrentTutorialObjective('noteDeleted');
        }
      }
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPreviewMode) return;
    if (isOrganizingNotes) return;

    const canvas = canvasRef.current;
    if (!canvas || !projectData) return;

    if (curveIdSelectTarget) {
      pasteTargetRef.current = null;
      if (hoverPreviewRef.current !== null) {
        setHoverPreview(null);
      }
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const { width, height } = rect;
    const lanes = LANE_COUNT;
    const laneWidth = Math.min(60, width / (lanes + 2));
    const gridWidth = lanes * laneWidth;
    const startX = (width - gridWidth) / 2;
    const canPlaceAtX = isOutOfBoundsPlacementEnabled || (clickX >= startX && clickX < startX + gridWidth);
    const hitLineY = height - 150;
    const sortedChanges = timedBpmChanges;
    const currentBeat = getBeatAtTime(stateRef.current.currentTime, sortedChanges);

    if (canPlaceAtX) {
      const lane = getLaneFromCanvasX(clickX, startX, laneWidth, lanes, null, isOutOfBoundsPlacementEnabled);
      const clickBeat = currentBeat + (hitLineY - clickY) / pixelsPerBeat;
      const snappedBeat = snapBeatToMeasureDivision(clickBeat, gridZoom, sortedChanges);

      pasteTargetRef.current = snappedBeat >= 0
        ? { lane, time: getTimeAtBeat(snappedBeat, sortedChanges) }
        : null;
    } else {
      pasteTargetRef.current = null;
    }

    if (draggingNoteId) {
      const lane = getLaneFromCanvasX(clickX, startX, laneWidth, lanes, null, true);
      const clickBeat = currentBeat + (hitLineY - clickY) / pixelsPerBeat;
      
      const snappedBeat = snapBeatToMeasureDivision(clickBeat, gridZoom, sortedChanges);
      
      if (snappedBeat < 0) return;
      
      const snappedTime = getTimeAtBeat(snappedBeat, sortedChanges);
      pendingDragUpdateRef.current = { noteId: draggingNoteId, lane, time: snappedTime };

      if (!dragUpdateFrameRef.current) {
        dragUpdateFrameRef.current = requestAnimationFrame(() => {
          dragUpdateFrameRef.current = undefined;
          drawGrid();
          updateRenderedObjectsDisplay();
        });
      }
    } else if (selectionBox) {
      updateSelectionBoxEndFromClient(e.clientX, e.clientY);
    } else if (e.ctrlKey || e.shiftKey || isCtrlHeld || isShiftHeld) {
      if (hoverPreviewRef.current !== null) {
        setHoverPreview(null);
      }
    } else if (canPlaceAtX) {
      const lane = getLaneFromCanvasX(clickX, startX, laneWidth, lanes, noteWidth, isOutOfBoundsPlacementEnabled);

      const clickBeat = currentBeat + (hitLineY - clickY) / pixelsPerBeat;
      const snappedBeat = snapBeatToMeasureDivision(clickBeat, gridZoom, sortedChanges);

      if (snappedBeat < 0) {
        if (hoverPreviewRef.current !== null) {
          setHoverPreview(null);
        }
        return;
      }

      const snappedTime = getTimeAtBeat(snappedBeat, sortedChanges);
      const nextPreview = { lane, time: snappedTime };
      const currentPreview = hoverPreviewRef.current;
      if (!currentPreview || currentPreview.lane !== nextPreview.lane || Math.abs(currentPreview.time - nextPreview.time) > 0.000001) {
        setHoverPreview(nextPreview);
      }
    } else {
      if (hoverPreviewRef.current !== null) {
        setHoverPreview(null);
      }
    }
  };

  const handleCanvasMouseUp = (completedSelectionBox: SelectionBox | null = null) => {
    if (isPreviewMode) return;
    if (isOrganizingNotes) return;
    if (curveIdSelectTarget) return;

    finishPendingDrag();

    if (completedSelectionBox) {
      const minXPosition = Math.min(completedSelectionBox.startXPosition, completedSelectionBox.endXPosition);
      const maxXPosition = Math.max(completedSelectionBox.startXPosition, completedSelectionBox.endXPosition);
      const selectionMinBeat = Math.min(completedSelectionBox.startBeat, completedSelectionBox.endBeat);
      const selectionMaxBeat = Math.max(completedSelectionBox.startBeat, completedSelectionBox.endBeat);
      const noteHalfHeightBeats = 10 / pixelsPerBeat;
      const queryMinBeat = selectionType === 'crossing'
        ? selectionMinBeat - noteHalfHeightBeats
        : selectionMinBeat;
      const queryMaxBeat = selectionType === 'crossing'
        ? selectionMaxBeat + noteHalfHeightBeats
        : selectionMaxBeat;

      const selected = getNoteBeatEntriesInRange(
        noteRenderIndex.noteBeatEntries,
        queryMinBeat,
        queryMaxBeat,
      ).map(({ note: n, beat: noteBeat }) => {
        const noteStartXPosition = n.lane;
        const noteEndXPosition = n.lane + n.width;
        const noteMinBeat = noteBeat - noteHalfHeightBeats;
        const noteMaxBeat = noteBeat + noteHalfHeightBeats;

        if (selectionType === 'crossing') {
          return noteEndXPosition >= minXPosition
            && noteStartXPosition <= maxXPosition
            && noteMaxBeat >= selectionMinBeat
            && noteMinBeat <= selectionMaxBeat
            ? n
            : null;
        }

        return noteStartXPosition >= minXPosition
          && noteEndXPosition <= maxXPosition
          && noteMinBeat >= selectionMinBeat
          && noteMaxBeat <= selectionMaxBeat
          ? n
          : null;
      }).filter((note): note is Note => note !== null);
      setSelectedNoteIds(selected.map(n => n.id));
    }
    setSelectionBox(null);
  };

  const handleCanvasMouseLeave = () => {
    if (isPreviewMode) return;
    if (isOrganizingNotes) return;

    setHoverPreview(null);
    if (selectionBox) return;

    handleCanvasMouseUp(null);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  useEffect(() => {
    if (!selectionBox) return;

    const handleWindowMouseMove = (event: MouseEvent) => {
      updateSelectionBoxEndFromClient(event.clientX, event.clientY);
    };
    const handleWindowMouseUp = (event: MouseEvent) => {
      const selectionPoint = getSelectionPointFromClient(event.clientX, event.clientY);
      handleCanvasMouseUp(selectionPoint
        ? {
            ...selectionBox,
            endXPosition: selectionPoint.xPosition,
            endBeat: selectionPoint.beat,
          }
        : selectionBox);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [getSelectionPointFromClient, selectionBox, updateSelectionBoxEndFromClient]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!canUseTutorialOperation('timelineScroll')) return;
    if (!projectData) return;
    
    if (stateRef.current.isPlaying) {
      togglePlay();
    }
    
    const sortedChanges = convertBpmChangesToTime(stateRef.current.bpmChanges);
    const currentBeat = getBeatAtTime(stateRef.current.currentTime, sortedChanges);
    const scrollDelta = isScrollDirectionInverted ? -e.deltaY : e.deltaY;
    const targetBeat = currentBeat + (scrollDelta / pixelsPerBeat);
    const newTime = getTimeAtBeat(targetBeat, sortedChanges);
    
    let clampedTime = Math.max(0, newTime);
    if (timelineDuration > 0 && clampedTime > timelineDuration) {
      clampedTime = timelineDuration;
    }

    resetPreviewJudgementState(clampedTime);
    setCurrentTime(clampedTime);
    stateRef.current.currentTime = clampedTime;
    stateRef.current.playbackStartTime = clampedTime;
    stateRef.current.playbackStartPerformanceTime = performance.now();
    lastPlayedTimeRef.current = clampedTime;
    hitSoundCursorRef.current = findHitSoundCursor(clampedTime);
    scheduledHitSoundKeysRef.current.clear();
    if (audioRef.current) {
      const offsetInSeconds = parseFloat(offset.toString()) / 1000;
      audioRef.current.currentTime = getMediaTimeFromPlaybackTime(
        clampedTime,
        offsetInSeconds,
        audioTimingCorrectionRef.current,
      );
    }
    if (timeDisplayRef.current) {
      timeDisplayRef.current.textContent = formatTimelineMeasureProgress(clampedTime);
    }
    updateProgressBarValue(clampedTime, true);
    renderPausedTimelineAtFullFps();
    completeCurrentTutorialObjective('timelineScrolled');
  };

  const createZipBlobForSave = (zipBuffer: ArrayBuffer) => {
    if (zipBuffer.byteLength === 0) {
      throw new Error(text.editor.emptyZipError);
    }

    return new Blob([zipBuffer], { type: 'application/zip' });
  };

  const downloadZipData = (zipBuffer: ArrayBuffer, suggestedName: string) => {
    const zipBlob = createZipBlobForSave(zipBuffer);
    const url = URL.createObjectURL(zipBlob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = suggestedName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const getExportFileHandle = async (
    suggestedName: string,
    errorLabel: string,
    fileType = {
      description: text.editor.zipArchive,
      accept: { 'application/zip': ['.zip'] },
    },
  ) => {
    if (!('showSaveFilePicker' in window)) {
      return null;
    }

    try {
      return await (window as any).showSaveFilePicker({
        suggestedName,
        types: [fileType],
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return undefined;
      }

      console.error(`${errorLabel} save picker failed`, err);
      return null;
    }
  };

  const saveZipData = async (
    zipBuffer: ArrayBuffer,
    suggestedName: string,
    fileHandle: FileSystemFileHandle | null | undefined,
    errorLabel: string,
  ) => {
    if (fileHandle === undefined) {
      return;
    }

    if (fileHandle) {
      try {
        const zipBlob = createZipBlobForSave(zipBuffer);
        const writable = await fileHandle.createWritable({ keepExistingData: true });
        await writable.write({ type: 'write', position: 0, data: zipBlob });
        await writable.truncate(zipBlob.size);
        await writable.close();
        return;
      } catch (err) {
        console.error(`${errorLabel} file save failed`, err);
      }
    }

    downloadZipData(zipBuffer, suggestedName);
  };

  const downloadTextData = (content: string, suggestedName: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = suggestedName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const saveTextData = async (
    content: string,
    suggestedName: string,
    fileHandle: FileSystemFileHandle | null | undefined,
    errorLabel: string,
  ) => {
    if (fileHandle === undefined) {
      return;
    }

    if (fileHandle) {
      try {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const writable = await fileHandle.createWritable({ keepExistingData: true });
        await writable.write({ type: 'write', position: 0, data: blob });
        await writable.truncate(blob.size);
        await writable.close();
        return;
      } catch (err) {
        console.error(`${errorLabel} file save failed`, err);
      }
    }

    downloadTextData(content, suggestedName);
  };

  const waitForDr3FpPreviewReceiver = async (sessionId: string) => {
    const deadline = Date.now() + DR3FP_PREVIEW_RECEIVER_TIMEOUT_MS;
    const url = `${DR3FP_PREVIEW_RECEIVER_ORIGIN}/preview/${encodeURIComponent(sessionId)}/ready`;
    let lastResponseStatus: number | null = null;
    let lastErrorMessage = '';

    while (Date.now() < deadline) {
      try {
        const response = await fetch(url, { method: 'GET' });
        lastResponseStatus = response.status;
        if (response.ok) {
          const body = await response.json();
          if (body?.ready === true && body?.version === 1) {
            return;
          }
          lastErrorMessage = body?.ready === false
            ? text.dr3FpPreview.receiverNotReadyBeforeTimeout
            : text.dr3FpPreview.receiverUnexpectedReadyResponse;
        } else {
          lastErrorMessage = formatTranslation(text.dr3FpPreview.receiverHttpStatus, { status: response.status });
        }
      } catch (err) {
        lastErrorMessage = err instanceof Error ? err.message : text.dr3FpPreview.receiverRequestFailed;
        // DR3FanmadeViewer may still be starting.
      }

      await new Promise(resolve => window.setTimeout(resolve, DR3FP_PREVIEW_RECEIVER_POLL_MS));
    }

    throw new Dr3FpPreviewError(
      'receiver',
      lastResponseStatus === null
        ? text.dr3FpPreview.receiverUnreachable
        : text.dr3FpPreview.receiverNotReady,
      lastErrorMessage || undefined,
    );
  };

  const uploadDr3FpPreviewBundle = async (sessionId: string, zipBlob: Blob) => {
    let response: Response;
    try {
      response = await fetch(`${DR3FP_PREVIEW_RECEIVER_ORIGIN}/preview/${encodeURIComponent(sessionId)}/bundle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/zip',
        },
        body: zipBlob,
      });
    } catch (err) {
      throw new Dr3FpPreviewError(
        'upload',
        text.dr3FpPreview.uploadLostContact,
        err instanceof Error ? err.message : undefined,
      );
    }

    if (!response.ok) {
      throw new Dr3FpPreviewError(
        'upload',
        formatTranslation(text.dr3FpPreview.uploadRejected, { status: response.status }),
        response.statusText || undefined,
      );
    }

    const body = await response.json().catch(() => null);
    if (body?.accepted !== true) {
      throw new Dr3FpPreviewError(
        'upload',
        text.dr3FpPreview.uploadNotAccepted,
        body ? JSON.stringify(body) : text.dr3FpPreview.unreadableAcceptanceResponse,
      );
    }
  };

  const previewDr3Fp = async () => {
    if (!isDr3FpPreviewEnabled || !projectData || isExportDisabled || !hasExportAudioFile || hasExportIncompatibleTimeSignature) return;

    if (stateRef.current.isPlaying) {
      await togglePlay();
    }

    setDr3FpPreviewStatus(DR3FP_PREVIEW_STATUS.exporting);
    setDr3FpPreviewLogs([
      createDr3FpPreviewLogEntry(text.dr3FpPreview.started),
      createDr3FpPreviewLogEntry(DR3FP_PREVIEW_STATUS.exporting.message),
    ]);
    setIsDr3FpPreviewInfoOpen(true);

    try {
      let zipBuffer: ArrayBuffer;
      try {
        const previewProjectData = { ...projectData };
        const organized = organizeChartForExport();

        if (previewProjectData.songFile && !isOggAudioFile(previewProjectData.songFile)) {
          previewProjectData.songFile = await convertAudioFileToOgg(previewProjectData.songFile);
        }

        ({ zipBuffer } = await createExportZipInWorker({
          format: 'dr3-fp-preview',
          projectData: previewProjectData,
          notes: organized.notes,
          bpmChanges: organized.bpmChanges,
          speedChanges: organized.speedChanges,
          offset,
        }));
      } catch (err) {
        throw new Dr3FpPreviewError(
          'export',
          text.dr3FpPreview.previewZipFailed,
          err instanceof Error ? err.message : undefined,
        );
      }
      const zipBlob = createZipBlobForSave(zipBuffer);
      const sessionId = crypto.randomUUID();
      addDr3FpPreviewLog(text.dr3FpPreview.bundleBuilt, formatTranslation(text.dr3FpPreview.readyToSend, { size: formatByteSize(zipBlob.size) }));

      setDr3FpPreviewStatus(DR3FP_PREVIEW_STATUS.launching);
      addDr3FpPreviewLog(DR3FP_PREVIEW_STATUS.launching.message);
      try {
        window.location.href = `dr3fp://preview?session=${encodeURIComponent(sessionId)}&version=1`;
      } catch (err) {
        throw new Dr3FpPreviewError(
          'launch',
          text.dr3FpPreview.previewLinkBlocked,
          err instanceof Error ? err.message : undefined,
        );
      }

      setDr3FpPreviewStatus(DR3FP_PREVIEW_STATUS.receiver);
      addDr3FpPreviewLog(DR3FP_PREVIEW_STATUS.receiver.message);
      await waitForDr3FpPreviewReceiver(sessionId);
      addDr3FpPreviewLog(text.dr3FpPreview.receiverReady);
      setDr3FpPreviewStatus(DR3FP_PREVIEW_STATUS.uploading);
      addDr3FpPreviewLog(DR3FP_PREVIEW_STATUS.uploading.message);
      await uploadDr3FpPreviewBundle(sessionId, zipBlob);
      setDr3FpPreviewStatus(DR3FP_PREVIEW_STATUS.complete);
      addDr3FpPreviewLog(DR3FP_PREVIEW_STATUS.complete.message);
    } catch (err) {
      console.error(text.dr3FpPreview.failedLog, err);
      if (err instanceof Dr3FpPreviewError) {
        setDr3FpPreviewStatus(createDr3FpPreviewFailureStatus(err.kind, err.message, err.detail));
        addDr3FpPreviewLog(err.message, err.detail);
      } else {
        setDr3FpPreviewStatus(createDr3FpPreviewFailureStatus(
          'upload',
          err instanceof Error ? err.message : text.dr3FpPreview.previewFailed,
        ));
        addDr3FpPreviewLog(err instanceof Error ? err.message : text.dr3FpPreview.previewFailed);
      }
    }
  };

  const getOrganizedChartSnapshot = (sourceNotes: Note[]) => {
    const sortedNotes = sourceNotes
      .map((note, originalIndex) => ({
        note,
        originalIndex,
        timepos: getTimeposFromTime(note.time),
      }))
      .sort((a, b) => (
        (a.timepos - b.timepos)
        || (a.note.lane - b.note.lane)
        || (a.note.id - b.note.id)
        || (a.originalIndex - b.originalIndex)
      ));
    const nextIdByOriginalId = new Map<number, number>();

    sortedNotes.forEach(({ note }, index) => {
      nextIdByOriginalId.set(note.id, index + 1);
    });

    const organizedNotes = sourceNotes.map(note => ({
      ...note,
      id: nextIdByOriginalId.get(note.id) ?? note.id,
      parentId: note.parentId === null
        ? null
        : nextIdByOriginalId.get(note.parentId) ?? note.parentId,
    }));

    return {
      notes: organizedNotes,
      bpmChanges: [...bpmChanges].sort((a, b) => getBpmChangeTimepos(a) - getBpmChangeTimepos(b)),
      speedChanges: [...speedChanges].sort((a, b) => a.timepos - b.timepos),
      nextIdByOriginalId,
    };
  };

  const organizeChartForExport = () => {
    const pendingUpdate = pendingDragUpdateRef.current;
    const sourceNotes = stateRef.current.notes.map(note => (
      pendingUpdate && note.id === pendingUpdate.noteId
        ? { ...note, time: pendingUpdate.time, lane: pendingUpdate.lane }
        : note
    ));
    const organized = getOrganizedChartSnapshot(sourceNotes);
    const changedCount = organized.notes.reduce((count, note, index) => {
      const previousNote = sourceNotes[index];
      return count + (note.id !== previousNote.id || note.parentId !== previousNote.parentId ? 1 : 0);
    }, 0);

    if (dragUpdateFrameRef.current) {
      cancelAnimationFrame(dragUpdateFrameRef.current);
      dragUpdateFrameRef.current = undefined;
    }

    setNotes(organized.notes);
    setBpmChanges(organized.bpmChanges);
    setSpeedChanges(organized.speedChanges);
    setChartIssues(findChartIssues(organized.notes, getTimeposFromTime));
    setSelectedNoteIds(prev => prev
      .map(id => organized.nextIdByOriginalId.get(id))
      .filter((id): id is number => id !== undefined));
    setDraggingNoteId(null);
    setSelectionBox(null);
    setHoverPreview(null);
    pendingDragUpdateRef.current = null;
    dragStartNoteRef.current = null;
    renderPausedTimelineAtFullFps();

    if (currentParentInput.trim() !== '') {
      const currentParentId = parseInt(currentParentInput, 10);
      if (!Number.isNaN(currentParentId)) {
        const nextParentId = organized.nextIdByOriginalId.get(currentParentId);
        setCurrentParentInput(nextParentId === undefined ? '' : nextParentId.toString());
      }
    }

    recordOperation({
      category: 'note',
      title: text.operations.organizedChartForExport,
      detail: changedCount === 0
        ? formatTranslation(text.operations.notesAlreadyOrdered, { count: sourceNotes.length })
        : formatTranslation(text.operations.reassignedNoteIds, { count: sourceNotes.length }),
    });

    return organized;
  };

  const exportZip = async (
    format: Exclude<ExportFormat, 'dr3-fp-preview' | 'chart-data'>,
    defaultFileName: string,
    errorLabel: string,
  ): Promise<ExportRunResult> => {
    if (!projectData || isExportDisabled || !projectData.songFile) return 'failed';
    if (format !== 'raw' && hasExportIncompatibleTimeSignature) return 'failed';

    const fileHandle = await getExportFileHandle(defaultFileName, errorLabel);
    if (fileHandle === undefined) return 'cancelled';

    try {
      const preparedProjectData = { ...projectData };
      const organized = organizeChartForExport();
      const preparedNotes = organized.notes;
      const preparedBpmChanges = organized.bpmChanges;
      const preparedSpeedChanges = organized.speedChanges;

      if (preparedProjectData.songFile && !isOggAudioFile(preparedProjectData.songFile)) {
        preparedProjectData.songFile = await convertAudioFileToOgg(preparedProjectData.songFile);
      }

      const { zipBuffer, suggestedName } = await createExportZipInWorker({
        format,
        projectData: preparedProjectData,
        notes: preparedNotes,
        bpmChanges: preparedBpmChanges,
        speedChanges: preparedSpeedChanges,
        offset,
        chartFileName: initialChartFileName,
      });
      await saveZipData(zipBuffer, suggestedName, fileHandle, errorLabel);
      return 'complete';
    } catch (err) {
      console.error(`${errorLabel} export failed`, err);
      return 'failed';
    }
  };

  const exportRaw = () => {
    const songId = projectData?.songId || 'level';
    const difficulty = projectData?.difficulty || '0';
    return exportZip('raw', `${songId}_tier${difficulty}_raw.zip`, 'Raw');
  };

  const exportDr3Viewer = () => {
    const songId = projectData?.songId || 'level';
    const difficulty = projectData?.difficulty || '0';
    return exportZip('dr3-viewer', `${songId}_tier${difficulty}.zip`, 'DR3Viewer');
  };

  const exportDr3Fp = () => {
    const songId = projectData?.songId || 'level';
    const difficulty = projectData?.difficulty || '0';
    return exportZip('dr3-fp', `${songId}_tier${difficulty}.zip`, 'DR3FV');
  };

  const exportChartData = async (): Promise<ExportRunResult> => {
    if (!projectData || isExportDisabled) return 'failed';

    const songId = projectData.songId || 'level';
    const difficulty = projectData.difficulty || '0';
    const suggestedName = initialChartFileName || `${songId}_tier${difficulty}.txt`;
    const fileHandle = await getExportFileHandle(suggestedName, 'Chart Data', {
      description: text.editor.chartDataFile,
      accept: { 'text/plain': ['.txt'] },
    });
    if (fileHandle === undefined) return 'cancelled';

    try {
      const organized = organizeChartForExport();
      const chartText = buildLevelText({
        projectData,
        notes: organized.notes,
        bpmChanges: organized.bpmChanges,
        speedChanges: organized.speedChanges,
        offset,
      });

      await saveTextData(chartText, suggestedName, fileHandle, 'Chart Data');
      return 'complete';
    } catch (err) {
      console.error('Chart Data export failed', err);
      return 'failed';
    }
  };

  const handleOrganizeNotes = () => {
    if (isOrganizingNotes || stateRef.current.notes.length === 0) {
      return;
    }

    setIsOrganizingNotes(true);

    window.requestAnimationFrame(() => {
      try {
        organizeChartForExport();
      } finally {
        setIsOrganizingNotes(false);
      }
    });
  };

  const handleGenerateCurveNotes = () => {
    const startId = curveStartIdInput.trim() === '' ? NaN : Number(curveStartIdInput);
    const endId = curveEndIdInput.trim() === '' ? NaN : Number(curveEndIdInput);
    const curveDensity = Number(curveDensityInput);
    const curveEasingOption = CURVE_EASINGS_BY_ID.get(getCurveEasingId(curveEasingFamily, curveEasingType));

    if (!Number.isInteger(startId) || !Number.isInteger(endId)) {
      setCurveNotesMessage(text.operations.noteIdValidation);
      return;
    }

    if (!Number.isInteger(curveDensity) || curveDensity <= 0) {
      setCurveNotesMessage(text.operations.densityValidation);
      return;
    }

    if (!curveEasingOption) {
      setCurveNotesMessage(text.operations.easingValidation);
      return;
    }

    if (startId === endId) {
      setCurveNotesMessage(text.operations.differentNoteIdsValidation);
      return;
    }

    const pendingUpdate = pendingDragUpdateRef.current;
    const sourceNotes = stateRef.current.notes.map(note => (
      pendingUpdate && note.id === pendingUpdate.noteId
        ? { ...note, time: pendingUpdate.time, lane: pendingUpdate.lane }
        : note
    ));
    const sourceNotesById = new Map(sourceNotes.map(note => [note.id, note]));
    const startNote = sourceNotesById.get(startId);
    const endNote = sourceNotesById.get(endId);

    if (!startNote || !endNote) {
      setCurveNotesMessage(text.operations.existingNotesValidation);
      return;
    }

    const startBeat = getBeatAtTime(startNote.time, timedBpmChanges);
    const endBeat = getBeatAtTime(endNote.time, timedBpmChanges);
    const snapBeats = getCurveSnapBeatsBetween(startBeat, endBeat, curveDensity, timedBpmChanges);

    if (snapBeats.length === 0) {
      setCurveNotesMessage(formatTranslation(text.operations.noSnapPositionsBetweenNotes, { density: curveDensity }));
      return;
    }

    if (dragUpdateFrameRef.current) {
      cancelAnimationFrame(dragUpdateFrameRef.current);
      dragUpdateFrameRef.current = undefined;
    }

    const firstGeneratedId = Math.max(nextNoteIdRef.current, sourceNotes.reduce((maxId, note) => Math.max(maxId, note.id), 0) + 1);
    const canGeneratedNotesHaveParent = canTypeHaveParent(curveNoteType);
    const startCenter = startNote.lane + startNote.width / 2;
    const endCenter = endNote.lane + endNote.width / 2;
    const beatSpan = endBeat - startBeat;
    let previousParentId = startNote.id;

    const generatedNotes = snapBeats.map((beat, index) => {
      const progress = beatSpan === 0 ? 0 : (beat - startBeat) / beatSpan;
      const easedProgress = curveEasingOption.ease(progress);
      const interpolatedWidth = startNote.width + (endNote.width - startNote.width) * easedProgress;
      const width = Math.max(1, Number(interpolatedWidth.toFixed(3)));
      const center = startCenter + (endCenter - startCenter) * easedProgress;
      const lane = Number((center - width / 2).toFixed(3));
      const id = firstGeneratedId + index;
      const parentId = canGeneratedNotesHaveParent ? previousParentId : null;

      previousParentId = id;

      return {
        id,
        time: getTimeAtBeat(beat, timedBpmChanges),
        lane,
        type: curveNoteType,
        width,
        parentId,
      };
    });
    const endParentId = generatedNotes[generatedNotes.length - 1]?.id ?? startNote.id;
    const shouldAttachEndNote = canGeneratedNotesHaveParent && canTypeHaveParent(endNote.type);
    const nextNotes = shouldAttachEndNote
      ? sourceNotes.map(note => (
        note.id === endNote.id ? { ...note, parentId: endParentId } : note
      ))
      : sourceNotes;
    const generatedNoteIds = generatedNotes.map(note => note.id);

    nextNoteIdRef.current = firstGeneratedId + generatedNotes.length;
    setNotes([...nextNotes, ...generatedNotes]);
    setSelectedNoteIds(generatedNoteIds);
    setDraggingNoteId(null);
    setSelectionBox(null);
    setHoverPreview(null);
    pendingDragUpdateRef.current = null;
    dragStartNoteRef.current = null;
    renderPausedTimelineAtFullFps();
    setCurveNotesMessage(
      formatTranslation(text.operations.generatedCurveNotesMessage, {
        count: generatedNotes.length,
        noteName: NOTE_TYPES[curveNoteType]?.name || formatTranslation(text.noteTypes.type, { type: curveNoteType }),
        startId: startNote.id,
        endId: endNote.id,
      }),
    );

    recordOperation({
      category: 'note',
      title: text.operations.generatedCurveNotes,
      detail: `${generatedNotes.length} ${text.sidebar.notes.toLowerCase()}, ${NOTE_TYPES[curveNoteType]?.name || formatTranslation(text.noteTypes.type, { type: curveNoteType })}, 1/${curveDensity}, ${curveEasingOption.label}, ${formatTranslation(text.operations.idsDetail, { ids: formatGroupedIds(generatedNoteIds) })}${shouldAttachEndNote ? `, end parent #${endParentId}` : ''}`,
    });
  };

  const currentId = Math.max(nextNoteIdRef.current - 1, 0);
  const currentParentId =
    currentParentInput.trim() === '' ? currentId : parseInt(currentParentInput, 10);
  const currentParentNote =
    currentParentId === 0 || Number.isNaN(currentParentId)
      ? null
      : noteRenderIndex.notesById.get(currentParentId) ?? null;
  const copiedNotesCount = copiedNotesRef.current.length;
  const parsedCurveStartId = curveStartIdInput.trim() === '' ? NaN : Number(curveStartIdInput);
  const parsedCurveEndId = curveEndIdInput.trim() === '' ? NaN : Number(curveEndIdInput);
  const curveStartNote = Number.isInteger(parsedCurveStartId)
    ? noteRenderIndex.notesById.get(parsedCurveStartId) ?? null
    : null;
  const curveEndNote = Number.isInteger(parsedCurveEndId)
    ? noteRenderIndex.notesById.get(parsedCurveEndId) ?? null
    : null;
  const parsedCurveDensity = Number(curveDensityInput);
  const hasValidCurveDensity = Number.isInteger(parsedCurveDensity) && parsedCurveDensity > 0;
  const hasCompleteCurveNoteFields = Boolean(
    curveStartIdInput.trim() !== ''
    && curveEndIdInput.trim() !== ''
    && AVAILABLE_NOTE_TYPES.includes(curveNoteType)
    && curveDensityInput.trim() !== ''
    && hasValidCurveDensity
    && CURVE_EASINGS_BY_ID.has(getCurveEasingId(curveEasingFamily, curveEasingType))
  );
  const canGenerateCurveNotes = Boolean(
    hasCompleteCurveNoteFields
    && !curveIdSelectTarget
    && curveStartNote
    && curveEndNote
    && curveStartNote.id !== curveEndNote.id,
  );
  const parsedSpeedCurveStartId = speedCurveStartIdInput.trim() === '' ? NaN : Number(speedCurveStartIdInput);
  const parsedSpeedCurveEndId = speedCurveEndIdInput.trim() === '' ? NaN : Number(speedCurveEndIdInput);
  const speedCurveStartChange = Number.isInteger(parsedSpeedCurveStartId)
    ? speedChanges[parsedSpeedCurveStartId - 1] || null
    : null;
  const speedCurveEndChange = Number.isInteger(parsedSpeedCurveEndId)
    ? speedChanges[parsedSpeedCurveEndId - 1] || null
    : null;
  const parsedSpeedCurveDensity = Number(speedCurveDensityInput);
  const hasValidSpeedCurveDensity = Number.isInteger(parsedSpeedCurveDensity) && parsedSpeedCurveDensity > 0;
  const canGenerateSpeedCurveChanges = Boolean(
    speedCurveStartIdInput.trim() !== ''
    && speedCurveEndIdInput.trim() !== ''
    && speedCurveDensityInput.trim() !== ''
    && hasValidSpeedCurveDensity
    && CURVE_EASINGS_BY_ID.has(getCurveEasingId(speedCurveEasingFamily, speedCurveEasingType))
    && speedCurveStartChange
    && speedCurveEndChange
    && parsedSpeedCurveStartId !== parsedSpeedCurveEndId,
  );
  const selectedSingleNote =
    selectedNoteIds.length === 1
      ? noteRenderIndex.notesById.get(selectedNoteIds[0]) ?? null
      : null;
  const selectedNotesForMultiEdit = useMemo(() => {
    const selectedIdSet = new Set(selectedNoteIds);
    return notes.filter(note => selectedIdSet.has(note.id));
  }, [notes, selectedNoteIds]);
  const canUseSelectedAsParent = selectedNoteIds.length === 1 && selectedSingleNote !== null;
  const selectedParentNote =
    selectedSingleNote?.parentId === null || selectedSingleNote?.parentId === undefined
      ? null
      : noteRenderIndex.notesById.get(selectedSingleNote.parentId) ?? null;
  const canEditSelectedNoteParent = selectedSingleNote ? canTypeHaveParent(selectedSingleNote.type) : false;
  const selectedNoteTimepos = selectedSingleNote ? getTimeposFromTime(selectedSingleNote.time) : 0;
  const chartStatistics = useMemo(() => calculateChartStatistics({
    getTimeFromTimepos,
    getTimeposFromTime,
    liveStatsTime,
    notes,
    precomputedIndex: isPreviewMode
      ? (previewChartStatisticsIndexRef.current ?? previewChartStatisticsFallbackIndex)
      : editorChartStatisticsIndex,
    shouldShowChartStatistics,
    speedChanges: isPreviewMode ? previewSpeedChanges : speedChanges,
    timedBpmChanges,
  }), [editorChartStatisticsIndex, getTimeFromTimepos, getTimeposFromTime, isPreviewMode, liveStatsTime, notes, previewChartStatisticsFallbackIndex, previewSpeedChanges, shouldShowChartStatistics, speedChanges, timedBpmChanges]);
  const {
    currentEditorBpm,
    currentEditorSpeed,
    currentEditorDistance,
    currentEditorCombo,
    currentEditorScore,
  } = chartStatistics;
  const selectedNoteBpm = selectedSingleNote
    ? getActiveChange(selectedSingleNote.time, timedBpmChanges).bpm
    : currentEditorBpm;
  const leftSidebarInfoBadge = useMemo(() => {
    const requiredMissingCount = [
      !projectData || !isValidSongId(projectData.songId),
      !projectData || !isValidSongBpm(projectData.songBpm || projectData.bpm.toString()),
      !projectData || !isValidDifficulty(projectData.difficulty),
      !projectData?.songFile,
    ].filter(Boolean).length;
    const optionalMissingCount = [
      !projectData?.songName?.trim(),
      !projectData?.songArtist?.trim(),
      !projectData?.songIllustration,
    ].filter(Boolean).length;
    const count = requiredMissingCount + optionalMissingCount;

    return count > 0
      ? { count, tone: requiredMissingCount > 0 ? 'red' : 'yellow' }
      : null;
  }, [projectData]);
  const leftSidebarChartIssuesBadge = useMemo(() => (
    chartIssues.length > 0
      ? { count: chartIssues.length, tone: 'yellow' }
      : null
  ), [chartIssues.length]);
  const notePropertyInputClass = 'w-full p-2 text-sm bg-neutral-800 rounded border border-neutral-700 focus:border-indigo-500 outline-none disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-600';
  const bpmChangeGridClass = isOfficialChartFormat
    ? 'grid grid-cols-[2rem_minmax(0,1.25fr)_minmax(0,1fr)_1.25rem] gap-2'
    : 'grid grid-cols-[2rem_minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.9fr)_1.25rem] gap-2';
  const speedChangeGridClass = 'grid grid-cols-[2rem_minmax(0,1.25fr)_minmax(0,1fr)_1.25rem] gap-2';
  const changeTableInputClass = 'w-full min-w-0 p-1 bg-neutral-800 rounded border border-neutral-700';
  const changeTableMarkerClass = 'inline-flex h-6 w-full items-center justify-center rounded border border-neutral-700 bg-neutral-900 font-mono text-[10px] font-semibold text-neutral-400';
  const changeTableJumpMarkerClass = `${changeTableMarkerClass} cursor-pointer transition-colors hover:border-indigo-500 hover:bg-indigo-500/10 hover:text-indigo-200 focus:border-indigo-500 focus:outline-none`;
  const emptyCanvasMessage = mode === 'import'
    ? text.editor.emptyImportedChart
    : text.editor.emptyNewChart;
  const updateSelectedNote = (updates: Partial<Note>) => {
    if (!selectedSingleNote) return;

    const nextType = updates.type ?? selectedSingleNote.type;
    const normalizedUpdates = shouldOmitParentForType(nextType)
      ? { ...updates, parentId: null }
      : updates;
    const changedFields = Object.entries(normalizedUpdates).filter(([key, value]) => (
      selectedSingleNote[key as keyof Note] !== value
    ));

    if (changedFields.length === 0) {
      return;
    }

    const fieldLabels: Partial<Record<keyof Note, string>> = {
      time: text.sidebar.timepos.toLowerCase(),
      lane: text.sidebar.xPosition,
      type: text.sidebar.type.toLowerCase(),
      width: text.sidebar.width.toLowerCase(),
      parentId: text.sidebar.parentId,
      speed: text.sidebar.speed.toLowerCase(),
      appearMode: 'AppearMode',
    };
    const fieldDetails = changedFields.map(([key, value]) => {
      const typedKey = key as keyof Note;
      const label = fieldLabels[typedKey] || key;
      const previousValue = selectedSingleNote[typedKey];

      if (typedKey === 'time') {
        return `${label}: ${formatTime(Number(previousValue), timedBpmChanges)} -> ${formatTime(Number(value), timedBpmChanges)}`;
      }

      if (typedKey === 'lane') {
        return `${label}: ${formatNoteLane(Number(previousValue))} -> ${formatNoteLane(Number(value))}`;
      }

      if (typedKey === 'type') {
        return `${label}: ${NOTE_TYPES[Number(previousValue)]?.name || previousValue} -> ${NOTE_TYPES[Number(value)]?.name || value}`;
      }

      return `${label}: ${formatMaybeValue(previousValue)} -> ${formatMaybeValue(value)}`;
    }).join('; ');

    recordOperation({
      category: 'note',
      title: text.operations.modifiedNote,
      detail: `#${selectedSingleNote.id} ${fieldDetails}`,
    });

    setNotes(prev => prev.map(note => (
      note.id === selectedSingleNote.id ? { ...note, ...normalizedUpdates } : note
    )));
  };

  const getSimpleNoteSpeedValue = (note: Note) => {
    const normalizedSpeed = note.speed?.trim();
    if (!normalizedSpeed) {
      return 1;
    }

    const parsedSpeed = Number(normalizedSpeed);
    return Number.isFinite(parsedSpeed) ? parsedSpeed : null;
  };

  const formatNoteMultiEditNumber = (value: number) => {
    const roundedValue = Number(value.toFixed(6));
    return Object.is(roundedValue, -0) ? '0' : roundedValue.toString();
  };

  const getNearestAvailableNoteType = (value: number) => (
    AVAILABLE_NOTE_TYPES.reduce((nearestType, candidateType) => (
      Math.abs(candidateType - value) < Math.abs(nearestType - value)
        ? candidateType
        : nearestType
    ), AVAILABLE_NOTE_TYPES[0] ?? 1)
  );

  const getAppearModeFromValue = (value: string): Note['appearMode'] | undefined => (
    APPEAR_MODE_OPTIONS.includes(value as typeof APPEAR_MODE_OPTIONS[number]) && value !== 'none'
      ? value as Note['appearMode']
      : undefined
  );

  const parseComplexNscKeyframes = (value: string) => {
    const normalizedValue = value.trim();
    if (!normalizedValue) {
      return null;
    }

    const segments = normalizedValue.split(';');
    if (segments.length === 0 || segments.some(segment => segment.trim() === '')) {
      return null;
    }

    const keyframes = segments.map(segment => {
      const parts = segment.split(':');
      if (parts.length !== 2) {
        return null;
      }

      const timeOffset = Number(parts[0].trim());
      const valueOffset = Number(parts[1].trim());
      if (!Number.isFinite(timeOffset) || !Number.isFinite(valueOffset)) {
        return null;
      }

      return { timeOffset, valueOffset };
    });

    return keyframes.some(keyframe => keyframe === null)
      ? null
      : keyframes as Array<{ timeOffset: number; valueOffset: number }>;
  };

  const formatComplexNscKeyframes = (keyframes: Array<{ timeOffset: number; valueOffset: number }>) => (
    keyframes
      .map(keyframe => `${formatNoteMultiEditNumber(keyframe.timeOffset)}:${formatNoteMultiEditNumber(keyframe.valueOffset)}`)
      .join(';')
  );

  const validateNoteMultiEditCondition = (condition: NoteMultiEditCondition) => {
    if (condition.operator === 'empty' || condition.operator === 'notEmpty' || condition.field === 'appearMode') {
      return '';
    }

    const parsedValue = Number(condition.value);
    if (!Number.isFinite(parsedValue)) {
      return text.noteMultiEdit.invalidCondition;
    }

    if ((condition.operator === 'between' || condition.operator === 'outside') && !Number.isFinite(Number(condition.upperValue))) {
      return text.noteMultiEdit.invalidCondition;
    }

    return '';
  };

  const matchesNoteMultiEditCondition = (note: Note, condition: NoteMultiEditCondition) => {
    const isEmpty = () => {
      if (condition.field === 'speed') {
        return !note.speed?.trim();
      }

      if (condition.field === 'parentId') {
        return note.parentId === null;
      }

      if (condition.field === 'appearMode') {
        return !note.appearMode;
      }

      return false;
    };

    if (condition.operator === 'empty') {
      return isEmpty();
    }

    if (condition.operator === 'notEmpty') {
      return !isEmpty();
    }

    if (condition.field === 'appearMode') {
      const currentValue = note.appearMode ?? 'none';
      const targetValue = condition.value === '' ? 'none' : condition.value;
      return condition.operator === 'notEquals'
        ? currentValue !== targetValue
        : currentValue === targetValue;
    }

    const getNumericValue = () => {
      if (condition.field === 'type') return note.type;
      if (condition.field === 'lane') return note.lane;
      if (condition.field === 'time') return getTimeposFromTime(note.time);
      if (condition.field === 'width') return note.width;
      if (condition.field === 'parentId') return note.parentId;
      return getSimpleNoteSpeedValue(note);
    };

    const currentValue = getNumericValue();
    if (currentValue === null) {
      return false;
    }

    const conditionValue = Number(condition.value);
    const conditionUpperValue = Number(condition.upperValue);
    const lowerValue = Math.min(conditionValue, conditionUpperValue);
    const upperValue = Math.max(conditionValue, conditionUpperValue);

    if (condition.operator === 'equals') {
      return Math.abs(currentValue - conditionValue) <= SNAP_EPSILON;
    }

    if (condition.operator === 'notEquals') {
      return Math.abs(currentValue - conditionValue) > SNAP_EPSILON;
    }

    if (condition.operator === 'between') {
      return currentValue >= lowerValue - SNAP_EPSILON && currentValue <= upperValue + SNAP_EPSILON;
    }

    if (condition.operator === 'outside') {
      return currentValue < lowerValue - SNAP_EPSILON || currentValue > upperValue + SNAP_EPSILON;
    }

    if (condition.operator === 'atLeast') {
      return currentValue >= conditionValue - SNAP_EPSILON;
    }

    return currentValue <= conditionValue + SNAP_EPSILON;
  };

  const applyNoteMultiEdit = (request: NoteMultiEditRequest): NoteMultiEditResult => {
    const isApplyingToAllNotes = selectedNoteIds.length === 0;
    const selectedIdSet = new Set(selectedNoteIds);
    const targetNotes = stateRef.current.notes
      .filter(note => isApplyingToAllNotes || selectedIdSet.has(note.id))
      .sort((a, b) => (
        a.time - b.time
        || a.lane - b.lane
        || a.id - b.id
      ));

    if (targetNotes.length === 0) {
      return {
        changedCount: 0,
        matchedCount: 0,
        message: text.noteMultiEdit.noNotesInChart,
      };
    }

    const invalidConditionMessage = request.conditions
      .map(validateNoteMultiEditCondition)
      .find(Boolean);
    if (invalidConditionMessage) {
      return {
        changedCount: 0,
        matchedCount: 0,
        message: invalidConditionMessage,
      };
    }

    const parsedLowerValue = Number(request.lowerValue);
    const parsedUpperValue = Number(request.upperValue);
    const isNumericTarget = request.target !== 'appearMode' && request.target !== 'complexSpeed';
    if (isNumericTarget && (!Number.isFinite(parsedLowerValue) || !Number.isFinite(parsedUpperValue))) {
      return {
        changedCount: 0,
        matchedCount: 0,
        message: text.noteMultiEdit.invalidRange,
      };
    }

    const lowerAppearModeIndex = APPEAR_MODE_OPTIONS.indexOf(request.lowerValue as typeof APPEAR_MODE_OPTIONS[number]);
    const upperAppearModeIndex = APPEAR_MODE_OPTIONS.indexOf(request.upperValue as typeof APPEAR_MODE_OPTIONS[number]);
    if (request.target === 'appearMode' && (lowerAppearModeIndex < 0 || upperAppearModeIndex < 0)) {
      return {
        changedCount: 0,
        matchedCount: 0,
        message: text.noteMultiEdit.invalidRange,
      };
    }

    const lowerComplexNscValue = request.lowerValue.trim();
    const upperComplexNscValue = request.upperValue.trim();
    const lowerComplexNscKeyframes = request.target === 'complexSpeed'
      ? parseComplexNscKeyframes(lowerComplexNscValue)
      : null;
    const upperComplexNscKeyframes = request.target === 'complexSpeed'
      ? parseComplexNscKeyframes(upperComplexNscValue)
      : null;
    if (request.target === 'complexSpeed') {
      if (!lowerComplexNscKeyframes || !upperComplexNscKeyframes) {
        return {
          changedCount: 0,
          matchedCount: 0,
          message: text.noteMultiEdit.invalidComplexNsc,
        };
      }

      if (lowerComplexNscValue !== upperComplexNscValue && lowerComplexNscKeyframes.length !== upperComplexNscKeyframes.length) {
        return {
          changedCount: 0,
          matchedCount: 0,
          message: text.noteMultiEdit.complexNscKeyframeMismatch,
        };
      }
    }

    const easingOption = CURVE_EASINGS_BY_ID.get(request.easingId as CurveEasingId);
    if (!easingOption) {
      return {
        changedCount: 0,
        matchedCount: 0,
        message: text.operations.easingValidation,
      };
    }

    const matchedNotes = targetNotes.filter(note => (
      request.conditions.every(condition => matchesNoteMultiEditCondition(note, condition))
    ));

    if (matchedNotes.length === 0) {
      return {
        changedCount: 0,
        matchedCount: 0,
        message: text.noteMultiEdit.noMatchingNotes,
      };
    }

    const getNextNumericValue = (currentValue: number, editValue: number) => {
      if (request.operation === 'add') {
        return currentValue + editValue;
      }

      if (request.operation === 'multiply') {
        return currentValue * editValue;
      }

      return editValue;
    };

    const nextNotesById = new Map<number, Note>();

    matchedNotes.forEach((note, index) => {
      const progress = matchedNotes.length <= 1 ? 0 : index / (matchedNotes.length - 1);
      const easedProgress = easingOption.ease(progress);
      const editValue = request.target === 'appearMode'
        ? lowerAppearModeIndex + (upperAppearModeIndex - lowerAppearModeIndex) * easedProgress
        : parsedLowerValue + (parsedUpperValue - parsedLowerValue) * easedProgress;
      let nextNote: Note | null = null;

      if (request.target === 'lane') {
        const nextLane = getNextNumericValue(note.lane, editValue);
        nextNote = Math.abs(nextLane - note.lane) > SNAP_EPSILON ? { ...note, lane: nextLane } : null;
      } else if (request.target === 'time') {
        const currentTimepos = getTimeposFromTime(note.time);
        const nextTimepos = Math.max(0, getNextNumericValue(currentTimepos, editValue));
        const nextTime = getTimeFromTimepos(nextTimepos);
        nextNote = Math.abs(nextTime - note.time) > SNAP_EPSILON ? { ...note, time: nextTime } : null;
      } else if (request.target === 'width') {
        const nextWidth = Math.max(0, getNextNumericValue(note.width, editValue));
        nextNote = Math.abs(nextWidth - note.width) > SNAP_EPSILON ? { ...note, width: nextWidth } : null;
      } else if (request.target === 'type') {
        const nextType = getNearestAvailableNoteType(getNextNumericValue(note.type, editValue));
        const normalizedUpdates = shouldOmitParentForType(nextType)
          ? { type: nextType, parentId: null }
          : { type: nextType };
        nextNote = note.type !== nextType || ('parentId' in normalizedUpdates && note.parentId !== null)
          ? { ...note, ...normalizedUpdates }
          : null;
      } else if (request.target === 'appearMode') {
        const nextAppearMode = getAppearModeFromValue(APPEAR_MODE_OPTIONS[Math.round(editValue)] ?? 'none');
        nextNote = note.appearMode !== nextAppearMode ? { ...note, appearMode: nextAppearMode } : null;
      } else if (request.target === 'complexSpeed') {
        const nextComplexNsc = lowerComplexNscValue === upperComplexNscValue
          ? lowerComplexNscValue
          : formatComplexNscKeyframes((lowerComplexNscKeyframes ?? []).map((lowerKeyframe, keyframeIndex) => {
            const upperKeyframe = upperComplexNscKeyframes?.[keyframeIndex] ?? lowerKeyframe;
            return {
              timeOffset: lowerKeyframe.timeOffset + (upperKeyframe.timeOffset - lowerKeyframe.timeOffset) * easedProgress,
              valueOffset: lowerKeyframe.valueOffset + (upperKeyframe.valueOffset - lowerKeyframe.valueOffset) * easedProgress,
            };
          }));
        nextNote = note.speed !== nextComplexNsc ? { ...note, speed: nextComplexNsc } : null;
      } else {
        const currentSpeed = getSimpleNoteSpeedValue(note);
        if (request.operation === 'to' || currentSpeed !== null) {
          const nextSpeed = getNextNumericValue(currentSpeed ?? 1, editValue);
          const nextSpeedText = formatNoteMultiEditNumber(nextSpeed);
          nextNote = note.speed !== nextSpeedText ? { ...note, speed: nextSpeedText } : null;
        }
      }

      if (nextNote) {
        nextNotesById.set(note.id, nextNote);
      }
    });

    if (nextNotesById.size === 0) {
      return {
        changedCount: 0,
        matchedCount: matchedNotes.length,
        message: formatTranslation(text.noteMultiEdit.noChangedNotes, { count: matchedNotes.length }),
      };
    }

    const changedNoteIds = Array.from(nextNotesById.keys());
    const targetLabel = text.noteMultiEdit.targets[request.target];
    const operationLabel = text.noteMultiEdit.operations[request.operation];
    const conditionDetail = request.conditions.length > 0
      ? formatTranslation(text.noteMultiEdit.historyConditions, { count: request.conditions.length })
      : text.noteMultiEdit.historyNoConditions;

    recordOperation({
      category: 'note',
      title: formatTranslation(text.noteMultiEdit.historyTitle, { count: nextNotesById.size }),
      detail: `${targetLabel}, ${operationLabel}, ${request.lowerValue} -> ${request.upperValue}, ${easingOption.label}, ${conditionDetail}, ${formatTranslation(text.operations.idsDetail, { ids: formatGroupedIds(changedNoteIds) })}`,
    });

    setNotes(prev => prev.map(note => nextNotesById.get(note.id) ?? note));
    clearActiveNoteInteraction();

    return {
      changedCount: nextNotesById.size,
      matchedCount: matchedNotes.length,
      message: formatTranslation(text.noteMultiEdit.appliedToNotes, {
        changed: nextNotesById.size,
        matched: matchedNotes.length,
      }),
    };
  };
  const formatCameraRotationToolNumber = (value: number) => {
    const roundedValue = Number(value.toFixed(4));
    return Object.is(roundedValue, -0) ? '0' : roundedValue.toString();
  };

  const getCameraRotationToolTiltFromLane = (lane: number) => (
    (lane + CAMERA_ROTATION_TOOL_NOTE_WIDTH / 2 - X_POSITION_COUNT / 2)
    / PREVIEW_CONNECTOR_TILT_DIVISOR
  );

  const getFarCameraRotationToolTiltPair = (averageTiltDegrees: number): [number, number] => {
    const averageLane = getCameraRotationToolLaneFromTilt(averageTiltDegrees);
    const minimumDistance = CAMERA_ROTATION_TOOL_FAR_LANE_MAGNITUDE + Math.abs(averageLane);
    const firstLane = Math.max(
      CAMERA_ROTATION_TOOL_FAR_LANE_MAGNITUDE,
      averageLane + minimumDistance,
    );
    const secondLane = 2 * averageLane - firstLane;

    return [
      getCameraRotationToolTiltFromLane(firstLane),
      getCameraRotationToolTiltFromLane(secondLane),
    ];
  };

  const isCameraRotationToolTiltFarOutOfBounds = (tiltDegrees: number) => {
    const lane = getCameraRotationToolLaneFromTilt(tiltDegrees);
    return lane <= -CAMERA_ROTATION_TOOL_FAR_LANE_MAGNITUDE || lane >= CAMERA_ROTATION_TOOL_FAR_LANE_MAGNITUDE;
  };

  const isCameraRotationToolTiltWithinCorrectionBounds = (tiltDegrees: number) => {
    const lane = getCameraRotationToolLaneFromTilt(tiltDegrees);
    return Math.abs(lane) <= CAMERA_ROTATION_TOOL_MAX_CORRECTION_LANE_MAGNITUDE;
  };

  const getCameraRotationToolLaneFromTilt = (tiltDegrees: number) => (
    X_POSITION_COUNT / 2
    + tiltDegrees * PREVIEW_CONNECTOR_TILT_DIVISOR
    - CAMERA_ROTATION_TOOL_NOTE_WIDTH / 2
  );

  const getCameraRotationToolPlayfieldSide = (lane: number) => {
    if (lane + CAMERA_ROTATION_TOOL_NOTE_WIDTH <= CAMERA_ROTATION_TOOL_FORBIDDEN_LANE_MIN) {
      return -1;
    }

    if (lane >= CAMERA_ROTATION_TOOL_FORBIDDEN_LANE_MAX) {
      return 1;
    }

    return 0;
  };

  const isCameraRotationToolLaneClearOfPlayfield = (lane: number) => (
    getCameraRotationToolPlayfieldSide(lane) !== 0
  );

  const isCameraRotationToolLaneSegmentClearOfPlayfield = (startLane: number, endLane: number) => {
    const startSide = getCameraRotationToolPlayfieldSide(startLane);
    const endSide = getCameraRotationToolPlayfieldSide(endLane);
    return startSide !== 0 && startSide === endSide;
  };

  const getCameraRotationToolCorrectionTiltsForCount = (
    startNativeCount: number,
    startNativeTiltTotal: number,
    startTargetAngle: number,
    endNativeCount: number,
    endNativeTiltTotal: number,
    endTargetAngle: number,
    connectorCount: number,
  ) => {
    const startCorrectionTilt = (
      startTargetAngle * (startNativeCount + connectorCount)
      - startNativeTiltTotal
    ) / connectorCount;
    const endCorrectionTilt = (
      endTargetAngle * (endNativeCount + connectorCount)
      - endNativeTiltTotal
    ) / connectorCount;
    const startCorrectionLane = getCameraRotationToolLaneFromTilt(startCorrectionTilt);
    const endCorrectionLane = getCameraRotationToolLaneFromTilt(endCorrectionTilt);

    if (
      !isCameraRotationToolTiltFarOutOfBounds(startCorrectionTilt)
      || !isCameraRotationToolTiltFarOutOfBounds(endCorrectionTilt)
      || !isCameraRotationToolTiltWithinCorrectionBounds(startCorrectionTilt)
      || !isCameraRotationToolTiltWithinCorrectionBounds(endCorrectionTilt)
      || !isCameraRotationToolLaneSegmentClearOfPlayfield(startCorrectionLane, endCorrectionLane)
    ) {
      return null;
    }

    return Array.from({ length: connectorCount }, () => ({
      startTiltDegrees: startCorrectionTilt,
      endTiltDegrees: endCorrectionTilt,
    }));
  };

  const getCameraRotationToolFallbackCorrectionTilts = (
    startNativeCount: number,
    startNativeTiltTotal: number,
    startTargetAngle: number,
    endNativeCount: number,
    endNativeTiltTotal: number,
    endTargetAngle: number,
  ) => {
    const startGeneratedAverageTilt = (
      startTargetAngle * (startNativeCount + 2)
      - startNativeTiltTotal
    ) / 2;
    const endGeneratedAverageTilt = (
      endTargetAngle * (endNativeCount + 2)
      - endNativeTiltTotal
    ) / 2;
    const [firstStartTilt, secondStartTilt] = getFarCameraRotationToolTiltPair(startGeneratedAverageTilt);
    const [firstEndTilt, secondEndTilt] = getFarCameraRotationToolTiltPair(endGeneratedAverageTilt);
    return [
      { startTiltDegrees: firstStartTilt, endTiltDegrees: firstEndTilt },
      { startTiltDegrees: secondStartTilt, endTiltDegrees: secondEndTilt },
    ];
  };

  const findCameraRotationToolCorrectionConnectorCount = (
    startNativeCount: number,
    startNativeTiltTotal: number,
    startTargetAngle: number,
    endNativeCount: number,
    endNativeTiltTotal: number,
    endTargetAngle: number,
  ) => {
    for (let connectorCount = 1; connectorCount <= CAMERA_ROTATION_TOOL_MAX_CORRECTION_CONNECTORS; connectorCount += 1) {
      if (getCameraRotationToolCorrectionTiltsForCount(
        startNativeCount,
        startNativeTiltTotal,
        startTargetAngle,
        endNativeCount,
        endNativeTiltTotal,
        endTargetAngle,
        connectorCount,
      )) {
        return connectorCount;
      }
    }

    return null;
  };

  const getCameraRotationToolCorrectionTilts = (
    startNativeCount: number,
    startNativeTiltTotal: number,
    startTargetAngle: number,
    endNativeCount: number,
    endNativeTiltTotal: number,
    endTargetAngle: number,
    preferredConnectorCount?: number | null,
  ) => {
    if (preferredConnectorCount !== undefined && preferredConnectorCount !== null) {
      const preferredCorrectionTilts = getCameraRotationToolCorrectionTiltsForCount(
        startNativeCount,
        startNativeTiltTotal,
        startTargetAngle,
        endNativeCount,
        endNativeTiltTotal,
        endTargetAngle,
        preferredConnectorCount,
      );

      if (preferredCorrectionTilts) {
        return preferredCorrectionTilts;
      }
    }

    const connectorCount = findCameraRotationToolCorrectionConnectorCount(
      startNativeCount,
      startNativeTiltTotal,
      startTargetAngle,
      endNativeCount,
      endNativeTiltTotal,
      endTargetAngle,
    );

    return connectorCount !== null
      ? getCameraRotationToolCorrectionTiltsForCount(
        startNativeCount,
        startNativeTiltTotal,
        startTargetAngle,
        endNativeCount,
        endNativeTiltTotal,
        endTargetAngle,
        connectorCount,
      )!
      : getCameraRotationToolFallbackCorrectionTilts(
        startNativeCount,
        startNativeTiltTotal,
        startTargetAngle,
        endNativeCount,
        endNativeTiltTotal,
        endTargetAngle,
      );
  };

  const applyCameraRotationTool = (request: CameraRotationToolRequest): CameraRotationToolResult => {
    if (!hasPinkHoldCameraToolNotes) {
      return {
        generatedNoteCount: 0,
        intervalCount: 0,
        message: text.cameraRotationTool.noPinkHold,
      };
    }

    const sortedRequestKeyframes = [...request.keyframes]
      .filter(keyframe => Number.isFinite(keyframe.location) && (keyframe.angle === 'native' || Number.isFinite(keyframe.angle)))
      .sort((a, b) => a.location - b.location);
    const sortedKeyframes = sortedRequestKeyframes.map((keyframe, keyframeIndex) => {
      if (keyframe.angle === 'native') {
        return keyframe;
      }

      const halfTurnCenter = getCameraRotationToolHalfTurnCenter(keyframe.angle);
      const neighboringKeyframes = [
        sortedRequestKeyframes[keyframeIndex - 1],
        sortedRequestKeyframes[keyframeIndex + 1],
      ];
      const preferUpperHalfTurnMargin = isCameraRotationToolHalfTurnAngle(keyframe.angle)
        && neighboringKeyframes.some(neighboringKeyframe => (
          neighboringKeyframe
          && neighboringKeyframe.angle !== 'native'
          && doesCameraRotationToolAnglePreferUpperHalfTurnMargin(neighboringKeyframe.angle, halfTurnCenter)
        ));

      return {
        ...keyframe,
        angle: stabilizeCameraRotationToolTargetAngle(keyframe.angle, preferUpperHalfTurnMargin),
      };
    });

    if (sortedKeyframes.length < 2) {
      return {
        generatedNoteCount: 0,
        intervalCount: 0,
        message: text.cameraRotationTool.needTwoKeyframes,
      };
    }

    const generatedNotes: Note[] = [];
    let nextGeneratedId = Math.max(
      nextNoteIdRef.current,
      stateRef.current.notes.reduce((maxId, note) => Math.max(maxId, note.id), 0) + 1,
    );
    let generatedIntervalCount = 0;
    const activeGeneratedChains: Array<{
      correctionCount: number;
      lastLane: number;
      lastNoteId: number;
      lastTimepos: number;
    } | null> = [];

    const resetGeneratedChains = () => {
      activeGeneratedChains.length = 0;
    };

    const addGeneratedChainSegment = (
      startTimepos: number,
      endTimepos: number,
      startTiltDegrees: number,
      endTiltDegrees: number,
      chainIndex: number,
      correctionCount: number,
    ) => {
      const roundedStartTimepos = roundCameraRotationToolChartValue(startTimepos);
      const roundedEndTimepos = roundCameraRotationToolChartValue(endTimepos);
      const startTime = getTimeFromTimepos(roundedStartTimepos);
      const endTime = getTimeFromTimepos(roundedEndTimepos);
      if (endTime - startTime <= SNAP_EPSILON) {
        return false;
      }

      const startLane = roundCameraRotationToolChartValue(getCameraRotationToolLaneFromTilt(startTiltDegrees));
      const endLane = roundCameraRotationToolChartValue(getCameraRotationToolLaneFromTilt(endTiltDegrees));
      if (
        !isCameraRotationToolLaneClearOfPlayfield(startLane)
        || !isCameraRotationToolLaneClearOfPlayfield(endLane)
        || !isCameraRotationToolLaneSegmentClearOfPlayfield(startLane, endLane)
      ) {
        return false;
      }

      const activeChain = activeGeneratedChains[chainIndex] ?? null;
      const canContinueChain = Boolean(
        activeChain
        && activeChain.correctionCount === correctionCount
        && Math.abs(activeChain.lastTimepos - roundedStartTimepos) <= SNAP_EPSILON
        && Math.abs(activeChain.lastLane - startLane) <= CAMERA_ROTATION_TOOL_CHAIN_LANE_EPSILON
      );

      if (canContinueChain && activeChain) {
        const childId = nextGeneratedId++;
        generatedNotes.push({
          id: childId,
          time: endTime,
          lane: endLane,
          type: CAMERA_ROTATION_TOOL_DAMAGE_HOLD_TYPE,
          width: CAMERA_ROTATION_TOOL_NOTE_WIDTH,
          parentId: activeChain.lastNoteId,
        });
        activeGeneratedChains[chainIndex] = {
          correctionCount,
          lastLane: endLane,
          lastNoteId: childId,
          lastTimepos: roundedEndTimepos,
        };
        return true;
      }

      const parentId = nextGeneratedId++;
      const childId = nextGeneratedId++;
      generatedNotes.push({
        id: parentId,
        time: startTime,
        lane: startLane,
        type: CAMERA_ROTATION_TOOL_DAMAGE_HOLD_TYPE,
        width: CAMERA_ROTATION_TOOL_NOTE_WIDTH,
        parentId,
      }, {
        id: childId,
        time: endTime,
        lane: endLane,
        type: CAMERA_ROTATION_TOOL_DAMAGE_HOLD_TYPE,
        width: CAMERA_ROTATION_TOOL_NOTE_WIDTH,
        parentId,
      });
      activeGeneratedChains[chainIndex] = {
        correctionCount,
        lastLane: endLane,
        lastNoteId: childId,
        lastTimepos: roundedEndTimepos,
      };
      return true;
    };

    for (let keyframeIndex = 0; keyframeIndex < sortedKeyframes.length - 1; keyframeIndex += 1) {
      const currentKeyframe = sortedKeyframes[keyframeIndex];
      const nextKeyframe = sortedKeyframes[keyframeIndex + 1];
      const intervalStart = roundCameraRotationToolChartValue(Math.max(0, currentKeyframe.location));
      const intervalEnd = roundCameraRotationToolChartValue(Math.max(intervalStart, nextKeyframe.location));
      if (intervalEnd - intervalStart <= SNAP_EPSILON || currentKeyframe.angle === 'native') {
        resetGeneratedChains();
        continue;
      }

      const splitPoints = new Set<number>([intervalStart, intervalEnd]);
      cameraRotationToolBaseTiltSegments.forEach((segment) => {
        if (segment.startTimepos > intervalStart + SNAP_EPSILON && segment.startTimepos < intervalEnd - SNAP_EPSILON) {
          splitPoints.add(roundCameraRotationToolChartValue(segment.startTimepos));
        }

        if (segment.endTimepos > intervalStart + SNAP_EPSILON && segment.endTimepos < intervalEnd - SNAP_EPSILON) {
          splitPoints.add(roundCameraRotationToolChartValue(segment.endTimepos));
        }
      });

      const sortedSplitPoints = Array.from(splitPoints).sort((a, b) => a - b);
      const getIntervalTargetAngle = (timepos: number) => {
        if (nextKeyframe.angle === 'native') {
          return currentKeyframe.angle;
        }

        const progress = (timepos - intervalStart) / (intervalEnd - intervalStart);
        const clampedProgress = Math.max(0, Math.min(1, progress));
        return currentKeyframe.angle + (nextKeyframe.angle - currentKeyframe.angle) * clampedProgress;
      };

      const correctionSpans: Array<{
        startTimepos: number;
        endTimepos: number;
        startNativeCount: number;
        startNativeTiltTotal: number;
        startTargetAngle: number;
        endNativeCount: number;
        endNativeTiltTotal: number;
        endTargetAngle: number;
      }> = [];

      for (let splitIndex = 0; splitIndex < sortedSplitPoints.length - 1; splitIndex += 1) {
        const startTimepos = sortedSplitPoints[splitIndex];
        const endTimepos = sortedSplitPoints[splitIndex + 1];
        if (endTimepos - startTimepos <= SNAP_EPSILON) {
          continue;
        }

        const endSampleTimepos = Math.max(
          startTimepos,
          endTimepos - (10 ** -CAMERA_ROTATION_TOOL_CHART_PRECISION) / 2,
        );
        const startNativeTiltState = getCameraRotationToolNativeTiltState(startTimepos);
        const endNativeTiltState = getCameraRotationToolNativeTiltState(endSampleTimepos);
        const startTargetAngle = getIntervalTargetAngle(startTimepos);
        const endTargetAngle = getIntervalTargetAngle(endTimepos);
        if (
          Math.abs(startNativeTiltState.tiltDegrees - startTargetAngle) <= CAMERA_ROTATION_TOOL_TARGET_EPSILON
          && Math.abs(endNativeTiltState.tiltDegrees - endTargetAngle) <= CAMERA_ROTATION_TOOL_TARGET_EPSILON
        ) {
          continue;
        }

        correctionSpans.push({
          startTimepos,
          endTimepos,
          startNativeCount: startNativeTiltState.count,
          startNativeTiltTotal: startNativeTiltState.tiltTotal,
          startTargetAngle,
          endNativeCount: endNativeTiltState.count,
          endNativeTiltTotal: endNativeTiltState.tiltTotal,
          endTargetAngle,
        });
      }

      let stableCorrectionConnectorCount: number | null = null;
      for (let connectorCount = 1; connectorCount <= CAMERA_ROTATION_TOOL_MAX_CORRECTION_CONNECTORS; connectorCount += 1) {
        if (correctionSpans.every(span => getCameraRotationToolCorrectionTiltsForCount(
          span.startNativeCount,
          span.startNativeTiltTotal,
          span.startTargetAngle,
          span.endNativeCount,
          span.endNativeTiltTotal,
          span.endTargetAngle,
          connectorCount,
        ))) {
          stableCorrectionConnectorCount = connectorCount;
          break;
        }
      }

      let previousCorrectionSpanEndTimepos: number | null = null;
      correctionSpans.forEach((span) => {
        if (
          previousCorrectionSpanEndTimepos !== null
          && span.startTimepos - previousCorrectionSpanEndTimepos > SNAP_EPSILON
        ) {
          resetGeneratedChains();
        }

        const correctionTilts = getCameraRotationToolCorrectionTilts(
          span.startNativeCount,
          span.startNativeTiltTotal,
          span.startTargetAngle,
          span.endNativeCount,
          span.endNativeTiltTotal,
          span.endTargetAngle,
          stableCorrectionConnectorCount,
        );
        const emittedCorrectionCount = correctionTilts.reduce((count, { startTiltDegrees, endTiltDegrees }, correctionIndex) => (
          addGeneratedChainSegment(
            span.startTimepos,
            span.endTimepos,
            startTiltDegrees,
            endTiltDegrees,
            correctionIndex,
            correctionTilts.length,
          )
            ? count + 1
            : count
        ), 0);
        activeGeneratedChains.length = correctionTilts.length;
        if (emittedCorrectionCount > 0) {
          generatedIntervalCount += 1;
        }
        previousCorrectionSpanEndTimepos = span.endTimepos;
      });
    }

    if (generatedNotes.length === 0) {
      return {
        generatedNoteCount: 0,
        intervalCount: 0,
        message: text.cameraRotationTool.noGeneratedNotes,
      };
    }

    const previousGeneratedNoteIdSet = new Set(cameraRotationToolGeneratedNoteIds);
    const baseNotes = stateRef.current.notes.filter(note => !previousGeneratedNoteIdSet.has(note.id));
    const generatedNoteIds = generatedNotes.map(note => note.id);
    const keyframeDetail = sortedKeyframes
      .map((keyframe: CameraRotationToolKeyframe) => `${formatCameraRotationToolNumber(keyframe.location)}:${keyframe.angle === 'native' ? 'native' : formatCameraRotationToolNumber(keyframe.angle)}`)
      .join(';');

    nextNoteIdRef.current = nextGeneratedId;
    recordOperation({
      category: 'note',
      title: text.cameraRotationTool.historyTitle,
      detail: formatTranslation(text.cameraRotationTool.historyDetail, {
        notes: generatedNotes.length,
        intervals: generatedIntervalCount,
        keyframes: keyframeDetail,
      }),
    });
    setNotes([...baseNotes, ...generatedNotes]);
    setCameraRotationToolGeneratedNoteIds(generatedNoteIds);
    clearActiveNoteInteraction();

    return {
      generatedNoteCount: generatedNotes.length,
      intervalCount: generatedIntervalCount,
      message: formatTranslation(text.cameraRotationTool.applied, {
        notes: generatedNotes.length,
        intervals: generatedIntervalCount,
      }),
    };
  };
  const updateBpmChange = (index: number, updates: Partial<BpmChange>) => {
    const previousChange = bpmChanges[index];
    if (!previousChange) return;

    const nextChange = { ...previousChange, ...updates };
    const changedFields = Object.entries(updates).filter(([key, value]) => (
      previousChange[key as keyof BpmChange] !== value
    ));

    if (changedFields.length === 0) return;

    setBpmChanges(prev => prev.map((change, changeIndex) => (
      changeIndex === index ? nextChange : change
    )));

    recordOperation({
      category: 'timing',
      title: text.operations.modifiedBpmChange,
      detail: `${formatTimingPosition(getBpmChangeTimepos(previousChange))} | ${changedFields.map(([key, value]) => `${key}: ${previousChange[key as keyof BpmChange]} -> ${value}`).join('; ')}`,
    });
  };

  const deleteBpmChange = (index: number) => {
    const deletedChange = bpmChanges[index];
    if (!deletedChange) return;

    setBpmChanges(prev => prev.filter((_, changeIndex) => changeIndex !== index));
    recordOperation({
      category: 'timing',
      title: text.operations.deletedBpmChange,
      detail: `${formatTimingPosition(getBpmChangeTimepos(deletedChange))} | BPM ${formatHistoryNumber(deletedChange.bpm)} | ${deletedChange.timeSignature}`,
    });
  };

  const addBpmChange = () => {
    const sortedChanges = [...bpmChanges].sort((a, b) => getBpmChangeTimepos(a) - getBpmChangeTimepos(b));
    const lastChange = sortedChanges[sortedChanges.length - 1];
    const timepos = Number(getTimeposFromTime(currentTime).toFixed(6));
    const newChange = {
      timepos,
      bpm: lastChange ? lastChange.bpm : 120,
      timeSignature: isOfficialChartFormat ? '4/4' : (lastChange ? lastChange.timeSignature : '4/4'),
    };

    setBpmChanges([...bpmChanges, newChange]);
    renderPausedTimelineAtFullFps();
    recordOperation({
      category: 'timing',
      title: text.operations.addedBpmChange,
      detail: `${formatTimingPosition(newChange.timepos)} | BPM ${formatHistoryNumber(newChange.bpm)} | ${newChange.timeSignature}`,
    });
  };

  const updateSpeedChange = (index: number, updates: Partial<SpeedChange>) => {
    const previousChange = speedChanges[index];
    if (!previousChange) return;

    const nextChange = { ...previousChange, ...updates };
    const changedFields = Object.entries(updates).filter(([key, value]) => (
      previousChange[key as keyof SpeedChange] !== value
    ));

    if (changedFields.length === 0) return;

    setSpeedChanges(prev => prev.map((change, changeIndex) => (
      changeIndex === index ? nextChange : change
    )));

    recordOperation({
      category: 'speed',
      title: text.operations.modifiedSpeedChange,
      detail: `${formatTimingPosition(previousChange.timepos)} | ${changedFields.map(([key, value]) => `${key}: ${previousChange[key as keyof SpeedChange]} -> ${value}`).join('; ')}`,
    });
  };

  const deleteSpeedChange = (index: number) => {
    const deletedChange = speedChanges[index];
    if (!deletedChange) return;

    setSpeedChanges(prev => prev.filter((_, changeIndex) => changeIndex !== index));
    recordOperation({
      category: 'speed',
      title: text.operations.deletedSpeedChange,
      detail: `${formatTimingPosition(deletedChange.timepos)} | ${formatHistoryNumber(deletedChange.speedChange)}x`,
    });
  };

  const addSpeedChange = () => {
    const newChange = {
      timepos: Number(getTimeposFromTime(currentTime).toFixed(6)),
      speedChange: 1,
    };

    setSpeedChanges([...speedChanges, newChange]);
    renderPausedTimelineAtFullFps();
    recordOperation({
      category: 'speed',
      title: text.operations.addedSpeedChange,
      detail: `${formatTimingPosition(newChange.timepos)} | ${formatHistoryNumber(newChange.speedChange)}x`,
    });
  };

  const handleGenerateSpeedCurveChanges = () => {
    const startId = speedCurveStartIdInput.trim() === '' ? NaN : Number(speedCurveStartIdInput);
    const endId = speedCurveEndIdInput.trim() === '' ? NaN : Number(speedCurveEndIdInput);
    const curveDensity = Number(speedCurveDensityInput);
    const curveEasingOption = CURVE_EASINGS_BY_ID.get(getCurveEasingId(speedCurveEasingFamily, speedCurveEasingType));

    if (!Number.isInteger(startId) || !Number.isInteger(endId)) {
      setSpeedCurveMessage(text.operations.speedChangeIdValidation);
      return;
    }

    if (startId === endId) {
      setSpeedCurveMessage(text.operations.differentSpeedChangeIdsValidation);
      return;
    }

    if (startId < 1 || startId > speedChanges.length || endId < 1 || endId > speedChanges.length) {
      setSpeedCurveMessage(text.operations.existingSpeedChangesValidation);
      return;
    }

    if (!Number.isInteger(curveDensity) || curveDensity <= 0) {
      setSpeedCurveMessage(text.operations.densityValidation);
      return;
    }

    if (!curveEasingOption) {
      setSpeedCurveMessage(text.operations.easingValidation);
      return;
    }

    const startChange = speedChanges[startId - 1];
    const endChange = speedChanges[endId - 1];
    const startBeat = getBeatAtTimepos(startChange.timepos, timedBpmChanges);
    const endBeat = getBeatAtTimepos(endChange.timepos, timedBpmChanges);
    const snapBeats = getCurveSnapBeatsBetween(startBeat, endBeat, curveDensity, timedBpmChanges);

    if (snapBeats.length === 0) {
      setSpeedCurveMessage(formatTranslation(text.operations.noSnapPositionsBetweenSpeedChanges, { density: curveDensity }));
      return;
    }

    const beatSpan = endBeat - startBeat;
    const generatedChanges = snapBeats.map((beat) => {
      const progress = beatSpan === 0 ? 0 : (beat - startBeat) / beatSpan;
      const easedProgress = curveEasingOption.ease(progress);
      return {
        timepos: Number(getTimeposFromTime(getTimeAtBeat(beat, timedBpmChanges)).toFixed(6)),
        speedChange: Number((startChange.speedChange + (endChange.speedChange - startChange.speedChange) * easedProgress).toFixed(6)),
      };
    });

    setSpeedChanges([...speedChanges, ...generatedChanges]);
    renderPausedTimelineAtFullFps();
    setSpeedCurveMessage(
      formatTranslation(text.operations.generatedSpeedCurveChangesMessage, {
        count: generatedChanges.length,
        startId,
        endId,
      }),
    );

    recordOperation({
      category: 'speed',
      title: text.operations.generatedCurvedSpeedChanges,
      detail: `${generatedChanges.length} changes, 1/${curveDensity}, ${curveEasingOption.label}, IDs #${startId} -> #${endId}`,
    });
  };

  const updateOffset = (value: string | number) => {
    const previousOffset = offset;
    setOffset(value);

    if (previousOffset !== value) {
      recordOperation({
        category: 'timing',
        title: text.operations.modifiedOffset,
        detail: `${formatMaybeValue(previousOffset)} ms -> ${formatMaybeValue(value)} ms`,
      });
      if (Number(value) === 50) {
        completeCurrentTutorialObjective('offsetEdited');
      }
    }
  };

  const visibleOperationHistory = useMemo(
    () => shouldShowUndoneOperations
      ? operationHistory
      : operationHistory.filter(entry => !undoneOperationIds.has(entry.id)),
    [operationHistory, shouldShowUndoneOperations, undoneOperationIds],
  );

  const tierBadge = getTierBadge(projectData?.difficulty);
  const shouldBuildChartProjectFiles = !isPreviewMode && isLeftPanelContentVisible && activeLeftPanel === 'editInfo';
  const [chartProjectFileDetails, setChartProjectFileDetails] = useState<ChartProjectFileDetails>({});
  const [isChartProjectFilesPending, setIsChartProjectFilesPending] = useState(false);
  const chartProjectFiles = useMemo(() => buildChartProjectFiles({
    projectData,
    chartFileName,
    details: chartProjectFileDetails,
  }), [chartFileName, chartProjectFileDetails, projectData]);
  const previewedProjectFileText = useMemo(() => {
    if (!previewedProjectFile) return '';

    if (previewedProjectFile.id === 'chart') {
      return buildLevelText({
        projectData,
        notes,
        bpmChanges,
        speedChanges,
        offset,
      });
    }

    if (previewedProjectFile.id === 'info' && projectData) {
      const firstBpm = [...bpmChanges].sort((a, b) => getBpmChangeTimepos(a) - getBpmChangeTimepos(b))[0]?.bpm;
      return `${projectData.songName || ''}\n${projectData.songArtist || ''}\n${firstBpm || projectData.bpm}\n`;
    }

    return '';
  }, [bpmChanges, notes, offset, previewedProjectFile, projectData, speedChanges]);
  const savePreviewedChartText = useCallback((chartText: string): { ok: true } | { ok: false; lineNumber: number; message: string } => {
    try {
      const parsedLevel = parseValidatedLevelText(chartText);
      const nextBpmChanges = parsedLevel.bpmChanges.length > 0
        ? parsedLevel.bpmChanges
        : [{ timepos: 0, bpm: projectData?.bpm || 120, timeSignature: '4/4' }];
      const nextTimedBpmChanges = convertBpmChangesToTime(nextBpmChanges);
      const getNextTimeposFromTime = (time: number) => {
        const totalBeats = getBeatAtTime(time, nextTimedBpmChanges);
        let currentMeasureBeat = 0;
        let measureCount = 0;
        let currentBeatsPerMeasure = 4;

        while (measureCount < 10000) {
          const timeAtMeasure = getTimeAtBeat(currentMeasureBeat, nextTimedBpmChanges);
          const activeChange = getActiveChange(timeAtMeasure + 0.001, nextTimedBpmChanges);
          currentBeatsPerMeasure = parseInt(activeChange.timeSignature.split('/')[0], 10) || 4;

          if (totalBeats < currentMeasureBeat + currentBeatsPerMeasure) {
            break;
          }

          currentMeasureBeat += currentBeatsPerMeasure;
          measureCount++;
        }

        const beatInMeasure = totalBeats - currentMeasureBeat;
        return measureCount + beatInMeasure / currentBeatsPerMeasure;
      };

      recordOperation({
        category: 'note',
        title: text.operations.editedChartFile,
        detail: formatTranslation(text.operations.importedNotesFromChartText, { count: parsedLevel.notes.length }),
      });
      setNotes(parsedLevel.notes);
      setBpmChanges(nextBpmChanges);
      setSpeedChanges(parsedLevel.speedChanges);
      setOffset(parsedLevel.offset);
      setChartIssues(findChartIssues(parsedLevel.notes, getNextTimeposFromTime));
      return { ok: true };
    } catch (error) {
      const parsedError = error as Partial<{ lineNumber: number; message: string }>;
      return {
        ok: false,
        lineNumber: parsedError.lineNumber || 1,
        message: parsedError.message || text.operations.invalidChartFile,
      };
    }
  }, [projectData?.bpm, recordOperation]);

  useEffect(() => {
    if (!previewedProjectFile) {
      setPreviewedProjectFileUrl('');
      return;
    }

    if (previewedProjectFile.id === 'audio') {
      setPreviewedProjectFileUrl(projectData?.audioUrl || '');
      return;
    }

    if (previewedProjectFile.id !== 'illustration' || !projectData?.songIllustration) {
      setPreviewedProjectFileUrl('');
      return;
    }

    const url = URL.createObjectURL(projectData.songIllustration);
    setPreviewedProjectFileUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [previewedProjectFile, projectData]);

  useEffect(() => {
    if (!previewedProjectFile) return;

    const isPreviewedFileAvailable = chartProjectFiles.some(file => (
      file.id === previewedProjectFile.id && file.name === previewedProjectFile.name
    ));

    if (!isPreviewedFileAvailable) {
      setPreviewedProjectFile(null);
    }
  }, [chartProjectFiles, previewedProjectFile]);

  useEffect(() => {
    if (!shouldBuildChartProjectFiles) {
      setChartProjectFileDetails({});
      setIsChartProjectFilesPending(false);
      return;
    }

    let isCanceled = false;
    setIsChartProjectFilesPending(true);
    setChartProjectFileDetails({});

    const timeoutId = window.setTimeout(() => {
      void calculateChartProjectFileDetailsInWorker({
        projectData,
        notes,
        bpmChanges,
        speedChanges,
        offset,
      })
        .then((details) => {
          if (isCanceled) return;
          setChartProjectFileDetails(details);
          setIsChartProjectFilesPending(false);
        })
        .catch((error) => {
          if (isCanceled) return;
          console.error(error);
          setIsChartProjectFilesPending(false);
        });
    }, 100);

    return () => {
      isCanceled = true;
      window.clearTimeout(timeoutId);
    };
  }, [shouldBuildChartProjectFiles]);

  const jumpToNoteTime = (time: number) => {
    if (stateRef.current.isPlaying) {
      togglePlay();
    }

    let clampedTime = Math.max(0, time);
    if (timelineDuration > 0 && clampedTime > timelineDuration) {
      clampedTime = timelineDuration;
    }

    setCurrentTime(clampedTime);
    stateRef.current.currentTime = clampedTime;
    stateRef.current.playbackStartTime = clampedTime;
    stateRef.current.playbackStartPerformanceTime = performance.now();
    lastPlayedTimeRef.current = clampedTime;
    hitSoundCursorRef.current = findHitSoundCursor(clampedTime);
    scheduledHitSoundKeysRef.current.clear();

    if (audioRef.current) {
      const offsetInSeconds = parseFloat(offset.toString()) / 1000;
      audioRef.current.currentTime = getMediaTimeFromPlaybackTime(
        clampedTime,
        offsetInSeconds,
        audioTimingCorrectionRef.current,
      );
    }

    if (timeDisplayRef.current) {
      timeDisplayRef.current.textContent = formatTimelineMeasureProgress(clampedTime);
    }
    updateProgressBarValue(clampedTime, true);
    renderPausedTimelineAtFullFps();
  };

  const runTutorialOperation = <Args extends unknown[]>(
    operation: TutorialOperation,
    callback: (...args: Args) => void,
  ) => (...args: Args) => {
    if (!canUseTutorialOperation(operation)) return;
    callback(...args);
  };
  const runAsyncTutorialOperation = <Args extends unknown[], Result>(
    operation: TutorialOperation,
    callback: (...args: Args) => Promise<Result>,
    fallback: Result,
  ) => (...args: Args) => (
    canUseTutorialOperation(operation) ? callback(...args) : Promise.resolve(fallback)
  );

  const leftSidebarProps = {
    isLeftPanelCompact,
    isLeftPanelContentVisible,
    toggleLeftPanelCompact,
    activeLeftPanel,
    setActiveLeftPanel,
    openNscTool: () => setIsNscToolOpen(true),
    openNoteMultiEdit: () => setIsNoteMultiEditOpen(true),
    openCameraRotationTool: () => {
      if (hasPinkHoldCameraToolNotes) {
        setIsCameraRotationToolOpen(true);
      }
    },
    canOpenCameraRotationTool: hasPinkHoldCameraToolNotes,
    handleEditInfo,
    handleClearCopiedNotes,
    copiedNotesCount,
    currentParentInput,
    setCurrentParentInput,
    currentParentNote,
    selectedSingleNote,
    canUseSelectedAsParent,
    currentId,
    selectedNoteType,
    noteWidth,
    formData,
    setFormData,
    invalidMetadataFields: visibleInvalidMetadataFields,
    showMetadataFieldValidation,
    handleMetadataFieldKeyDown,
    illustrationPreview,
    chartProjectFiles,
    isChartProjectFilesPending,
    onPreviewProjectFile: setPreviewedProjectFile,
    infoBadge: leftSidebarInfoBadge,
    chartIssuesBadge: leftSidebarChartIssuesBadge,
    handleConfirm: runAsyncTutorialOperation('metadata', handleConfirm, undefined),
    offset,
    updateOffset: runTutorialOperation('offset', updateOffset),
    isOfficialChartFormat,
    bpmChangeGridClass,
    bpmChanges,
    changeTableJumpMarkerClass,
    jumpToNoteTime,
    getTimeFromTimepos,
    changeTableInputClass,
    updateBpmChange,
    deleteBpmChange,
    addBpmChange,
    speedChangeGridClass,
    speedChanges,
    updateSpeedChange,
    deleteSpeedChange,
    addSpeedChange,
    speedCurveStartIdInput,
    setSpeedCurveStartIdInput,
    speedCurveEndIdInput,
    setSpeedCurveEndIdInput,
    speedCurveStartChange,
    speedCurveEndChange,
    speedCurveDensityInput,
    setSpeedCurveDensityInput,
    hasValidSpeedCurveDensity,
    parsedSpeedCurveDensity,
    speedCurveEasingFamily,
    setSpeedCurveEasingFamily,
    speedCurveEasingType,
    setSpeedCurveEasingType,
    handleGenerateSpeedCurveChanges,
    canGenerateSpeedCurveChanges,
    speedCurveMessage,
    setSpeedCurveMessage,
    selectedNoteIdSet,
    curveStartIdInput,
    setCurveStartIdInput,
    curveEndIdInput,
    setCurveEndIdInput,
    curveIdSelectTarget,
    setCurveIdSelectTarget,
    curveStartNote,
    curveEndNote,
    curveNoteType,
    setCurveNoteType,
    timedBpmChanges,
    notePropertyInputClass,
    curveDensityInput,
    setCurveDensityInput,
    setCurveNotesMessage,
    hasValidCurveDensity,
    parsedCurveDensity,
    curveEasingFamily,
    setCurveEasingFamily,
    curveEasingType,
    setCurveEasingType,
    handleGenerateCurveNotes,
    canGenerateCurveNotes,
    curveNotesMessage,
    handleOrganizeNotes,
    notes,
    isOrganizingNotes,
    recheckChartIssues,
    chartIssues,
    shouldShowUndoneOperations,
    setShouldShowUndoneOperations,
    operationHistory,
    visibleOperationHistory,
    undoneOperationIds,
  };
  const canvasStageProps = {
    containerRef,
    handleWheel,
    projectData,
    emptyCanvasMessage,
    canvasRef,
    bpmChanges,
    speedChanges,
    gridZoom,
    pixelsPerBeat,
    currentTime,
    offset,
    stateRef,
    selectedNoteIds,
    selectionBox,
    timeDisplayRef,
    progressBarRef,
    isDraggingProgress,
    audioRef,
    isPreviewMode,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    getSelectionPointFromClient,
    handleCanvasMouseLeave,
    handleContextMenu,
  };
  const rightSidebarProps = {
    isRightPanelCompact,
    isRightPanelContentVisible,
    isOfficialChartFormat,
    toggleRightPanelCompact,
    selectedSingleNote,
    setSelectedNoteIds,
    notePropertyInputClass,
    updateSelectedNote,
    selectedNoteTimepos,
    getTimeFromTimepos,
    canEditSelectedNoteParent,
    selectedParentNote,
    jumpToNoteTime,
    selectedNoteIds,
    handleCopySelectedNotes,
    handleDeleteSelectedNotes,
    handleMirrorSelectedNotes,
    handleCenterSelectedNotes,
    notes,
    bpmChanges,
    speedChanges,
    currentEditorBpm,
    currentEditorSpeed,
    currentEditorDistance,
    currentEditorCombo,
    currentEditorScore,
    currentParentInput,
    setCurrentParentInput,
    currentParentNote,
    canUseSelectedAsParent,
    currentId,
    selectedNoteType,
    noteWidth,
  };
  const nscToolProps = {
    isOpen: isNscToolOpen,
    onClose: () => setIsNscToolOpen(false),
    selectedNote: selectedSingleNote,
    selectedNoteTimepos,
    currentBpm: selectedNoteBpm,
    isOfficialChartFormat,
    isBackdropBlurDisabled,
    isAnimationDisabled,
    playbackAudioUrl,
    chartOffset: offset,
    audioTimingCorrection,
    musicVolume,
    tapSoundVolume,
    getTimeFromTimepos,
    getTimeposFromTime,
    updateSelectedNote,
  };
  const noteMultiEditProps = {
    isOpen: isNoteMultiEditOpen,
    onClose: () => setIsNoteMultiEditOpen(false),
    selectedNotes: selectedNotesForMultiEdit,
    isBackdropBlurDisabled,
    isAnimationDisabled,
    onApply: applyNoteMultiEdit,
  };
  const cameraRotationToolProps = {
    isOpen: isCameraRotationToolOpen,
    onClose: () => setIsCameraRotationToolOpen(false),
    chartDurationTimepos: Math.max(1, totalTimelineMeasures),
    isBackdropBlurDisabled,
    isAnimationDisabled,
    getNativeAngleAtTimepos: getCameraRotationToolNativeAngleAtTimepos,
    onApply: applyCameraRotationTool,
  };

  return (
    <>
      <EditorLayout
        mode={mode}
        onBack={onBack}
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        formData={formData}
        setFormData={setFormData}
        invalidMetadataFields={visibleInvalidMetadataFields}
        showMetadataFieldValidation={showMetadataFieldValidation}
        handleMetadataFieldKeyDown={handleMetadataFieldKeyDown}
        handleConfirm={handleConfirm}
        isProjectAudioConverting={isProjectAudioConverting}
        isAudioOffsetNoticeOpen={isAudioOffsetNoticeOpen}
        setIsAudioOffsetNoticeOpen={setIsAudioOffsetNoticeOpen}
        projectData={projectData}
        playbackAudioUrl={playbackAudioUrl}
        audioRef={audioRef}
        onAudioLoadedMetadata={handleAudioLoadedMetadata}
        stateRef={stateRef}
        isExitWarningOpen={isExitWarningOpen}
        isSettingsOpen={isSettingsOpen}
        isHelpOpen={isHelpOpen}
        isDr3FpPreviewInfoOpen={isDr3FpPreviewInfoOpen}
        dr3FpPreviewStatus={dr3FpPreviewStatus}
        dr3FpPreviewLogs={dr3FpPreviewLogs}
        isExitWarningEnabled={isExitWarningEnabled}
        isBackdropBlurDisabled={isBackdropBlurDisabled}
        isAnimationDisabled={isAnimationDisabled}
        isScrollDirectionInverted={isScrollDirectionInverted}
        areTimingChangeIndicatorsAdjusted={areTimingChangeIndicatorsAdjusted}
        isEditorJudgementGlowEnabled={isEditorJudgementGlowEnabled}
        isVSyncEnabled={isVSyncEnabled}
        isDr3FpPreviewEnabled={isDr3FpPreviewEnabled}
        isPreviewPrecomputeEnabled={isPreviewPrecomputeEnabled}
        isLanguageMenuOpen={isLanguageMenuOpen}
        isSelectionTypeMenuOpen={isSelectionTypeMenuOpen}
        isStatisticsRefreshRateMenuOpen={isStatisticsRefreshRateMenuOpen}
        language={language}
        selectionType={selectionType}
        statisticsRefreshRate={statisticsRefreshRate}
        musicVolume={musicVolume}
        tapSoundVolume={tapSoundVolume}
        flickSoundVolume={flickSoundVolume}
        isPreviewSpritesEnabled={isPreviewSpritesEnabled}
        isPreviewHitFxEnabled={isPreviewHitFxEnabled}
        isPreviewChartSpeedChangesEnabled={isPreviewChartSpeedChangesEnabled}
        isPreviewCameraTiltEnabled={isPreviewCameraTiltEnabled}
        isPreviewCameraMovementEnabled={isPreviewCameraMovementEnabled}
        isPreviewNoteSpeedChangesEnabled={isPreviewNoteSpeedChangesEnabled}
        isPreviewNoteAppearModeEnabled={isPreviewNoteAppearModeEnabled}
        setIsExitWarningOpen={setIsExitWarningOpen}
        setIsSettingsOpen={setIsSettingsOpen}
        setIsHelpOpen={setIsHelpOpen}
        setIsDr3FpPreviewInfoOpen={setIsDr3FpPreviewInfoOpen}
        setIsExitWarningEnabled={setIsExitWarningEnabled}
        setIsBackdropBlurDisabled={setIsBackdropBlurDisabled}
        setIsAnimationDisabled={setIsAnimationDisabled}
        setIsScrollDirectionInverted={setIsScrollDirectionInverted}
        setAreTimingChangeIndicatorsAdjusted={setAreTimingChangeIndicatorsAdjusted}
        setIsEditorJudgementGlowEnabled={setIsEditorJudgementGlowEnabled}
        setIsVSyncEnabled={setIsVSyncEnabled}
        setIsDr3FpPreviewEnabled={setIsDr3FpPreviewEnabled}
        setIsPreviewPrecomputeEnabled={setIsPreviewPrecomputeEnabled}
        setIsLanguageMenuOpen={setIsLanguageMenuOpen}
        setIsSelectionTypeMenuOpen={setIsSelectionTypeMenuOpen}
        setIsStatisticsRefreshRateMenuOpen={setIsStatisticsRefreshRateMenuOpen}
        setLanguage={setLanguage}
        setSelectionType={setSelectionType}
        setStatisticsRefreshRate={setStatisticsRefreshRate}
        setMusicVolume={setMusicVolume}
        setTapSoundVolume={setTapSoundVolume}
        setFlickSoundVolume={setFlickSoundVolume}
        setIsPreviewSpritesEnabled={setIsPreviewSpritesEnabled}
        setIsPreviewHitFxEnabled={setIsPreviewHitFxEnabled}
        setIsPreviewChartSpeedChangesEnabled={setIsPreviewChartSpeedChangesEnabled}
        setIsPreviewCameraTiltEnabled={setIsPreviewCameraTiltEnabled}
        setIsPreviewCameraMovementEnabled={setIsPreviewCameraMovementEnabled}
        setIsPreviewNoteSpeedChangesEnabled={setIsPreviewNoteSpeedChangesEnabled}
        setIsPreviewNoteAppearModeEnabled={setIsPreviewNoteAppearModeEnabled}
        tierBadge={tierBadge}
        isXPositionGridEnabled={isXPositionGridEnabled}
        isOutOfBoundsPlacementEnabled={isOutOfBoundsPlacementEnabled}
        isPlaying={isPlaying}
        isPlaybackSpeedMenuOpen={isPlaybackSpeedMenuOpen}
        isPreviewMode={isPreviewMode}
        isExportMenuOpen={isExportMenuOpen}
        isPreviewMenuOpen={isPreviewMenuOpen}
        isExportDisabled={isExportDisabled}
        hasExportAudioFile={hasExportAudioFile}
        hasExportIncompatibleTimeSignature={hasExportIncompatibleTimeSignature}
        hasUnsupportedFormattedExportNoteTypes={hasUnsupportedFormattedExportNoteTypes}
        duration={timelineDuration}
        currentTime={currentTime}
        timelinePositionLabel={formatTimelineMeasureProgress(currentTime)}
        effectiveGridZoom={effectiveGridZoom}
        pixelsPerBeat={pixelsPerBeat}
        playbackSpeed={playbackSpeed}
        progressBarRef={progressBarRef}
        timeDisplayRef={timeDisplayRef}
        isDraggingProgress={isDraggingProgress}
        isProgressBarInteractive={isProgressBarInteractive}
        openExitWarning={openExitWarning}
        togglePlay={runAsyncTutorialOperation('playback', togglePlay, undefined)}
        handleSeekChange={runTutorialOperation('timelineScroll', handleSeekChange)}
        beginProgressSeek={runTutorialOperation('timelineScroll', beginProgressSeek)}
        finishProgressSeek={runAsyncTutorialOperation('timelineScroll', finishProgressSeek, undefined)}
        setIsXPositionGridEnabled={setIsXPositionGridEnabled}
        setIsOutOfBoundsPlacementEnabled={setIsOutOfBoundsPlacementEnabled}
        setIsExportMenuOpen={setIsExportMenuOpen}
        setIsPlaybackSpeedMenuOpen={setIsPlaybackSpeedMenuOpen}
        setIsPreviewMenuOpen={setIsPreviewMenuOpen}
        changePlaybackSpeed={changePlaybackSpeed}
        openHelp={openHelp}
        openSettings={openSettings}
        togglePreviewMode={runTutorialOperation('previewMode', togglePreviewMode)}
        previewDr3Fp={runAsyncTutorialOperation('previewMode', previewDr3Fp, undefined)}
        exportRaw={runAsyncTutorialOperation('export', exportRaw, 'cancelled')}
        exportDr3Viewer={runAsyncTutorialOperation('export', exportDr3Viewer, 'cancelled')}
        exportDr3Fp={runAsyncTutorialOperation('export', exportDr3Fp, 'cancelled')}
        exportChartData={runAsyncTutorialOperation('export', exportChartData, 'cancelled')}
        fps={fps}
        renderedObjects={renderedObjects}
        onPerformanceStatsMouseEnter={() => {
          shouldCountRenderedObjectsRef.current = true;
          setIsFpsCounterHovered(true);
          drawGrid();
          updateRenderedObjectsDisplay(true);
        }}
        onPerformanceStatsMouseLeave={() => {
          shouldCountRenderedObjectsRef.current = false;
          setIsFpsCounterHovered(false);
          renderedObjectsRef.current = 0;
          renderedObjectsDisplayLastUpdateRef.current = 0;
          setRenderedObjects(0);
        }}
        leftSidebarProps={leftSidebarProps}
        previewDisplayMode={previewDisplayMode}
        setPreviewDisplayMode={setPreviewDisplayMode}
        preview3DTiltDegrees={preview3DTiltDegrees}
        setPreview3DTiltDegrees={setPreview3DTiltDegrees}
        canvasStageProps={canvasStageProps}
        rightSidebarProps={rightSidebarProps}
        nscToolProps={nscToolProps}
        noteMultiEditProps={noteMultiEditProps}
        cameraRotationToolProps={cameraRotationToolProps}
        tutorialSession={tutorialSession}
        setTutorialSession={setTutorialSession}
        exitTutorial={onBack}
      />
      <EditorFilePreviewModal
        file={previewedProjectFile}
        textContent={previewedProjectFileText}
        mediaUrl={previewedProjectFileUrl}
        isBackdropBlurDisabled={isBackdropBlurDisabled}
        isAnimationDisabled={isAnimationDisabled}
        onSaveChartText={savePreviewedChartText}
        onClose={() => setPreviewedProjectFile(null)}
      />
    </>
  );
}

