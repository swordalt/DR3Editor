import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { convertBpmChangesToTime, getActiveChange, getBeatAtTime, getBpmChangeTimepos, getTimeAtBeat, formatTime } from './utils/editorUtils';
import EditorLayout from './components/EditorLayout';
import EditorFilePreviewModal from './components/EditorFilePreviewModal';
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
import { buildNoteRenderIndex, getHoldConnectorSegmentsInRange, getNoteBeatEntriesInRange } from './editor/noteRenderIndex';
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
  PREVIEW_CONNECTOR_TILT_EASING_MS,
  SIDE_PANEL_TRANSITION_MS,
  SNAP_EPSILON,
  X_POSITION_COUNT,
  getCurveEasingId,
} from './editor/editorViewConstants';
import type {
  ActiveLeftPanel,
  CopiedNote,
  CurveEasingFamily,
  CurveEasingType,
  CurveIdSelectTarget,
  EditorProps,
  EditorRuntimeState,
  HitSoundEvent,
  HoverPreview,
  PendingDragUpdate,
  PreviewCameraTiltInterval,
  PreviewCameraTiltSegment,
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
  getPreviewCameraRotationRadians,
  getPreviewCameraXPositionOffset,
  getPreviewComboAtTime,
  getPreviewConnectorSegmentsInDistanceRange,
  getPreviewNoteEntriesInDistanceRange,
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
import { buildChartStatisticsIndex, calculateChartStatistics, type ChartStatisticsIndex } from './editor/chartStatistics';
import { PREVIEW_HOLD_TEXTURE_URLS, PREVIEW_NOTE_ARROW_URLS, PREVIEW_NOTE_TEXTURE_URLS } from './editor/previewNoteSprites';
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
import { translations } from './lang';

type ExportRunResult = 'complete' | 'cancelled' | 'failed';

const convertNonOggAudioFileForProject = async (file: File) => (
  isOggAudioFile(file) ? file : convertAudioFileToOgg(file)
);

const getOffsetInSeconds = (offset: string | number) => {
  const parsedOffset = parseFloat(offset.toString());
  return Number.isFinite(parsedOffset) ? parsedOffset / 1000 : 0;
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

const PREVIEW_CONNECTOR_GROUP_EPSILON = 0.000001;

const arePreviewConnectorValuesEqual = (a: number, b: number) => (
  Math.abs(a - b) <= PREVIEW_CONNECTOR_GROUP_EPSILON
);

const getPreviewConnectorGroupKey = (segment: PreviewHoldConnectorSegment) => [
  getConnectorFill(segment.note.type),
  segment.parentTimepos.toFixed(6),
  segment.noteTimepos.toFixed(6),
  segment.parentPlaybackTime.toFixed(6),
  segment.notePlaybackTime.toFixed(6),
  segment.parentDistance.toFixed(6),
  segment.noteDistance.toFixed(6),
].join('|');

const buildGroupedPreviewHoldConnectorSegments = (
  segments: PreviewHoldConnectorSegment[],
): PreviewHoldConnectorSegment[] => {
  const segmentsByGroupKey = new Map<string, PreviewHoldConnectorSegment[]>();

  segments.forEach((segment) => {
    const groupKey = getPreviewConnectorGroupKey(segment);
    const matchingSegments = segmentsByGroupKey.get(groupKey);
    if (matchingSegments) {
      matchingSegments.push(segment);
    } else {
      segmentsByGroupKey.set(groupKey, [segment]);
    }
  });

  const groupedSegments: PreviewHoldConnectorSegment[] = [];

  segmentsByGroupKey.forEach((matchingSegments) => {
    const sortedSegments = [...matchingSegments].sort((a, b) => (
      (a.parentNote.lane - b.parentNote.lane)
      || (a.note.lane - b.note.lane)
      || (a.note.id - b.note.id)
    ));
    let activeGroup: PreviewHoldConnectorSegment[] = [];
    let activeParentRight = 0;
    let activeNoteRight = 0;
    let activeParentLane = 0;
    let activeNoteLane = 0;
    let activeMinDistance = 0;
    let activeMaxDistance = 0;

    const startActiveGroup = (segment: PreviewHoldConnectorSegment) => {
      activeGroup = [segment];
      activeParentLane = segment.parentNote.lane;
      activeNoteLane = segment.note.lane;
      activeParentRight = segment.parentNote.lane + segment.parentNote.width;
      activeNoteRight = segment.note.lane + segment.note.width;
      activeMinDistance = segment.minDistance;
      activeMaxDistance = segment.maxDistance;
    };

    const appendActiveGroup = (segment: PreviewHoldConnectorSegment) => {
      activeGroup.push(segment);
      activeParentRight = segment.parentNote.lane + segment.parentNote.width;
      activeNoteRight = segment.note.lane + segment.note.width;
      activeMinDistance = Math.min(activeMinDistance, segment.minDistance);
      activeMaxDistance = Math.max(activeMaxDistance, segment.maxDistance);
    };

    const flushActiveGroup = () => {
      if (activeGroup.length < 2) {
        groupedSegments.push(...activeGroup);
      } else {
        const firstSegment = activeGroup[0];

        groupedSegments.push({
          ...firstSegment,
          parentNote: {
            ...firstSegment.parentNote,
            lane: activeParentLane,
            width: activeParentRight - activeParentLane,
          },
          note: {
            ...firstSegment.note,
            lane: activeNoteLane,
            width: activeNoteRight - activeNoteLane,
          },
          minDistance: activeMinDistance,
          maxDistance: activeMaxDistance,
          groupedSegments: activeGroup,
        });
      }

      activeGroup = [];
      activeParentRight = 0;
      activeNoteRight = 0;
      activeParentLane = 0;
      activeNoteLane = 0;
      activeMinDistance = 0;
      activeMaxDistance = 0;
    };

    sortedSegments.forEach((segment) => {
      if (activeGroup.length === 0) {
        startActiveGroup(segment);
        return;
      }

      const isParentContiguous = arePreviewConnectorValuesEqual(segment.parentNote.lane, activeParentRight);
      const isNoteContiguous = arePreviewConnectorValuesEqual(segment.note.lane, activeNoteRight);

      if (!isParentContiguous || !isNoteContiguous) {
        flushActiveGroup();
        startActiveGroup(segment);
      } else {
        appendActiveGroup(segment);
      }
    });

    flushActiveGroup();
  });

  return groupedSegments.sort((a, b) => (
    (a.minDistance - b.minDistance)
    || (a.maxDistance - b.maxDistance)
    || (a.note.id - b.note.id)
  ));
};

interface PreviewModePrecomputeCache {
  notes: Note[];
  speedChanges: SpeedChange[];
  bpmChanges: BpmChange[];
  playbackSpeedDistanceIndex: SpeedDistancePoint[];
  cameraTiltSegments: PreviewCameraTiltSegment[];
  chartStatisticsIndex: ChartStatisticsIndex;
  cameraTiltIntervals: PreviewCameraTiltInterval[];
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

interface PreviewCachedHoldTexture {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  width: number;
  height: number;
}

type PreviewCanvasLoadPhase = 'idle' | 'visible' | 'full';

const PREVIEW_INITIAL_CANVAS_DISTANCE_PADDING = 32;
const PREVIEW_NOTE_TEXTURE_HEIGHT_SCALE = 0.3;
const PREVIEW_NOTE_TEXTURE_EDGE_CAP_WIDTH = 24;
const PREVIEW_NOTE_TEXTURE_EDGE_CAP_SCALE = 0.55;
const PREVIEW_NOTE_TEXTURE_SECTION_OVERLAP = 1;
const PREVIEW_NOTE_TEXTURE_WIDTH_BUCKET_SIZE = 1;
const PREVIEW_NOTE_TEXTURE_CACHE_MAX_ENTRIES = 512;
const PREVIEW_NOTE_ARROW_Y_OFFSET = -16;
const PREVIEW_HOLD_TEXTURE_EDGE_CAP_WIDTH = 24;
const PREVIEW_HOLD_TEXTURE_EDGE_CAP_SCALE = 0.55;
const PREVIEW_HOLD_TEXTURE_SECTION_OVERLAP = 1;
const PREVIEW_HOLD_TEXTURE_CACHE_BUCKET_SIZE = 2;
const PREVIEW_HOLD_TEXTURE_CACHE_MAX_ENTRIES = 384;
const PREVIEW_HOLD_TEXTURE_WIDTH_DELTA_PER_SLICE = 2;
const PREVIEW_HOLD_TEXTURE_SLICE_OVERLAP = 1;
const PREVIEW_HOLD_TEXTURE_MIN_SLICE_HEIGHT = 24;
const PREVIEW_HOLD_TEXTURE_MAX_SLICE_COUNT = 64;
const PREVIEW_HOLD_TEXTURE_LOD_CONNECTOR_THRESHOLD = 500;
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
const EDITOR_HOLD_CONNECTOR_ALPHA = 0.55;
const getPreviewHoldTextureAlpha = (connectorType: number) => (
  PREVIEW_PINK_HOLD_CONNECTOR_TYPES.has(connectorType)
    ? 1
    : PREVIEW_DAMAGE_NOTE_TYPES.has(connectorType)
      ? 0.62
      : 0.42
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
  const [isPreviewHoldSpritesEnabled, setIsPreviewHoldSpritesEnabled] = useState(initialEditorSettings.isPreviewHoldSpritesEnabled);
  const [isPreviewChartSpeedChangesEnabled, setIsPreviewChartSpeedChangesEnabled] = useState(initialEditorSettings.isPreviewChartSpeedChangesEnabled);
  const [isPreviewCameraTiltEnabled, setIsPreviewCameraTiltEnabled] = useState(initialEditorSettings.isPreviewCameraTiltEnabled);
  const [isPreviewCameraMovementEnabled, setIsPreviewCameraMovementEnabled] = useState(initialEditorSettings.isPreviewCameraMovementEnabled);
  const [isPreviewNoteSpeedChangesEnabled, setIsPreviewNoteSpeedChangesEnabled] = useState(initialEditorSettings.isPreviewNoteSpeedChangesEnabled);
  const [isPreviewNoteAppearModeEnabled, setIsPreviewNoteAppearModeEnabled] = useState(initialEditorSettings.isPreviewNoteAppearModeEnabled);
  const [previewDisplayMode, setPreviewDisplayMode] = useState<PreviewDisplayMode>(initialEditorSettings.previewDisplayMode);
  const [preview3DTiltDegrees, setPreview3DTiltDegrees] = useState(initialEditorSettings.preview3DTiltDegrees);
  const [activeLeftPanel, setActiveLeftPanel] = useState<ActiveLeftPanel>('main');
  const [isOrganizingNotes, setIsOrganizingNotes] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewCanvasLoadPhase, setPreviewCanvasLoadPhase] = useState<PreviewCanvasLoadPhase>('idle');
  const [previewVisibleWindowTime, setPreviewVisibleWindowTime] = useState(0);
  const [isLeftPanelCompact, setIsLeftPanelCompact] = useState(false);
  const [isRightPanelCompact, setIsRightPanelCompact] = useState(false);
  const [isLeftPanelContentVisible, setIsLeftPanelContentVisible] = useState(true);
  const [isRightPanelContentVisible, setIsRightPanelContentVisible] = useState(true);
  const [selectedNoteType, setSelectedNoteType] = useState<number>(1);
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
  const [formData, setFormData] = useState<EditorFormData>({
    songId: '',
    songName: '',
    songArtist: '',
    songBpm: '',
    difficulty: '',
    songFile: null as File | null,
    songIllustration: null as File | null,
  });
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
      isPreviewHoldSpritesEnabled,
      isPreviewChartSpeedChangesEnabled,
      isPreviewCameraTiltEnabled,
      isPreviewCameraMovementEnabled,
      isPreviewNoteSpeedChangesEnabled,
      isPreviewNoteAppearModeEnabled,
      previewDisplayMode,
      preview3DTiltDegrees,
    });
  }, [
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
    isPreviewHoldSpritesEnabled,
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
  const [duration, setDuration] = useState(0);
  const [audioTimingCorrection, setAudioTimingCorrection] = useState<AudioTimingCorrection>(DEFAULT_AUDIO_TIMING_CORRECTION);
  const [playbackAudioUrl, setPlaybackAudioUrl] = useState(initialProjectData?.audioUrl ?? '');
  const [fps, setFps] = useState(0);
  const [renderedObjects, setRenderedObjects] = useState(0);
  const [isFpsCounterHovered, setIsFpsCounterHovered] = useState(false);
  const [isPausedTimelineRendering, setIsPausedTimelineRendering] = useState(false);
  const [previewNoteSpriteLoadVersion, setPreviewNoteSpriteLoadVersion] = useState(0);
  const effectiveGridZoom = isPreviewMode ? 0 : gridZoom;
  const offsetInSeconds = getOffsetInSeconds(offset);
  const audioTimelineDuration = duration > 0 ? Math.max(0, duration + offsetInSeconds) : 0;
  
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
  const playTimeoutRef = useRef<number>();
  const isLoopingPlaybackRef = useRef(false);
  const hiddenPreviewNoteIdsRef = useRef<Set<number>>(new Set());
  const previewComboTimesRef = useRef<number[]>([]);
  const previewModePrecomputeCacheRef = useRef<PreviewModePrecomputeCache | null>(null);
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
  const previewHoldTexturesRef = useRef<Map<number, HTMLImageElement>>(new Map());
  const previewSpriteBitmapsRef = useRef<WeakMap<HTMLImageElement, ImageBitmap>>(new WeakMap());
  const decodedPreviewSpritesRef = useRef<WeakSet<HTMLImageElement>>(new WeakSet());
  const previewNoteSpriteCanvasCacheRef = useRef<Map<string, PreviewCachedNoteSprite>>(new Map());
  const previewHoldTextureCanvasCacheRef = useRef<Map<string, PreviewCachedHoldTexture>>(new Map());
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
        previewHoldTextureCanvasCacheRef.current.clear();
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
    previewHoldTexturesRef.current.clear();
    previewSpriteBitmapsRef.current = new WeakMap();
    decodedPreviewSpritesRef.current = new WeakSet();
    previewNoteSpriteCanvasCacheRef.current.clear();
    previewHoldTextureCanvasCacheRef.current.clear();

    Object.entries(PREVIEW_NOTE_TEXTURE_URLS).forEach(([type, url]) => {
      loadSprite(previewNoteTexturesRef.current, Number(type), url);
    });
    Object.entries(PREVIEW_NOTE_ARROW_URLS).forEach(([type, url]) => {
      loadSprite(previewNoteArrowsRef.current, Number(type), url);
    });
    Object.entries(PREVIEW_HOLD_TEXTURE_URLS).forEach(([type, url]) => {
      loadSprite(previewHoldTexturesRef.current, Number(type), url);
    });

    return () => {
      isDisposed = true;
      disposers.forEach(dispose => dispose());
      previewNoteTexturesRef.current.clear();
      previewNoteArrowsRef.current.clear();
      previewHoldTexturesRef.current.clear();
      loadedBitmaps.forEach(bitmap => bitmap.close());
      previewSpriteBitmapsRef.current = new WeakMap();
      decodedPreviewSpritesRef.current = new WeakSet();
      previewNoteSpriteCanvasCacheRef.current.clear();
      previewHoldTextureCanvasCacheRef.current.clear();
    };
  }, []);

  const resetPreviewJudgementState = useCallback((time = stateRef.current.currentTime, hidePastNotes = false) => {
    hiddenPreviewNoteIdsRef.current.clear();
    if (hidePastNotes) {
      stateRef.current.notes.forEach(note => {
        if (note.time <= time) {
          hiddenPreviewNoteIdsRef.current.add(note.id);
        }
      });
    }
    previewJudgementCursorTimeRef.current = time;
  }, []);

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
    setIsHelpOpen(false);
    setIsPlaybackSpeedMenuOpen(false);
    setIsStatisticsRefreshRateMenuOpen(false);
    setIsSelectionTypeMenuOpen(false);
    setIsSettingsOpen(true);
  };

  const openHelp = () => {
    setIsSettingsOpen(false);
    setIsPlaybackSpeedMenuOpen(false);
    setIsStatisticsRefreshRateMenuOpen(false);
    setIsSelectionTypeMenuOpen(false);
    setIsHelpOpen(true);
  };

  const openExitWarning = () => {
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
    setDuration(0);
  }, [playbackAudioUrl]);

  useEffect(() => {
    setPlaybackAudioUrl(projectData?.audioUrl ?? '');
  }, [projectData?.audioUrl]);

  const handleAudioLoadedMetadata = useCallback((audio: HTMLAudioElement) => {
    const mediaDuration = audio.duration;
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
        setDuration(getCorrectedAudioDuration(mediaDuration, correction));

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
    projectData && isValidDifficulty(projectData.difficulty) &&
    projectData?.songFile,
  );
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
  useEffect(() => {
    previewComboTimesRef.current = [];
    previewChartStatisticsIndexRef.current = null;
    previewPlaybackSpeedDistanceIndexRef.current = [];
  }, [previewSpeedChanges]);
  const isPreviewCanvasLoadingVisibleOnly = isPreviewMode && previewCanvasLoadPhase === 'visible';
  const previewInitialDistanceWindow = useMemo(() => {
    const viewportHeight = containerRef.current?.clientHeight || window.innerHeight || 720;
    const hitLineY = viewportHeight - 150;
    const previewDistanceScale = Math.max(1, 4 * pixelsPerBeat);
    const currentPreviewDistance = getSpeedDistanceAtTimepos(
      previewVisibleWindowTime,
      previewPlaybackSpeedDistanceIndex,
    );
    const visibleBehindDistance = (viewportHeight - hitLineY + 40) / previewDistanceScale;
    const visibleAheadDistance = (hitLineY + 40) / previewDistanceScale;

    return {
      min: currentPreviewDistance - visibleBehindDistance - PREVIEW_INITIAL_CANVAS_DISTANCE_PADDING,
      max: currentPreviewDistance + visibleAheadDistance + PREVIEW_INITIAL_CANVAS_DISTANCE_PADDING,
    };
  }, [pixelsPerBeat, previewCanvasLoadPhase, previewPlaybackSpeedDistanceIndex, previewVisibleWindowTime]);

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
  }, [isPreviewCanvasLoadingVisibleOnly]);

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
        setPreviewCanvasLoadPhase('visible');

        previewComboTimesRef.current = [];
        previewChartStatisticsIndexRef.current = null;
        previewPlaybackSpeedDistanceIndexRef.current = [];
        previewCameraTiltIntervalsRef.current = [];
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
        setPreviewVisibleWindowTime(0);
        setPreviewCanvasLoadPhase('idle');
        previewCameraRotationRadiansRef.current = 0;
        previewTiltTimestampRef.current = 0;
        preview3DCameraScaleRef.current = 1;
        preview3DCameraYOffsetRef.current = 0;
        preview3DCameraTimestampRef.current = 0;
      }

      return nextPreviewMode;
    });
  }, [clearActiveNoteInteraction, resetPreviewJudgementState]);

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

  const restoreCurrentParentAfterDeletingNotes = useCallback((deletedNotes: Note[]) => {
    const parsedCurrentParentId = currentParentInput.trim() === ''
      ? nextNoteIdRef.current - 1
      : Number(currentParentInput.trim());
    if (!Number.isInteger(parsedCurrentParentId) || parsedCurrentParentId <= 0) {
      return;
    }

    const deletedNoteById = new Map(deletedNotes.map(note => [note.id, note]));
    const deletedCurrentParent = deletedNoteById.get(parsedCurrentParentId);
    if (!deletedCurrentParent) {
      return;
    }

    const remainingNotes = stateRef.current.notes.filter(note => !deletedNoteById.has(note.id));
    const getPreviousExistingNoteId = (noteId: number) => (
      remainingNotes
        .filter(note => note.id < noteId)
        .reduce<number | null>((previousId, note) => (
          previousId === null || note.id > previousId ? note.id : previousId
        ), null)
    );

    let nextParentId = deletedCurrentParent.parentId;
    if (nextParentId === null && HOLD_START_TYPES.includes(deletedCurrentParent.type)) {
      nextParentId = getPreviousExistingNoteId(deletedCurrentParent.id);
    }

    while (nextParentId !== null && deletedNoteById.has(nextParentId)) {
      const deletedParent = deletedNoteById.get(nextParentId);
      nextParentId = deletedParent?.parentId ?? null;
      if (nextParentId === null && deletedParent && HOLD_START_TYPES.includes(deletedParent.type)) {
        nextParentId = getPreviousExistingNoteId(deletedParent.id);
      }
    }

    setCurrentParentInput(nextParentId === null ? '' : nextParentId.toString());
  }, [currentParentInput]);

  const handleDeleteSelectedNotes = useCallback(() => {
    const noteIdsToDelete = new Set(selectedNoteIds);
    const deletedNotes = stateRef.current.notes.filter(n => noteIdsToDelete.has(n.id));
    if (deletedNotes.length === 0) return;

    recordOperation({
      category: 'note',
      title: deletedNotes.length === 1 ? 'Deleted note' : `Deleted ${deletedNotes.length} notes`,
      detail: deletedNotes.length === 1
        ? getNoteHistoryDetail(deletedNotes[0])
        : `IDs ${formatGroupedIds(deletedNotes.map(note => note.id))}`,
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
      title: selectedNotes.length === 1 ? 'Mirrored note' : `Mirrored ${selectedNotes.length} notes`,
      detail: `IDs ${formatGroupedIds(selectedNotes.map(note => note.id))} around xpos 8`,
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
      title: selectedNotes.length === 1 ? 'Centered note' : `Centered ${selectedNotes.length} notes`,
      detail: `IDs ${formatGroupedIds(selectedNotes.map(note => note.id))} at xpos 8`,
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
  const previewNoteBeatEntriesSource = useMemo(() => {
    if (!isPreviewMode) {
      return [];
    }

    if (!isPreviewCanvasLoadingVisibleOnly) {
      return noteRenderIndex.noteBeatEntries;
    }

    return noteRenderIndex.noteBeatEntries.filter(({ note }) => {
      const noteDistance = getSpeedDistanceAtTimepos(note.time, previewPlaybackSpeedDistanceIndex);
      return noteDistance >= previewInitialDistanceWindow.min
        && noteDistance <= previewInitialDistanceWindow.max;
    });
  }, [
    isPreviewCanvasLoadingVisibleOnly,
    isPreviewMode,
    noteRenderIndex.noteBeatEntries,
    previewInitialDistanceWindow,
    previewPlaybackSpeedDistanceIndex,
  ]);
  const previewHoldConnectorSegmentsSource = useMemo(() => {
    if (!isPreviewMode) {
      return [];
    }

    if (!isPreviewCanvasLoadingVisibleOnly) {
      return noteRenderIndex.holdConnectorSegments;
    }

    return noteRenderIndex.holdConnectorSegments.filter((segment) => {
      const noteDistance = getSpeedDistanceAtTimepos(segment.note.time, previewPlaybackSpeedDistanceIndex);
      const parentDistance = getSpeedDistanceAtTimepos(segment.parentNote.time, previewPlaybackSpeedDistanceIndex);
      return Math.max(noteDistance, parentDistance) >= previewInitialDistanceWindow.min
        && Math.min(noteDistance, parentDistance) <= previewInitialDistanceWindow.max;
    });
  }, [
    isPreviewCanvasLoadingVisibleOnly,
    isPreviewMode,
    noteRenderIndex.holdConnectorSegments,
    previewInitialDistanceWindow,
    previewPlaybackSpeedDistanceIndex,
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
      if (!isPreviewMode) {
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
      isPreviewMode,
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
      if (!isPreviewMode) {
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
      isPreviewMode,
      previewHoldConnectorSegmentsSource,
      previewNoteRenderEntryById,
      previewPlaybackSpeedDistanceIndex,
      speedDistanceIndex,
      usesOfficialPreviewRules,
    ],
  );
  const previewHoldConnectorDrawSegments = useMemo(
    () => buildGroupedPreviewHoldConnectorSegments(previewHoldConnectorSegments),
    [previewHoldConnectorSegments],
  );
  const previewJudgementNoteEntries = useMemo(
    () => isPreviewMode
      ? noteRenderIndex.noteBeatEntries.map(({ note }) => ({ id: note.id, time: note.time }))
      : [],
    [isPreviewMode, noteRenderIndex.noteBeatEntries],
  );
  const previewComboTimes = useMemo(
    () => isPreviewMode ? noteRenderIndex.noteBeatEntries.map(({ note }) => note.time) : [],
    [isPreviewMode, noteRenderIndex.noteBeatEntries],
  );
  const previewCameraMovementSegments = useMemo(
    () => {
      if (!isPreviewMode) {
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
    [isPreviewMode, previewHoldConnectorSegmentsSource],
  );
  const previewCameraMovementIntervals = useMemo(
    () => buildPreviewCameraMovementIntervals(previewCameraMovementSegments),
    [previewCameraMovementSegments],
  );
  const hasPinkHoldCameraNotes = useMemo(
    () => isPreviewMode && previewCanvasNotesSource.some(note => note.type === PINK_HOLD_CENTER_TYPE || note.type === PINK_HOLD_END_TYPE),
    [isPreviewMode, previewCanvasNotesSource],
  );
  const preview3DZoomHeightCurve = useMemo(() => {
    if (!isPreviewMode) {
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
  }, [isPreviewMode, previewCanvasNotesSource, timelineDuration]);
  const previewCameraTiltSegments = useMemo(
    () => {
      if (!isPreviewMode) {
        return [];
      }

      return previewHoldConnectorSegments.map((segment) => {
        const noteCenterXPosition = segment.note.lane + segment.note.width / 2;
        const parentCenterXPosition = segment.parentNote.lane + segment.parentNote.width / 2;

        return {
          startTimepos: Math.min(segment.parentTimepos, segment.noteTimepos),
          endTimepos: Math.max(segment.parentTimepos, segment.noteTimepos),
          connectorCenterXPosition: (noteCenterXPosition + parentCenterXPosition) / 2,
        };
      })
        .filter(segment => segment.endTimepos - segment.startTimepos > SNAP_EPSILON)
        .sort((a, b) => (a.startTimepos - b.startTimepos) || (a.endTimepos - b.endTimepos));
    },
    [isPreviewMode, previewHoldConnectorSegments],
  );
  previewCameraTiltSegmentsRef.current = previewCameraTiltSegments;
  const previewCameraTiltIntervals = useMemo(
    () => buildPreviewCameraTiltIntervals(previewCameraTiltSegments),
    [previewCameraTiltSegments],
  );
  useEffect(() => {
    if (!isPreviewMode || !isPreviewPrecomputeEnabled || previewCanvasLoadPhase !== 'full') {
      if (!isPreviewMode || !isPreviewPrecomputeEnabled) {
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
            chartStatisticsIndex: buildChartStatisticsIndex({
              getTimeFromTimepos,
              notes: stateRef.current.notes,
              speedChanges: previewSpeedChanges,
            }),
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
    isPreviewMode,
    isPreviewPrecomputeEnabled,
    previewCanvasLoadPhase,
    previewCameraTiltIntervals,
    previewCameraTiltSegments,
    previewPlaybackSpeedDistanceIndex,
    previewSpeedChanges,
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
        title: 'Moved note',
        detail: `#${dragStartNote.id} from ${formatTime(dragStartNote.time, timedBpmChanges)}, xpos ${formatNoteLane(dragStartNote.lane)} to ${formatTime(dragEndNote.time, timedBpmChanges)}, xpos ${formatNoteLane(dragEndNote.lane)}`,
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

  const handleConfirm = async () => {
    if (isProjectAudioConverting) return;

    setMetadataTouchedFields(getRequiredMetadataTouchedFields());

    if (hasInvalidMetadataFields(invalidMetadataFields)) {
      alert('Please enter a valid Song ID, Song BPM, Difficulty, and Audio File.');
      return;
    }

    const wasProjectCreated = !projectData;
    let nextSongFile = formData.songFile;
    let wasAudioConvertedToOgg = false;
    let audioUrl = projectData?.audioUrl || '';

    if (nextSongFile && nextSongFile !== projectData?.songFile) {
      wasAudioConvertedToOgg = !isOggAudioFile(nextSongFile);
      setIsProjectAudioConverting(true);

      try {
        nextSongFile = await convertNonOggAudioFileForProject(nextSongFile);
      } catch (error) {
        console.warn('Failed to convert MP3 audio to OGG:', error);
        alert('The selected MP3 audio could not be converted to OGG.');
        setIsProjectAudioConverting(false);
        return;
      }

      if (audioUrl) URL.revokeObjectURL(audioUrl);
      audioUrl = URL.createObjectURL(nextSongFile);
    }

    const parsedBpm = parseFloat(formData.songBpm);
    const fallbackBpm = projectData?.bpm || bpmChanges[0]?.bpm || 120;
    const nextBpm = Number.isFinite(parsedBpm) ? parsedBpm : fallbackBpm;
    const sanitizedFormData = {
      ...formData,
      songFile: nextSongFile,
      songId: stripInputWhitespace(formData.songId),
      songName: stripInputWhitespace(formData.songName),
      songArtist: stripInputWhitespace(formData.songArtist),
      songBpm: stripInputWhitespace(formData.songBpm),
      difficulty: stripInputWhitespace(formData.difficulty),
    };

    setProjectData({
      ...sanitizedFormData,
      chartFormat: projectData?.chartFormat ?? 'Official',
      songBpm: nextBpm.toString(),
      bpm: nextBpm,
      audioUrl,
      audioConvertedToOgg: wasAudioConvertedToOgg || projectData?.audioConvertedToOgg,
    });

    // Imported charts can exist before project metadata is set, so only seed BPMs for actual new projects.
    if (!projectData && mode === 'new') {
      setBpmChanges([{ timepos: 0, bpm: nextBpm, timeSignature: '4/4' }]);
    }

    setIsModalOpen(false);
    setIsProjectAudioConverting(false);
    if (wasAudioConvertedToOgg && !wasProjectCreated) {
      setIsAudioOffsetNoticeOpen(true);
    }
    if (activeLeftPanel === 'editInfo') {
      setActiveLeftPanel('main');
    }
    setMetadataTouchedFields({});

    recordOperation({
      category: 'metadata',
      title: wasProjectCreated ? 'Created project metadata' : 'Updated chart metadata',
      detail: `${sanitizedFormData.songName || 'Untitled Project'} | BPM ${formatHistoryNumber(nextBpm)} | Difficulty ${sanitizedFormData.difficulty || 'None'}`,
    });
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

    const restoredNotes = snapshot.notes.map(note => ({ ...note }));
    const restoredBpmChanges = snapshot.bpmChanges.map(change => ({ ...change }));
    const restoredSpeedChanges = snapshot.speedChanges.map(change => ({ ...change }));
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

  useEffect(() => {
    const isOnlyKeyPressed = (e: KeyboardEvent) => (
      !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey
    );

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

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
            ? shouldMirrorPaste ? 'Mirrored and pasted note' : 'Pasted note'
            : shouldMirrorPaste ? `Mirrored and pasted ${pastedNotes.length} notes` : `Pasted ${pastedNotes.length} notes`,
          detail: pastedNotes.length === 1
            ? getNoteHistoryDetail(pastedNotes[0])
            : `IDs ${formatGroupedIds(pastedNotes.map(note => note.id))} at ${formatTime(pasteTarget.time, timedBpmChanges)}`,
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
        setSelectedNoteType(prev => {
          const idx = AVAILABLE_NOTE_TYPES.indexOf(prev);
          return AVAILABLE_NOTE_TYPES[(idx - 1 + AVAILABLE_NOTE_TYPES.length) % AVAILABLE_NOTE_TYPES.length];
        });
      }

      if (e.key.toLowerCase() === 'd') {
        setSelectedNoteType(prev => {
          const idx = AVAILABLE_NOTE_TYPES.indexOf(prev);
          return AVAILABLE_NOTE_TYPES[(idx + 1) % AVAILABLE_NOTE_TYPES.length];
        });
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
  }, [getNoteHistoryDetail, getTimeFromTimepos, getTimeposFromTime, handleCopySelectedNotes, handleDeleteSelectedNotes, isPreviewMode, recordOperation, redoLastOperation, timedBpmChanges, togglePlay, togglePreviewMode, undoLastOperation]);

  const drawGrid = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const now = performance.now();
    fpsFrameCountRef.current += 1;
    const elapsed = now - fpsWindowStartRef.current;
    if (elapsed >= PERFORMANCE_STATS_UPDATE_INTERVAL_MS) {
      setFps(Math.round((fpsFrameCountRef.current * 1000) / elapsed));
      fpsFrameCountRef.current = 0;
      fpsWindowStartRef.current = now;
    }

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
      fromNote: Note,
      fromY: number,
      toNote: Note,
      toY: number,
    ) => {
      if (!isPreview3DMode) {
        const fromEdges = getProjectedEditorStyleConnectorEdges(fromNote, fromY);
        const toEdges = getProjectedEditorStyleConnectorEdges(toNote, toY);

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

        ctx.beginPath();
        ctx.moveTo(fromEdges.left, segmentFromY);
        ctx.lineTo(fromEdges.right, segmentFromY);
        ctx.lineTo(toEdges.right, segmentToY);
        ctx.lineTo(toEdges.left, segmentToY);
        ctx.closePath();
        ctx.fill();
      }
    };
    const drawPreviewHoldTextureConnector = (
      connectorType: number,
      fromNote: Note,
      fromY: number,
      toNote: Note,
      toY: number,
    ) => {
      const holdTexture = previewHoldTexturesRef.current.get(connectorType);
      if (!isLoadedPreviewSprite(holdTexture)) {
        return false;
      }

      const minY = Math.min(fromY, toY);
      const maxY = Math.max(fromY, toY);
      const connectorHeight = maxY - minY;
      if (connectorHeight <= SNAP_EPSILON) {
        return false;
      }

      const topNote = fromY <= toY ? fromNote : toNote;
      const bottomNote = fromY <= toY ? toNote : fromNote;
      const topEdges = getProjectedNoteEdges(topNote, minY);
      const bottomEdges = getProjectedNoteEdges(bottomNote, maxY);
      const topWidth = topEdges.right - topEdges.left;
      const bottomWidth = bottomEdges.right - bottomEdges.left;
      const widthDelta = Math.abs(bottomWidth - topWidth);
      const textureAlpha = getPreviewHoldTextureAlpha(connectorType);
      const sourceCapWidth = Math.min(
        PREVIEW_HOLD_TEXTURE_EDGE_CAP_WIDTH,
        holdTexture.naturalWidth / 2,
      );
      const holdTextureSource = getPreviewSpriteSource(holdTexture);
      const sourceCenterWidth = holdTexture.naturalWidth - sourceCapWidth * 2;
      const baseDestinationCapWidth = sourceCapWidth * PREVIEW_HOLD_TEXTURE_EDGE_CAP_SCALE;
      const drawAffineSection = (
        sourceX: number,
        sourceWidth: number,
        destinationTopLeft: number,
        destinationBottomLeft: number,
        destinationWidth: number,
      ) => {
        if (sourceWidth <= SNAP_EPSILON || destinationWidth <= SNAP_EPSILON) {
          return;
        }

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(destinationTopLeft, minY);
        ctx.lineTo(destinationTopLeft + destinationWidth, minY);
        ctx.lineTo(destinationBottomLeft + destinationWidth, maxY);
        ctx.lineTo(destinationBottomLeft, maxY);
        ctx.closePath();
        ctx.clip();
        ctx.transform(
          destinationWidth / sourceWidth,
          0,
          (destinationBottomLeft - destinationTopLeft) / holdTexture.naturalHeight,
          connectorHeight / holdTexture.naturalHeight,
          destinationTopLeft,
          minY,
        );
        ctx.drawImage(
          holdTextureSource,
          sourceX,
          0,
          sourceWidth,
          holdTexture.naturalHeight,
          0,
          0,
          sourceWidth,
          holdTexture.naturalHeight,
        );
        ctx.restore();
      };
      const drawSliceSection = (
        sourceX: number,
        sourceWidth: number,
        sourceY: number,
        sourceHeight: number,
        left1: number,
        right1: number,
        left2: number,
        right2: number,
        y1: number,
        y2: number,
      ) => {
        const destinationX = Math.min(left1, right1, left2, right2);
        const destinationRight = Math.max(left1, right1, left2, right2);
        const destinationWidth = destinationRight - destinationX;
        const destinationHeight = y2 - y1;

        if (
          sourceWidth <= SNAP_EPSILON
          || sourceHeight <= SNAP_EPSILON
          || destinationWidth <= SNAP_EPSILON
          || destinationHeight <= SNAP_EPSILON
        ) {
          return;
        }

        const dprBucket = Math.max(1, Math.round(dpr * 100) / 100);
        const bucketValue = (value: number) => (
          Math.round(value / PREVIEW_HOLD_TEXTURE_CACHE_BUCKET_SIZE) * PREVIEW_HOLD_TEXTURE_CACHE_BUCKET_SIZE
        );
        const bucketedDestinationWidth = Math.max(1, bucketValue(destinationWidth));
        const bucketedDestinationHeight = Math.max(1, bucketValue(destinationHeight));
        const localLeft1 = bucketValue(left1 - destinationX);
        const localRight1 = bucketValue(right1 - destinationX);
        const localLeft2 = bucketValue(left2 - destinationX);
        const localRight2 = bucketValue(right2 - destinationX);
        const cacheKey = [
          'slice',
          connectorType,
          bucketValue(sourceX),
          bucketValue(sourceWidth),
          bucketValue(sourceY),
          bucketValue(sourceHeight),
          bucketedDestinationWidth,
          bucketedDestinationHeight,
          localLeft1,
          localRight1,
          localLeft2,
          localRight2,
          dprBucket,
        ].join(':');
        let cachedTexture = previewHoldTextureCanvasCacheRef.current.get(cacheKey);

        if (!cachedTexture) {
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.ceil(bucketedDestinationWidth * dprBucket));
          canvas.height = Math.max(1, Math.ceil(bucketedDestinationHeight * dprBucket));
          const textureCtx = canvas.getContext('2d');

          if (textureCtx) {
            textureCtx.setTransform(dprBucket, 0, 0, dprBucket, 0, 0);
            textureCtx.clearRect(0, 0, bucketedDestinationWidth, bucketedDestinationHeight);
            textureCtx.save();
            textureCtx.beginPath();
            textureCtx.moveTo(localLeft1, 0);
            textureCtx.lineTo(localRight1, 0);
            textureCtx.lineTo(localRight2, bucketedDestinationHeight);
            textureCtx.lineTo(localLeft2, bucketedDestinationHeight);
            textureCtx.closePath();
            textureCtx.clip();
            textureCtx.drawImage(
              holdTextureSource,
              sourceX,
              sourceY,
              sourceWidth,
              sourceHeight,
              0,
              0,
              bucketedDestinationWidth,
              bucketedDestinationHeight,
            );
            textureCtx.restore();

            cachedTexture = {
              canvas,
              x: 0,
              y: 0,
              width: bucketedDestinationWidth,
              height: bucketedDestinationHeight,
            };

            const cache = previewHoldTextureCanvasCacheRef.current;
            if (cache.size >= PREVIEW_HOLD_TEXTURE_CACHE_MAX_ENTRIES) {
              const oldestKey = cache.keys().next().value;
              if (oldestKey !== undefined) {
                cache.delete(oldestKey);
              }
            }
            cache.set(cacheKey, cachedTexture);
          }
        }

        if (cachedTexture) {
          ctx.drawImage(
            cachedTexture.canvas,
            destinationX,
            y1,
            cachedTexture.width,
            cachedTexture.height,
          );
          return;
        }

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(left1, y1);
        ctx.lineTo(right1, y1);
        ctx.lineTo(right2, y2);
        ctx.lineTo(left2, y2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(
          holdTextureSource,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          destinationX,
          y1,
          destinationWidth,
          destinationHeight,
        );
        ctx.restore();
      };
      const drawSlice = (
        startProgress: number,
        endProgress: number,
      ) => {
        const progressOverlap = PREVIEW_HOLD_TEXTURE_SLICE_OVERLAP / connectorHeight;
        const drawStartProgress = Math.max(0, startProgress - progressOverlap);
        const drawEndProgress = Math.min(1, endProgress + progressOverlap);
        const sourceY = drawStartProgress * holdTexture.naturalHeight;
        const sourceHeight = (drawEndProgress - drawStartProgress) * holdTexture.naturalHeight;
        const y1 = minY + connectorHeight * drawStartProgress;
        const y2 = minY + connectorHeight * drawEndProgress;
        const left1 = topEdges.left + (bottomEdges.left - topEdges.left) * drawStartProgress;
        const right1 = topEdges.right + (bottomEdges.right - topEdges.right) * drawStartProgress;
        const left2 = topEdges.left + (bottomEdges.left - topEdges.left) * drawEndProgress;
        const right2 = topEdges.right + (bottomEdges.right - topEdges.right) * drawEndProgress;
        const topSliceWidth = right1 - left1;
        const bottomSliceWidth = right2 - left2;
        const destinationHeight = y2 - y1;
        const destinationCapWidth = Math.min(
          baseDestinationCapWidth,
          topSliceWidth / 2,
          bottomSliceWidth / 2,
        );
        const sourceSectionOverlap = Math.max(0, Math.min(
          PREVIEW_HOLD_TEXTURE_SECTION_OVERLAP,
          sourceCapWidth,
          sourceCenterWidth / 2,
        ));
        const destinationSectionOverlap = Math.max(0, Math.min(
          PREVIEW_HOLD_TEXTURE_SECTION_OVERLAP,
          destinationCapWidth,
          (topSliceWidth - destinationCapWidth * 2) / 2,
          (bottomSliceWidth - destinationCapWidth * 2) / 2,
        ));

        if (topSliceWidth <= SNAP_EPSILON || bottomSliceWidth <= SNAP_EPSILON || destinationHeight <= SNAP_EPSILON) {
          return;
        }

        if (sourceCenterWidth <= SNAP_EPSILON || destinationCapWidth <= SNAP_EPSILON) {
          drawSliceSection(0, holdTexture.naturalWidth, sourceY, sourceHeight, left1, right1, left2, right2, y1, y2);
          return;
        }

        drawSliceSection(
          0,
          sourceCapWidth,
          sourceY,
          sourceHeight,
          left1,
          left1 + destinationCapWidth,
          left2,
          left2 + destinationCapWidth,
          y1,
          y2,
        );
        drawSliceSection(
          sourceCapWidth - sourceSectionOverlap,
          sourceCenterWidth + sourceSectionOverlap * 2,
          sourceY,
          sourceHeight,
          left1 + destinationCapWidth - destinationSectionOverlap,
          right1 - destinationCapWidth + destinationSectionOverlap,
          left2 + destinationCapWidth - destinationSectionOverlap,
          right2 - destinationCapWidth + destinationSectionOverlap,
          y1,
          y2,
        );
        drawSliceSection(
          holdTexture.naturalWidth - sourceCapWidth,
          sourceCapWidth,
          sourceY,
          sourceHeight,
          right1 - destinationCapWidth,
          right1,
          right2 - destinationCapWidth,
          right2,
          y1,
          y2,
        );
      };

      if (widthDelta <= SNAP_EPSILON) {
        const dprBucket = Math.max(1, Math.round(dpr * 100) / 100);
        const bucketValue = (value: number) => (
          Math.round(value / PREVIEW_HOLD_TEXTURE_CACHE_BUCKET_SIZE) * PREVIEW_HOLD_TEXTURE_CACHE_BUCKET_SIZE
        );
        const bucketedWidth = Math.max(1, bucketValue(topWidth));
        const bucketedHeight = Math.max(1, bucketValue(connectorHeight));
        const bucketedLeftDelta = bucketValue(bottomEdges.left - topEdges.left);
        const localLeft = Math.min(0, bucketedLeftDelta);
        const localTopLeft = -localLeft;
        const localBottomLeft = bucketedLeftDelta - localLeft;
        const localWidth = Math.max(bucketedWidth, localBottomLeft + bucketedWidth) - localLeft;
        const cacheKey = `${connectorType}:${bucketedWidth}:${bucketedHeight}:${bucketedLeftDelta}:${dprBucket}`;
        let cachedTexture = previewHoldTextureCanvasCacheRef.current.get(cacheKey);

        if (!cachedTexture) {
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.ceil(localWidth * dprBucket));
          canvas.height = Math.max(1, Math.ceil(bucketedHeight * dprBucket));
          const textureCtx = canvas.getContext('2d');

          if (textureCtx) {
            const drawCachedAffineSection = (
              sourceX: number,
              sourceWidth: number,
              destinationTopLeft: number,
              destinationBottomLeft: number,
              destinationWidth: number,
            ) => {
              if (sourceWidth <= SNAP_EPSILON || destinationWidth <= SNAP_EPSILON) {
                return;
              }

              textureCtx.save();
              textureCtx.beginPath();
              textureCtx.moveTo(destinationTopLeft, 0);
              textureCtx.lineTo(destinationTopLeft + destinationWidth, 0);
              textureCtx.lineTo(destinationBottomLeft + destinationWidth, bucketedHeight);
              textureCtx.lineTo(destinationBottomLeft, bucketedHeight);
              textureCtx.closePath();
              textureCtx.clip();
              textureCtx.transform(
                destinationWidth / sourceWidth,
                0,
                (destinationBottomLeft - destinationTopLeft) / holdTexture.naturalHeight,
                bucketedHeight / holdTexture.naturalHeight,
                destinationTopLeft,
                0,
              );
              textureCtx.drawImage(
                holdTextureSource,
                sourceX,
                0,
                sourceWidth,
                holdTexture.naturalHeight,
                0,
                0,
                sourceWidth,
                holdTexture.naturalHeight,
              );
              textureCtx.restore();
            };
            const destinationCapWidth = Math.min(baseDestinationCapWidth, bucketedWidth / 2);
            const sourceSectionOverlap = Math.max(0, Math.min(
              PREVIEW_HOLD_TEXTURE_SECTION_OVERLAP,
              sourceCapWidth,
              sourceCenterWidth / 2,
            ));
            const destinationSectionOverlap = Math.max(0, Math.min(
              PREVIEW_HOLD_TEXTURE_SECTION_OVERLAP,
              destinationCapWidth,
              (bucketedWidth - destinationCapWidth * 2) / 2,
            ));

            textureCtx.setTransform(dprBucket, 0, 0, dprBucket, 0, 0);
            textureCtx.clearRect(0, 0, localWidth, bucketedHeight);
            textureCtx.globalAlpha = textureAlpha;

            if (sourceCenterWidth <= SNAP_EPSILON || destinationCapWidth <= SNAP_EPSILON) {
              drawCachedAffineSection(0, holdTexture.naturalWidth, localTopLeft, localBottomLeft, bucketedWidth);
            } else {
              drawCachedAffineSection(0, sourceCapWidth, localTopLeft, localBottomLeft, destinationCapWidth);
              drawCachedAffineSection(
                sourceCapWidth - sourceSectionOverlap,
                sourceCenterWidth + sourceSectionOverlap * 2,
                localTopLeft + destinationCapWidth - destinationSectionOverlap,
                localBottomLeft + destinationCapWidth - destinationSectionOverlap,
                bucketedWidth - destinationCapWidth * 2 + destinationSectionOverlap * 2,
              );
              drawCachedAffineSection(
                holdTexture.naturalWidth - sourceCapWidth,
                sourceCapWidth,
                localTopLeft + bucketedWidth - destinationCapWidth,
                localBottomLeft + bucketedWidth - destinationCapWidth,
                destinationCapWidth,
              );
            }

            cachedTexture = {
              canvas,
              x: 0,
              y: 0,
              width: localWidth,
              height: bucketedHeight,
            };

            const cache = previewHoldTextureCanvasCacheRef.current;
            if (cache.size >= PREVIEW_HOLD_TEXTURE_CACHE_MAX_ENTRIES) {
              const oldestKey = cache.keys().next().value;
              if (oldestKey !== undefined) {
                cache.delete(oldestKey);
              }
            }
            cache.set(cacheKey, cachedTexture);
          }
        }

        if (cachedTexture) {
          ctx.drawImage(
            cachedTexture.canvas,
            topEdges.left + localLeft,
            minY,
            cachedTexture.width,
            cachedTexture.height,
          );
          return true;
        }

        ctx.save();
        ctx.globalAlpha *= textureAlpha;
        const destinationCapWidth = Math.min(baseDestinationCapWidth, topWidth / 2);
        const sourceSectionOverlap = Math.max(0, Math.min(
          PREVIEW_HOLD_TEXTURE_SECTION_OVERLAP,
          sourceCapWidth,
          sourceCenterWidth / 2,
        ));
        const destinationSectionOverlap = Math.max(0, Math.min(
          PREVIEW_HOLD_TEXTURE_SECTION_OVERLAP,
          destinationCapWidth,
          (topWidth - destinationCapWidth * 2) / 2,
        ));
        if (sourceCenterWidth <= SNAP_EPSILON || destinationCapWidth <= SNAP_EPSILON) {
          drawAffineSection(0, holdTexture.naturalWidth, topEdges.left, bottomEdges.left, topWidth);
        } else {
          drawAffineSection(0, sourceCapWidth, topEdges.left, bottomEdges.left, destinationCapWidth);
          drawAffineSection(
            sourceCapWidth - sourceSectionOverlap,
            sourceCenterWidth + sourceSectionOverlap * 2,
            topEdges.left + destinationCapWidth - destinationSectionOverlap,
            bottomEdges.left + destinationCapWidth - destinationSectionOverlap,
            topWidth - destinationCapWidth * 2 + destinationSectionOverlap * 2,
          );
          drawAffineSection(
            holdTexture.naturalWidth - sourceCapWidth,
            sourceCapWidth,
            topEdges.right - destinationCapWidth,
            bottomEdges.right - destinationCapWidth,
            destinationCapWidth,
          );
        }
        ctx.restore();
        return true;
      }

      const widthSliceCount = Math.max(
        1,
        Math.ceil(widthDelta / PREVIEW_HOLD_TEXTURE_WIDTH_DELTA_PER_SLICE),
      );
      const heightSliceCap = Math.max(
        1,
        Math.ceil(connectorHeight / PREVIEW_HOLD_TEXTURE_MIN_SLICE_HEIGHT),
      );
      const sliceCount = Math.min(
        PREVIEW_HOLD_TEXTURE_MAX_SLICE_COUNT,
        heightSliceCap,
        widthSliceCount,
      );

      ctx.save();
      ctx.globalAlpha *= textureAlpha;
      for (let sliceIndex = 0; sliceIndex < sliceCount; sliceIndex += 1) {
        drawSlice(sliceIndex / sliceCount, (sliceIndex + 1) / sliceCount);
      }
      ctx.restore();

      return true;
    };
    const hiddenPreviewNoteIds = isPreviewMode
      ? hiddenPreviewNoteIdsRef.current
      : null;
    const previewVisibleHoldConnectorSegments = isPreviewPlaybackCanvas
      ? getPreviewConnectorSegmentsInDistanceRange(
          previewHoldConnectorDrawSegments,
          previewVisibleMinDistance,
          previewVisibleMaxDistance,
        )
      : [];
    const previewVisibleTexturedHoldConnectorDrawCount = shouldUsePreviewSprites && isPreviewHoldSpritesEnabled
      ? previewVisibleHoldConnectorSegments.reduce((count, segment) => {
          const previewSegment = segment as PreviewHoldConnectorSegment;
          if (!PREVIEW_HOLD_TEXTURE_URLS[previewSegment.note.type]) {
            return count;
          }

          return count + (previewSegment.groupedSegments?.length ?? 1);
        }, 0)
      : 0;
    const shouldUsePreviewHoldTextures = (
      shouldUsePreviewSprites
      && isPreviewHoldSpritesEnabled
      && previewVisibleTexturedHoldConnectorDrawCount <= PREVIEW_HOLD_TEXTURE_LOD_CONNECTOR_THRESHOLD
    );
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
    const targetPreviewRotationRadians = isPreviewPlaybackCanvas && isPreviewCameraTiltEnabled
      ? getPreviewCameraRotationRadians(activePreviewCameraTiltIntervals, currentPreviewTimepos)
      : 0;
    const tiltNow = performance.now();
    const previousTiltTimestamp = previewTiltTimestampRef.current || tiltNow;
    const tiltElapsedMs = Math.max(0, tiltNow - previousTiltTimestamp);
    const previewTiltEase = isPreviewPlaybackCanvas
      ? 1 - Math.exp(-tiltElapsedMs / PREVIEW_CONNECTOR_TILT_EASING_MS)
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

    ctx.save();
    applyPreviewCameraTransform();

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
      ? getPreviewNoteEntriesInDistanceRange(
          previewDistanceIndexedNoteRenderEntries,
          previewVisibleMinDistance,
          previewVisibleMaxDistance,
        )
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
      : getNoteBeatEntriesInRange(
          noteRenderIndex.noteBeatEntries,
          visibleStartBeat,
          visibleEndBeat,
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
        const width = Math.max(1, Math.min(X_POSITION_COUNT, Number(interpolatedWidth.toFixed(3))));
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
      if (hiddenPreviewNoteIds?.has(segment.note.id)) {
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

      const didDrawPreviewHoldTexture = shouldUsePreviewHoldTextures
        ? drawPreviewHoldTextureConnector(
            note.type,
            clippedConnector.fromNote,
            clippedConnector.fromY,
            clippedConnector.toNote,
            clippedConnector.toY,
          )
        : false;
      if (!didDrawPreviewHoldTexture) {
        ctx.fillStyle = isPreviewPlaybackCanvas && PREVIEW_PINK_HOLD_CONNECTOR_TYPES.has(note.type)
          ? NOTE_TYPES[note.type].color
          : getConnectorFill(note.type);
        const previousAlpha = ctx.globalAlpha;
        if (!isPreviewPlaybackCanvas) {
          ctx.globalAlpha *= EDITOR_HOLD_CONNECTOR_ALPHA;
        }
        drawProjectedConnectorQuad(
          clippedConnector.fromNote,
          clippedConnector.fromY,
          clippedConnector.toNote,
          clippedConnector.toY,
        );
        ctx.globalAlpha = previousAlpha;
      }
      if (shouldClipPreviewConnectorAtJudgementLine) {
        ctx.restore();
      }
      countRenderedObject();
    };
    const canDrawGroupedHoldConnectorSegments = (groupedSegments: PreviewHoldConnectorSegment[]) => {
      let groupParentY: number | null = null;
      let groupNoteY: number | null = null;
      let isGroupBeingJudged: boolean | null = null;
      let shouldGroupClipAtJudgementLine: boolean | null = null;

      for (const groupedSegment of groupedSegments) {
        if (hiddenPreviewNoteIds?.has(groupedSegment.note.id)) {
          return false;
        }

        if (groupedSegment.noteSpeed.kind === 'curve') {
          const animationStartTimepos = groupedSegment.noteSpeed.keyframes[0]?.time;
          if (
            currentPreviewTimepos >= groupedSegment.noteTimepos - SNAP_EPSILON
            || (
              animationStartTimepos !== undefined
              && currentPreviewTimepos < animationStartTimepos - SNAP_EPSILON
            )
          ) {
            return false;
          }
        }

        const noteY = getPreviewYFromNoteDistance(
          groupedSegment.noteDistance,
          groupedSegment.noteTimepos,
          groupedSegment.notePlaybackTime,
          groupedSegment.noteSpeed,
        );
        const parentY = getPreviewYFromNoteDistance(
          groupedSegment.parentDistance,
          groupedSegment.parentTimepos,
          groupedSegment.parentPlaybackTime,
          groupedSegment.parentSpeed,
        );

        if (Math.min(noteY, parentY) > height + 40 || Math.max(noteY, parentY) < -40) {
          return false;
        }

        const isConnectorBeingJudged = (
          isPreviewPlaybackCanvas
          && currentPreviewTimepos >= Math.min(groupedSegment.parentTimepos, groupedSegment.noteTimepos) - SNAP_EPSILON
          && currentPreviewTimepos <= Math.max(groupedSegment.parentTimepos, groupedSegment.noteTimepos) + SNAP_EPSILON
        );
        if (shouldClipPreviewHoldConnectors && isConnectorBeingJudged && Math.min(noteY, parentY) >= hitLineY) {
          return false;
        }

        const shouldClipAtJudgementLine = shouldClipPreviewHoldConnectors
          && isConnectorBeingJudged
          && Math.max(noteY, parentY) > hitLineY;

        if (
          groupParentY === null
          || groupNoteY === null
          || isGroupBeingJudged === null
          || shouldGroupClipAtJudgementLine === null
        ) {
          groupParentY = parentY;
          groupNoteY = noteY;
          isGroupBeingJudged = isConnectorBeingJudged;
          shouldGroupClipAtJudgementLine = shouldClipAtJudgementLine;
          continue;
        }

        if (
          !arePreviewConnectorValuesEqual(parentY, groupParentY)
          || !arePreviewConnectorValuesEqual(noteY, groupNoteY)
          || isConnectorBeingJudged !== isGroupBeingJudged
          || shouldClipAtJudgementLine !== shouldGroupClipAtJudgementLine
        ) {
          return false;
        }
      }

      return true;
    };

    // Draw hold connections before note bodies so linked notes render on top.
    for (const segment of visibleHoldConnectorSegments) {
      const previewSegment = segment as PreviewHoldConnectorSegment;
      const groupedSegments = isPreviewPlaybackCanvas ? previewSegment.groupedSegments : undefined;
      const shouldDrawTexturedSegmentsIndividually = Boolean(
        shouldUsePreviewHoldTextures
        && groupedSegments
        && PREVIEW_HOLD_TEXTURE_URLS[previewSegment.note.type],
      );
      const shouldDrawEditorStyleSegmentsIndividually = Boolean(
        groupedSegments
        && !shouldDrawTexturedSegmentsIndividually,
      );
      const shouldFallbackToIndividualSegments = groupedSegments
        ? shouldDrawTexturedSegmentsIndividually
          || shouldDrawEditorStyleSegmentsIndividually
          || !canDrawGroupedHoldConnectorSegments(groupedSegments)
        : false;

      if (shouldFallbackToIndividualSegments) {
        groupedSegments!.forEach(drawHoldConnectorSegment);
      } else {
        drawHoldConnectorSegment(segment);
      }
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
      if (hiddenPreviewNoteIds?.has(note.id)) {
        return;
      }

      const renderedNote = note.id === pendingDragUpdate?.noteId
        ? { ...note, lane: pendingDragUpdate.lane, time: pendingDragUpdate.time }
        : note;
      if (isPreviewPlaybackCanvas && stateRef.current.isPlaying && renderedNote.time <= time + SNAP_EPSILON) {
        hiddenPreviewNoteIdsRef.current.add(renderedNote.id);
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

  }, [activeLeftPanel, areTimingChangeIndicatorsAdjusted, bpmIndicatorEntries, copiedNotesPreviewVersion, curveDensityInput, curveEasingFamily, curveEasingType, curveEndIdInput, curveIdSelectTarget, curveNoteType, curveStartIdInput, effectiveGridZoom, formatTimelineMeasureProgress, getTimeFromTimepos, getTimeposFromTime, hasPinkHoldCameraNotes, pixelsPerBeat, projectData, isEditorJudgementGlowEnabled, isOfficialChartFormat, isOutOfBoundsPlacementEnabled, isPreviewMode, isPreviewCameraMovementEnabled, isPreviewCameraTiltEnabled, isPreviewHoldSpritesEnabled, isPreviewNoteAppearModeEnabled, isPreviewPrecomputeEnabled, isPreviewSpritesEnabled, isXPositionGridEnabled, hoverPreview, isCtrlHeld, isShiftHeld, noteWidth, notes, preview3DTiltDegrees, preview3DZoomHeightCurve, previewCameraMovementIntervals, previewCameraTiltIntervals, previewComboTimes, previewCurveNoteRenderEntryBuckets, previewDisplayMode, previewDistanceIndexedNoteRenderEntries, previewHoldConnectorDrawSegments, previewMinimumNoteSpeedMagnitude, previewNoteRenderEntries, previewNoteSpriteLoadVersion, previewPlaybackSpeedDistanceIndex, selectedNoteIdSet, selectedParentNoteIds, selectedNoteType, selectionBox, speedDistanceIndex, speedIndicatorEntries, timedBpmChanges, noteRenderIndex, offset]);

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

  const update = useCallback(() => {
    if (stateRef.current.isPlaying && audioRef.current) {
      const offsetInSeconds = parseFloat(offset.toString()) / 1000;
      const activePlaybackSpeed = stateRef.current.playbackSpeed;
      const currentTime = getPlaybackTimeFromClock(audioRef.current, offsetInSeconds);
      const now = performance.now();

      if (timelineDuration > 0 && currentTime >= timelineDuration) {
        void loopPlaybackToBeginning();
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
          }
          previewJudgementCursorTimeRef.current = currentTime;
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
  }, [drawGrid, offset, scheduleHitSoundsThrough, isPausedTimelineRendering, isPreviewMode, previewJudgementNoteEntries, resetPreviewJudgementState, scheduleEditorUpdate, statisticsRefreshIntervalMs, timelineDuration, loopPlaybackToBeginning, updateRenderedObjectsDisplay]);

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
    allowOutOfBounds = false,
    snapToLaneGrid = false,
  ) => {
    const xPositionWidth = laneWidth / 2;
    const rawLane = (canvasX - gridStartX) / xPositionWidth;
    const xPositionCount = laneCount * 2;

    if (snapToLaneGrid) {
      const snappedLane = Math.round(rawLane / 2) * 2;
      return allowOutOfBounds ? snappedLane : Math.max(0, Math.min(xPositionCount, snappedLane));
    }

    if (isXPositionGridEnabled) {
      const snappedLane = Math.round(rawLane);
      return allowOutOfBounds ? snappedLane : Math.max(0, Math.min(xPositionCount - 1, snappedLane));
    }

    const lane = allowOutOfBounds ? rawLane : Math.max(0, Math.min(xPositionCount, rawLane));
    return Number(lane.toFixed(3));
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

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
        setCurveNotesMessage('Click a note to select its ID.');
        return;
      }

      if (clickedNote) {
        if (curveIdSelectTarget === 'start') {
          setCurveStartIdInput(clickedNote.id.toString());
        } else {
          setCurveEndIdInput(clickedNote.id.toString());
        }

        setCurveNotesMessage(`${curveIdSelectTarget === 'start' ? 'Start' : 'End'} ID set to #${clickedNote.id}.`);
        setCurveIdSelectTarget(null);
      } else {
        setCurveNotesMessage('Click a note to select its ID.');
      }
      return;
    }

    if (canPlaceAtX) {
      pasteTargetRef.current = {
        lane: getLaneFromCanvasX(clickX, startX, laneWidth, lanes, isOutOfBoundsPlacementEnabled),
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
        const lane = getLaneFromCanvasX(clickX, startX, laneWidth, lanes, isOutOfBoundsPlacementEnabled);
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
          && currentNotes.some(note => note.id === manualParentInputId)
            ? manualParentInputId
            : null;
        const autoParentId = isHoldConnector && !isHoldStart
          ? currentId > 0 && currentNotes.some(note => note.id === currentId)
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
          title: 'Placed note',
          detail: `${getNoteHistoryDetail(placedNote)}${parentId === null ? '' : `, parent #${parentId}`}`,
        });

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
            title: deletedNotes.length === 1 ? 'Deleted note' : `Deleted ${deletedNotes.length} notes`,
            detail: deletedNotes.length === 1
              ? getNoteHistoryDetail(deletedNotes[0])
              : `IDs ${formatGroupedIds(deletedNotes.map(note => note.id))}`,
          });
        }
        restoreCurrentParentAfterDeletingNotes(deletedNotes);
        setNotes(prev => prev.filter(note => !noteIdsToDeleteSet.has(note.id)));
        setSelectedNoteIds(prev => prev.filter(id => !noteIdsToDeleteSet.has(id)));
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
      const lane = getLaneFromCanvasX(clickX, startX, laneWidth, lanes, isOutOfBoundsPlacementEnabled);
      const clickBeat = currentBeat + (hitLineY - clickY) / pixelsPerBeat;
      const snappedBeat = snapBeatToMeasureDivision(clickBeat, gridZoom, sortedChanges);

      pasteTargetRef.current = snappedBeat >= 0
        ? { lane, time: getTimeAtBeat(snappedBeat, sortedChanges) }
        : null;
    } else {
      pasteTargetRef.current = null;
    }

    if (draggingNoteId) {
      const lane = getLaneFromCanvasX(clickX, startX, laneWidth, lanes, true);
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
      const lane = getLaneFromCanvasX(clickX, startX, laneWidth, lanes, isOutOfBoundsPlacementEnabled);

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
  };

  const createZipBlobForSave = (zipBuffer: ArrayBuffer) => {
    if (zipBuffer.byteLength === 0) {
      throw new Error('Export generated an empty ZIP file.');
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

  const getExportFileHandle = async (suggestedName: string, errorLabel: string) => {
    if (!('showSaveFilePicker' in window)) {
      return null;
    }

    try {
      return await (window as any).showSaveFilePicker({
        suggestedName,
        types: [{
          description: 'ZIP Archive',
          accept: { 'application/zip': ['.zip'] },
        }],
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
            ? 'The receiver answered but was not ready before the timeout.'
            : 'The receiver answered with an unexpected ready response.';
        } else {
          lastErrorMessage = `The receiver returned HTTP ${response.status}.`;
        }
      } catch (err) {
        lastErrorMessage = err instanceof Error ? err.message : 'The receiver request failed.';
        // DR3FanmadeViewer may still be starting.
      }

      await new Promise(resolve => window.setTimeout(resolve, DR3FP_PREVIEW_RECEIVER_POLL_MS));
    }

    throw new Dr3FpPreviewError(
      'receiver',
      lastResponseStatus === null
        ? 'The editor could not reach the DR3FP local receiver at 127.0.0.1:27373.'
        : 'The DR3FP local receiver responded, but it did not become ready for this preview session.',
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
        'The editor lost contact with the DR3FP receiver while uploading the chart bundle.',
        err instanceof Error ? err.message : undefined,
      );
    }

    if (!response.ok) {
      throw new Dr3FpPreviewError(
        'upload',
        `DR3FP rejected the preview upload with HTTP ${response.status}.`,
        response.statusText || undefined,
      );
    }

    const body = await response.json().catch(() => null);
    if (body?.accepted !== true) {
      throw new Dr3FpPreviewError(
        'upload',
        'DR3FP received the upload request but did not accept the preview bundle.',
        body ? JSON.stringify(body) : 'The receiver did not return a readable acceptance response.',
      );
    }
  };

  const previewDr3Fp = async () => {
    if (!isDr3FpPreviewEnabled || !projectData || isExportDisabled || hasExportIncompatibleTimeSignature) return;

    if (stateRef.current.isPlaying) {
      await togglePlay();
    }

    setDr3FpPreviewStatus(DR3FP_PREVIEW_STATUS.exporting);
    setDr3FpPreviewLogs([
      createDr3FpPreviewLogEntry('Started DR3FP preview.'),
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
          'The preview ZIP could not be created from the current chart data.',
          err instanceof Error ? err.message : undefined,
        );
      }
      const zipBlob = createZipBlobForSave(zipBuffer);
      const sessionId = crypto.randomUUID();
      addDr3FpPreviewLog('Preview bundle was built.', `${formatByteSize(zipBlob.size)} ready to send.`);

      setDr3FpPreviewStatus(DR3FP_PREVIEW_STATUS.launching);
      addDr3FpPreviewLog(DR3FP_PREVIEW_STATUS.launching.message);
      try {
        window.location.href = `dr3fp://preview?session=${encodeURIComponent(sessionId)}&version=1`;
      } catch (err) {
        throw new Dr3FpPreviewError(
          'launch',
          'The browser blocked or could not hand off the preview link to DR3FP.',
          err instanceof Error ? err.message : undefined,
        );
      }

      setDr3FpPreviewStatus(DR3FP_PREVIEW_STATUS.receiver);
      addDr3FpPreviewLog(DR3FP_PREVIEW_STATUS.receiver.message);
      await waitForDr3FpPreviewReceiver(sessionId);
      addDr3FpPreviewLog('DR3FP receiver is ready.');
      setDr3FpPreviewStatus(DR3FP_PREVIEW_STATUS.uploading);
      addDr3FpPreviewLog(DR3FP_PREVIEW_STATUS.uploading.message);
      await uploadDr3FpPreviewBundle(sessionId, zipBlob);
      setDr3FpPreviewStatus(DR3FP_PREVIEW_STATUS.complete);
      addDr3FpPreviewLog(DR3FP_PREVIEW_STATUS.complete.message);
    } catch (err) {
      console.error('DR3FP preview failed', err);
      if (err instanceof Dr3FpPreviewError) {
        setDr3FpPreviewStatus(createDr3FpPreviewFailureStatus(err.kind, err.message, err.detail));
        addDr3FpPreviewLog(err.message, err.detail);
      } else {
        setDr3FpPreviewStatus(createDr3FpPreviewFailureStatus(
          'upload',
          err instanceof Error ? err.message : 'Preview failed.',
        ));
        addDr3FpPreviewLog(err instanceof Error ? err.message : 'Preview failed.');
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
      title: 'Organized chart for export',
      detail: changedCount === 0
        ? `${sourceNotes.length} notes were already in time/xpos order`
        : `Reassigned ${sourceNotes.length} note IDs by timepos, xpos, then original ID`,
    });

    return organized;
  };

  const exportZip = async (
    format: Exclude<ExportFormat, 'dr3-fp-preview'>,
    defaultFileName: string,
    errorLabel: string,
  ): Promise<ExportRunResult> => {
    if (!projectData || isExportDisabled) return 'failed';
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
      setCurveNotesMessage('Start ID and End ID must be whole-number note IDs.');
      return;
    }

    if (!Number.isInteger(curveDensity) || curveDensity <= 0) {
      setCurveNotesMessage('Density denominator must be a positive whole number.');
      return;
    }

    if (!curveEasingOption) {
      setCurveNotesMessage('Select a valid easing type.');
      return;
    }

    if (startId === endId) {
      setCurveNotesMessage('Start ID and End ID must be different notes.');
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
      setCurveNotesMessage('Both Start ID and End ID must match existing notes.');
      return;
    }

    const startBeat = getBeatAtTime(startNote.time, timedBpmChanges);
    const endBeat = getBeatAtTime(endNote.time, timedBpmChanges);
    const snapBeats = getCurveSnapBeatsBetween(startBeat, endBeat, curveDensity, timedBpmChanges);

    if (snapBeats.length === 0) {
      setCurveNotesMessage(`No 1/${curveDensity} snap positions exist between those notes.`);
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
      const width = Math.max(1, Math.min(X_POSITION_COUNT, Number(interpolatedWidth.toFixed(3))));
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
      `Generated ${generatedNotes.length} ${NOTE_TYPES[curveNoteType]?.name || `type ${curveNoteType}`} notes from #${startNote.id} to #${endNote.id}.`,
    );

    recordOperation({
      category: 'note',
      title: 'Generated curve notes',
      detail: `${generatedNotes.length} notes, ${NOTE_TYPES[curveNoteType]?.name || `type ${curveNoteType}`}, 1/${curveDensity}, ${curveEasingOption.label}, IDs ${formatGroupedIds(generatedNoteIds)}${shouldAttachEndNote ? `, end parent #${endParentId}` : ''}`,
    });
  };

  const currentId = Math.max(nextNoteIdRef.current - 1, 0);
  const currentParentId =
    currentParentInput.trim() === '' ? currentId : parseInt(currentParentInput, 10);
  const currentParentNote =
    currentParentId === 0 || Number.isNaN(currentParentId)
      ? null
      : notes.find((note) => note.id === currentParentId) || null;
  const copiedNotesCount = copiedNotesRef.current.length;
  const parsedCurveStartId = curveStartIdInput.trim() === '' ? NaN : Number(curveStartIdInput);
  const parsedCurveEndId = curveEndIdInput.trim() === '' ? NaN : Number(curveEndIdInput);
  const curveStartNote = Number.isInteger(parsedCurveStartId)
    ? notes.find((note) => note.id === parsedCurveStartId) || null
    : null;
  const curveEndNote = Number.isInteger(parsedCurveEndId)
    ? notes.find((note) => note.id === parsedCurveEndId) || null
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
      ? notes.find((note) => note.id === selectedNoteIds[0]) || null
      : null;
  const canUseSelectedAsParent = selectedNoteIds.length === 1 && selectedSingleNote !== null;
  const selectedParentNote =
    selectedSingleNote?.parentId === null || selectedSingleNote?.parentId === undefined
      ? null
      : notes.find((note) => note.id === selectedSingleNote.parentId) || null;
  const canEditSelectedNoteParent = selectedSingleNote ? canTypeHaveParent(selectedSingleNote.type) : false;
  const selectedNoteTimepos = selectedSingleNote ? getTimeposFromTime(selectedSingleNote.time) : 0;
  const chartStatistics = useMemo(() => calculateChartStatistics({
    getTimeFromTimepos,
    getTimeposFromTime,
    liveStatsTime,
    notes,
    precomputedIndex: isPreviewMode && isPreviewPrecomputeEnabled ? previewChartStatisticsIndexRef.current : null,
    shouldShowChartStatistics,
    speedChanges: isPreviewMode ? previewSpeedChanges : speedChanges,
    timedBpmChanges,
  }), [getTimeFromTimepos, getTimeposFromTime, isPreviewMode, isPreviewPrecomputeEnabled, liveStatsTime, notes, previewSpeedChanges, shouldShowChartStatistics, speedChanges, timedBpmChanges]);
  const {
    currentEditorBpm,
    currentEditorSpeed,
    currentEditorDistance,
    currentEditorCombo,
    currentEditorScore,
  } = chartStatistics;
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
      time: 'time',
      lane: 'xpos',
      type: 'type',
      width: 'width',
      parentId: 'parent ID',
      speed: 'speed',
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
      title: 'Modified note',
      detail: `#${selectedSingleNote.id} ${fieldDetails}`,
    });

    setNotes(prev => prev.map(note => (
      note.id === selectedSingleNote.id ? { ...note, ...normalizedUpdates } : note
    )));
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
      title: 'Modified BPM change',
      detail: `${formatTimingPosition(getBpmChangeTimepos(previousChange))} | ${changedFields.map(([key, value]) => `${key}: ${previousChange[key as keyof BpmChange]} -> ${value}`).join('; ')}`,
    });
  };

  const deleteBpmChange = (index: number) => {
    const deletedChange = bpmChanges[index];
    if (!deletedChange) return;

    setBpmChanges(prev => prev.filter((_, changeIndex) => changeIndex !== index));
    recordOperation({
      category: 'timing',
      title: 'Deleted BPM change',
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
      title: 'Added BPM change',
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
      title: 'Modified speed change',
      detail: `${formatTimingPosition(previousChange.timepos)} | ${changedFields.map(([key, value]) => `${key}: ${previousChange[key as keyof SpeedChange]} -> ${value}`).join('; ')}`,
    });
  };

  const deleteSpeedChange = (index: number) => {
    const deletedChange = speedChanges[index];
    if (!deletedChange) return;

    setSpeedChanges(prev => prev.filter((_, changeIndex) => changeIndex !== index));
    recordOperation({
      category: 'speed',
      title: 'Deleted speed change',
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
      title: 'Added speed change',
      detail: `${formatTimingPosition(newChange.timepos)} | ${formatHistoryNumber(newChange.speedChange)}x`,
    });
  };

  const handleGenerateSpeedCurveChanges = () => {
    const startId = speedCurveStartIdInput.trim() === '' ? NaN : Number(speedCurveStartIdInput);
    const endId = speedCurveEndIdInput.trim() === '' ? NaN : Number(speedCurveEndIdInput);
    const curveDensity = Number(speedCurveDensityInput);
    const curveEasingOption = CURVE_EASINGS_BY_ID.get(getCurveEasingId(speedCurveEasingFamily, speedCurveEasingType));

    if (!Number.isInteger(startId) || !Number.isInteger(endId)) {
      setSpeedCurveMessage('Start ID and End ID must be whole-number speed change IDs.');
      return;
    }

    if (startId === endId) {
      setSpeedCurveMessage('Start ID and End ID must be different speed changes.');
      return;
    }

    if (startId < 1 || startId > speedChanges.length || endId < 1 || endId > speedChanges.length) {
      setSpeedCurveMessage('Both IDs must match existing speed change rows.');
      return;
    }

    if (!Number.isInteger(curveDensity) || curveDensity <= 0) {
      setSpeedCurveMessage('Density denominator must be a positive whole number.');
      return;
    }

    if (!curveEasingOption) {
      setSpeedCurveMessage('Select a valid easing type.');
      return;
    }

    const startChange = speedChanges[startId - 1];
    const endChange = speedChanges[endId - 1];
    const startBeat = getBeatAtTimepos(startChange.timepos, timedBpmChanges);
    const endBeat = getBeatAtTimepos(endChange.timepos, timedBpmChanges);
    const snapBeats = getCurveSnapBeatsBetween(startBeat, endBeat, curveDensity, timedBpmChanges);

    if (snapBeats.length === 0) {
      setSpeedCurveMessage(`No 1/${curveDensity} snap positions exist between those speed changes.`);
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
      `Generated ${generatedChanges.length} speed changes from #${startId} to #${endId}.`,
    );

    recordOperation({
      category: 'speed',
      title: 'Generated curved speed changes',
      detail: `${generatedChanges.length} changes, 1/${curveDensity}, ${curveEasingOption.label}, IDs #${startId} -> #${endId}`,
    });
  };

  const updateOffset = (value: string | number) => {
    const previousOffset = offset;
    setOffset(value);

    if (previousOffset !== value) {
      recordOperation({
        category: 'timing',
        title: 'Modified offset',
        detail: `${formatMaybeValue(previousOffset)} ms -> ${formatMaybeValue(value)} ms`,
      });
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
        title: 'Edited chart file',
        detail: `Imported ${parsedLevel.notes.length} notes from chart text`,
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
        message: parsedError.message || 'Invalid chart file.',
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

  const leftSidebarProps = {
    isLeftPanelCompact,
    isLeftPanelContentVisible,
    toggleLeftPanelCompact,
    activeLeftPanel,
    setActiveLeftPanel,
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
    handleConfirm,
    offset,
    updateOffset,
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
        isSelectionTypeMenuOpen={isSelectionTypeMenuOpen}
        isStatisticsRefreshRateMenuOpen={isStatisticsRefreshRateMenuOpen}
        selectionType={selectionType}
        statisticsRefreshRate={statisticsRefreshRate}
        musicVolume={musicVolume}
        tapSoundVolume={tapSoundVolume}
        flickSoundVolume={flickSoundVolume}
        isPreviewSpritesEnabled={isPreviewSpritesEnabled}
        isPreviewHoldSpritesEnabled={isPreviewHoldSpritesEnabled}
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
        setIsSelectionTypeMenuOpen={setIsSelectionTypeMenuOpen}
        setIsStatisticsRefreshRateMenuOpen={setIsStatisticsRefreshRateMenuOpen}
        setSelectionType={setSelectionType}
        setStatisticsRefreshRate={setStatisticsRefreshRate}
        setMusicVolume={setMusicVolume}
        setTapSoundVolume={setTapSoundVolume}
        setFlickSoundVolume={setFlickSoundVolume}
        setIsPreviewSpritesEnabled={setIsPreviewSpritesEnabled}
        setIsPreviewHoldSpritesEnabled={setIsPreviewHoldSpritesEnabled}
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
        hasExportIncompatibleTimeSignature={hasExportIncompatibleTimeSignature}
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
        togglePlay={togglePlay}
        handleSeekChange={handleSeekChange}
        beginProgressSeek={beginProgressSeek}
        finishProgressSeek={finishProgressSeek}
        setIsXPositionGridEnabled={setIsXPositionGridEnabled}
        setIsOutOfBoundsPlacementEnabled={setIsOutOfBoundsPlacementEnabled}
        setIsExportMenuOpen={setIsExportMenuOpen}
        setIsPlaybackSpeedMenuOpen={setIsPlaybackSpeedMenuOpen}
        setIsPreviewMenuOpen={setIsPreviewMenuOpen}
        changePlaybackSpeed={changePlaybackSpeed}
        openHelp={openHelp}
        openSettings={openSettings}
        togglePreviewMode={togglePreviewMode}
        previewDr3Fp={previewDr3Fp}
        exportRaw={exportRaw}
        exportDr3Viewer={exportDr3Viewer}
        exportDr3Fp={exportDr3Fp}
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
      />
      <EditorFilePreviewModal
        file={previewedProjectFile}
        textContent={previewedProjectFileText}
        mediaUrl={previewedProjectFileUrl}
        onSaveChartText={savePreviewedChartText}
        onClose={() => setPreviewedProjectFile(null)}
      />
    </>
  );
}

