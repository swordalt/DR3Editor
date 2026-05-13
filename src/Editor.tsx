import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { convertBpmChangesToTime, getActiveChange, getBeatAtTime, getBpmChangeTimepos, getTimeAtBeat, formatTime } from './utils/editorUtils';
import EditorLayout from './components/EditorLayout';
import { NOTE_TYPES, AVAILABLE_NOTE_TYPES, HOLD_CONNECTOR_TYPES, HOLD_CENTER_TYPES, HOLD_END_TYPES, HOLD_START_TYPES, UNKNOWN_NOTE_TYPE, canTypeHaveParent, getConnectorFill, shouldOmitParentForType } from './constants/editorConstants';
import type { BpmChange, EditorFormData, EditorMode, Note, ProjectData, SelectionBox, SpeedChange, TimedBpmChange } from './types/editorTypes';
import { createExportZipInWorker, warmExportWorker } from './utils/exportWorkerClient';
import { buildLevelText } from './utils/levelFormat';
import { applyAudioPlaybackSpeed } from './editor/audioPlayback';
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
import { buildNoteRenderIndex, getNoteBeatEntriesInRange } from './editor/noteRenderIndex';
import { findChartIssues, type ChartIssue } from './editor/chartIssues';

import {
  APPEAR_MODE_ENTRY_DISTANCE,
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
import { buildChartProjectFiles } from './editor/chartProjectFiles';
import { buildChartStatisticsIndex, calculateChartStatistics, type ChartStatisticsIndex } from './editor/chartStatistics';
import {
  METADATA_REQUIRED_FIELDS,
  getInvalidMetadataFields,
  hasInvalidMetadataFields,
  isValidDifficulty,
  isValidSongId,
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

const getOffsetInSeconds = (offset: string | number) => {
  const parsedOffset = parseFloat(offset.toString());
  return Number.isFinite(parsedOffset) ? parsedOffset / 1000 : 0;
};
const text = translations;

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

    const flushActiveGroup = () => {
      if (activeGroup.length < 2) {
        groupedSegments.push(...activeGroup);
      } else {
        const firstSegment = activeGroup[0];
        const parentLane = activeGroup[0].parentNote.lane;
        const noteLane = activeGroup[0].note.lane;
        const parentRight = activeGroup.reduce(
          (right, segment) => Math.max(right, segment.parentNote.lane + segment.parentNote.width),
          parentLane,
        );
        const noteRight = activeGroup.reduce(
          (right, segment) => Math.max(right, segment.note.lane + segment.note.width),
          noteLane,
        );
        const minDistance = activeGroup.reduce(
          (minimumDistance, segment) => Math.min(minimumDistance, segment.minDistance),
          firstSegment.minDistance,
        );
        const maxDistance = activeGroup.reduce(
          (maximumDistance, segment) => Math.max(maximumDistance, segment.maxDistance),
          firstSegment.maxDistance,
        );

        groupedSegments.push({
          ...firstSegment,
          parentNote: {
            ...firstSegment.parentNote,
            lane: parentLane,
            width: parentRight - parentLane,
          },
          note: {
            ...firstSegment.note,
            lane: noteLane,
            width: noteRight - noteLane,
          },
          minDistance,
          maxDistance,
          groupedSegments: activeGroup,
        });
      }

      activeGroup = [];
      activeParentRight = 0;
      activeNoteRight = 0;
    };

    sortedSegments.forEach((segment) => {
      if (activeGroup.length === 0) {
        activeGroup = [segment];
        activeParentRight = segment.parentNote.lane + segment.parentNote.width;
        activeNoteRight = segment.note.lane + segment.note.width;
        return;
      }

      const isParentContiguous = arePreviewConnectorValuesEqual(segment.parentNote.lane, activeParentRight);
      const isNoteContiguous = arePreviewConnectorValuesEqual(segment.note.lane, activeNoteRight);

      if (!isParentContiguous || !isNoteContiguous) {
        flushActiveGroup();
        activeGroup = [segment];
      } else {
        activeGroup.push(segment);
      }

      activeParentRight = segment.parentNote.lane + segment.parentNote.width;
      activeNoteRight = segment.note.lane + segment.note.width;
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
  setOffset
}: EditorProps) {
  const initialEditorSettings = useMemo(loadEditorSettings, []);
  const [isModalOpen, setIsModalOpen] = useState(mode === 'new');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
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
  const [isPreviewCameraTiltEnabled, setIsPreviewCameraTiltEnabled] = useState(initialEditorSettings.isPreviewCameraTiltEnabled);
  const [isPreviewCameraMovementEnabled, setIsPreviewCameraMovementEnabled] = useState(initialEditorSettings.isPreviewCameraMovementEnabled);
  const [isPreviewNoteSpeedChangesEnabled, setIsPreviewNoteSpeedChangesEnabled] = useState(initialEditorSettings.isPreviewNoteSpeedChangesEnabled);
  const [isPreviewNoteAppearModeEnabled, setIsPreviewNoteAppearModeEnabled] = useState(initialEditorSettings.isPreviewNoteAppearModeEnabled);
  const [previewDisplayMode, setPreviewDisplayMode] = useState<PreviewDisplayMode>(initialEditorSettings.previewDisplayMode);
  const [preview3DTiltDegrees, setPreview3DTiltDegrees] = useState(initialEditorSettings.preview3DTiltDegrees);
  const [activeLeftPanel, setActiveLeftPanel] = useState<ActiveLeftPanel>('main');
  const [isOrganizingNotes, setIsOrganizingNotes] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
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
  const [hoverPreview, setHoverPreview] = useState<HoverPreview | null>(null);
  const [copiedNotesPreviewVersion, setCopiedNotesPreviewVersion] = useState(0);
  const [isCtrlHeld, setIsCtrlHeld] = useState(false);
  const [isShiftHeld, setIsShiftHeld] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<number[]>([]);
  const [draggingNoteId, setDraggingNoteId] = useState<number | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [operationHistory, setOperationHistory] = useState<OperationHistoryEntry[]>([]);
  const [chartIssues, setChartIssues] = useState<ChartIssue[]>([]);
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
    difficulty: '1',
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
  const [fps, setFps] = useState(0);
  const [renderedObjects, setRenderedObjects] = useState(0);
  const [isFpsCounterHovered, setIsFpsCounterHovered] = useState(false);
  const [isPausedTimelineRendering, setIsPausedTimelineRendering] = useState(false);
  const effectiveGridZoom = isPreviewMode ? 0 : gridZoom;
  const offsetInSeconds = getOffsetInSeconds(offset);
  const audioTimelineDuration = duration > 0 ? Math.max(0, duration + offsetInSeconds) : 0;
  
  const audioRef = useRef<HTMLAudioElement>(null);
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
  const pendingDragUpdateRef = useRef<PendingDragUpdate | null>(null);
  const dragStartNoteRef = useRef<Note | null>(null);
  const copiedNotesRef = useRef<CopiedNote[]>([]);
  const pasteTargetRef = useRef<HoverPreview | null>(null);
  const dragUpdateFrameRef = useRef<number>();
  const hoverPreviewRef = useRef<HoverPreview | null>(null);
  const playRequestIdRef = useRef(0);
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
  const shouldShowChartStatistics = isRightPanelContentVisible && selectedNoteIds.length === 0;

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
  }, [musicVolume, projectData?.audioUrl, setupMusicGain]);

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
    const maxNoteId = notes.reduce((maxId, note) => Math.max(maxId, note.id), 0);
    nextNoteIdRef.current = maxNoteId + 1;
  }, [notes]);

  const timedBpmChanges = useMemo(() => convertBpmChangesToTime(bpmChanges), [bpmChanges]);
  const isOfficialChartFormat = (projectData?.chartFormat ?? 'Official') === 'Official';
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
  const isExportDisabled = hasExportIncompatibleTimeSignature || !hasRequiredExportMetadata;
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
    notes: stateRef.current.notes.map(note => ({ ...note })),
    bpmChanges: stateRef.current.bpmChanges.map(change => ({ ...change })),
    speedChanges: stateRef.current.speedChanges.map(change => ({ ...change })),
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

  const chartTimelineDuration = useMemo(() => Math.max(
    0,
    ...notes.map(note => note.time),
    ...speedChanges.map(change => getTimeFromTimepos(change.timepos)),
  ), [getTimeFromTimepos, notes, speedChanges]);
  const timelineDuration = Math.max(audioTimelineDuration, chartTimelineDuration);

  const recheckChartIssues = useCallback(() => {
    setChartIssues(findChartIssues(notes, getTimeposFromTime));
  }, [getTimeposFromTime, notes]);

  useEffect(() => {
    if (hasScannedInitialChartIssuesRef.current) {
      return;
    }

    hasScannedInitialChartIssuesRef.current = true;
    recheckChartIssues();
  }, [recheckChartIssues]);

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
  const previewPlaybackSpeedDistanceIndex = useMemo(
    () => buildSpeedDistanceIndex(speedChanges.map(change => ({
      ...change,
      timepos: getTimeFromTimepos(change.timepos),
    }))),
    [getTimeFromTimepos, speedChanges],
  );

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
        if (isPreviewPrecomputeEnabled) {
          const cachedPreviewPrecompute = previewModePrecomputeCacheRef.current;
          const cameraTiltSegments = previewCameraTiltSegmentsRef.current;
          const canReusePreviewPrecompute = Boolean(
            cachedPreviewPrecompute
            && cachedPreviewPrecompute.notes === stateRef.current.notes
            && cachedPreviewPrecompute.speedChanges === stateRef.current.speedChanges
            && cachedPreviewPrecompute.bpmChanges === stateRef.current.bpmChanges
            && cachedPreviewPrecompute.playbackSpeedDistanceIndex === previewPlaybackSpeedDistanceIndex
            && cachedPreviewPrecompute.cameraTiltSegments === cameraTiltSegments
          );
          const previewPrecompute = canReusePreviewPrecompute
            ? cachedPreviewPrecompute!
            : {
                notes: stateRef.current.notes,
                speedChanges: stateRef.current.speedChanges,
                bpmChanges: stateRef.current.bpmChanges,
                playbackSpeedDistanceIndex: previewPlaybackSpeedDistanceIndex,
                cameraTiltSegments,
                chartStatisticsIndex: buildChartStatisticsIndex({
                  getTimeFromTimepos,
                  notes: stateRef.current.notes,
                  speedChanges: stateRef.current.speedChanges,
                }),
                cameraTiltIntervals: buildPreviewCameraTiltIntervals(cameraTiltSegments),
              };

          previewModePrecomputeCacheRef.current = previewPrecompute;
          previewComboTimesRef.current = previewPrecompute.chartStatisticsIndex.sortedNoteTimes;
          previewChartStatisticsIndexRef.current = previewPrecompute.chartStatisticsIndex;
          previewPlaybackSpeedDistanceIndexRef.current = previewPrecompute.playbackSpeedDistanceIndex;
          previewCameraTiltIntervalsRef.current = previewPrecompute.cameraTiltIntervals;
        } else {
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
        previewCameraRotationRadiansRef.current = 0;
        previewTiltTimestampRef.current = 0;
        preview3DCameraScaleRef.current = 1;
        preview3DCameraYOffsetRef.current = 0;
        preview3DCameraTimestampRef.current = 0;
      }

      return nextPreviewMode;
    });
  }, [clearActiveNoteInteraction, getTimeFromTimepos, isPreviewPrecomputeEnabled, previewPlaybackSpeedDistanceIndex, resetPreviewJudgementState]);

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

    setNotes(prev => prev.filter(n => !noteIdsToDelete.has(n.id)));
    setSelectedNoteIds([]);
    clearActiveNoteInteraction();
  }, [clearActiveNoteInteraction, getNoteHistoryDetail, recordOperation, selectedNoteIds, setNotes]);

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

  const noteRenderIndex = useMemo(
    () => buildNoteRenderIndex(notes, timedBpmChanges, selectedNoteIdSet),
    [notes, timedBpmChanges, selectedNoteIdSet],
  );
  const previewNoteRenderEntries = useMemo(
    () => noteRenderIndex.noteBeatEntries
      .map(({ note, beat }) => {
        const timepos = getTimeposFromTime(note.time);
        return {
          note,
          beat,
          timepos,
          playbackTime: note.time,
          distance: getSpeedDistanceAtTimepos(note.time, previewPlaybackSpeedDistanceIndex),
          noteSpeed: parsePreviewNoteSpeed(
            isPreviewNoteSpeedChangesEnabled
              ? (
                  isPreviewNoteAppearModeEnabled && note.appearMode === 'P'
                    ? APPEAR_MODE_P_NSC
                    : note.speed
                )
              : undefined,
            timepos,
            speedDistanceIndex,
          ),
        };
      })
      .sort(comparePreviewNoteRenderEntries),
    [
      getTimeposFromTime,
      isPreviewNoteAppearModeEnabled,
      isPreviewNoteSpeedChangesEnabled,
      noteRenderIndex.noteBeatEntries,
      previewPlaybackSpeedDistanceIndex,
      speedDistanceIndex,
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
  const previewNoteRenderEntryById = useMemo(
    () => new Map(previewNoteRenderEntries.map(entry => [entry.note.id, entry])),
    [previewNoteRenderEntries],
  );
  const previewHoldConnectorSegments = useMemo(
    () => noteRenderIndex.holdConnectorSegments
      .map((segment) => {
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
            isPreviewNoteSpeedChangesEnabled
              ? (
                  isPreviewNoteAppearModeEnabled && segment.note.appearMode === 'P'
                    ? APPEAR_MODE_P_NSC
                    : segment.note.speed
                )
              : undefined,
            noteTimepos,
            speedDistanceIndex,
          ),
          parentSpeed: parentEntry?.noteSpeed ?? parsePreviewNoteSpeed(
            isPreviewNoteSpeedChangesEnabled
              ? (
                  isPreviewNoteAppearModeEnabled && segment.parentNote.appearMode === 'P'
                    ? APPEAR_MODE_P_NSC
                    : segment.parentNote.speed
                )
              : undefined,
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
      )),
    [
      getTimeposFromTime,
      isPreviewNoteAppearModeEnabled,
      isPreviewNoteSpeedChangesEnabled,
      noteRenderIndex.holdConnectorSegments,
      previewNoteRenderEntryById,
      previewPlaybackSpeedDistanceIndex,
      speedDistanceIndex,
    ],
  );
  const previewHoldConnectorDrawSegments = useMemo(
    () => buildGroupedPreviewHoldConnectorSegments(previewHoldConnectorSegments),
    [previewHoldConnectorSegments],
  );
  const previewJudgementNoteEntries = useMemo(
    () => notes
      .map(note => ({ id: note.id, time: note.time }))
      .sort((a, b) => (a.time - b.time) || (a.id - b.id)),
    [notes],
  );
  const previewCameraMovementSegments = useMemo(
    () => noteRenderIndex.holdConnectorSegments
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
      .sort((a, b) => (a.endTime - b.endTime) || (a.startTime - b.startTime)),
    [noteRenderIndex.holdConnectorSegments],
  );
  const hasPinkHoldCameraNotes = useMemo(
    () => notes.some(note => note.type === PINK_HOLD_CENTER_TYPE || note.type === PINK_HOLD_END_TYPE),
    [notes],
  );
  const preview3DZoomHeightCurve = useMemo(() => {
    const curveLength = Math.max(
      1,
      Math.ceil(Math.max(timelineDuration, ...notes.map(note => note.time), 0)) + 3,
    );
    const heightList = Array.from({ length: curveLength }, () => 0);
    const setHeight = (second: number, value: number) => {
      if (second < 0 || second >= heightList.length) {
        return;
      }

      heightList[second] = Math.max(heightList[second], value);
    };

    notes.forEach((note) => {
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
  }, [notes, timelineDuration]);
  const previewCameraTiltSegments = useMemo(
    () => previewHoldConnectorSegments
      .map((segment) => {
        const noteCenterXPosition = segment.note.lane + segment.note.width / 2;
        const parentCenterXPosition = segment.parentNote.lane + segment.parentNote.width / 2;

        return {
          startTimepos: Math.min(segment.parentTimepos, segment.noteTimepos),
          endTimepos: Math.max(segment.parentTimepos, segment.noteTimepos),
          connectorCenterXPosition: (noteCenterXPosition + parentCenterXPosition) / 2,
        };
      })
      .filter(segment => segment.endTimepos - segment.startTimepos > SNAP_EPSILON)
      .sort((a, b) => (a.startTimepos - b.startTimepos) || (a.endTimepos - b.endTimepos)),
    [previewHoldConnectorSegments],
  );
  previewCameraTiltSegmentsRef.current = previewCameraTiltSegments;
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

  const handleConfirm = () => {
    setMetadataTouchedFields(getRequiredMetadataTouchedFields());

    if (hasInvalidMetadataFields(invalidMetadataFields)) {
      alert('Please enter a valid Song ID, Song BPM, Difficulty, and Audio File.');
      return;
    }

    const wasProjectCreated = !projectData;
    let audioUrl = projectData?.audioUrl || '';
    if (formData.songFile && formData.songFile !== projectData?.songFile) {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      audioUrl = URL.createObjectURL(formData.songFile);
    }
    const parsedBpm = parseFloat(formData.songBpm);
    const fallbackBpm = projectData?.bpm || bpmChanges[0]?.bpm || 120;
    const nextBpm = Number.isFinite(parsedBpm) ? parsedBpm : fallbackBpm;

    setProjectData({
      ...formData,
      chartFormat: projectData?.chartFormat ?? 'Official',
      songBpm: nextBpm.toString(),
      bpm: nextBpm,
      audioUrl
    });

    // Imported charts can exist before project metadata is set, so only seed BPMs for actual new projects.
    if (!projectData && mode === 'new') {
      setBpmChanges([{ timepos: 0, bpm: nextBpm, timeSignature: '4/4' }]);
    }

    setIsModalOpen(false);
    if (activeLeftPanel === 'editInfo') {
      setActiveLeftPanel('main');
    }
    setMetadataTouchedFields({});

    recordOperation({
      category: 'metadata',
      title: wasProjectCreated ? 'Created project metadata' : 'Updated chart metadata',
      detail: `${formData.songName || 'Untitled Project'} | BPM ${formatHistoryNumber(nextBpm)} | Difficulty ${formData.difficulty || 'None'}`,
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

  const handleSeekChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    stopHitsounds();
    const rawTargetTime = parseFloat(e.target.value);
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
    stateRef.current.playbackStartPerformanceTime = performance.now();
    lastPlayedTimeRef.current = newTime;
    hitSoundCursorRef.current = findHitSoundCursor(newTime);
    scheduledHitSoundKeysRef.current.clear();
    
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, newTime - offsetInSeconds);
    }
    if (timeDisplayRef.current && projectData) {
      timeDisplayRef.current.textContent = formatTime(newTime, sortedChanges, effectiveGridZoom);
    }
    renderPausedTimelineAtFullFps();
  }, [projectData, offsetInSeconds, effectiveGridZoom, isPreviewMode, renderPausedTimelineAtFullFps, resetPreviewJudgementState, timedBpmChanges, timelineDuration]);

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

  const syncPlaybackToAudioClock = (audio: HTMLAudioElement, offsetInSeconds: number, fallbackTime: number) => {
    const now = performance.now();
    const syncedTime = !audio.paused && !audio.seeking
      ? Math.max(0, audio.currentTime + offsetInSeconds)
      : fallbackTime;

    stateRef.current.currentTime = syncedTime;
    stateRef.current.playbackStartTime = syncedTime;
    stateRef.current.playbackStartPerformanceTime = now;
    stateRef.current.playbackAudioClockReadyTime = now + AUDIO_CLOCK_HANDOFF_DELAY_MS;
    resetHitSoundScheduler(syncedTime, true);
  };

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

    if (audio && !audio.paused && !audio.seeking && now >= stateRef.current.playbackAudioClockReadyTime) {
      const audioTime = Math.max(0, audio.currentTime + offsetInSeconds);
      const audioDrift = audioTime - projectedTime;
      if (Math.abs(audioDrift) > AUDIO_CLOCK_SYNC_TOLERANCE_SECONDS) {
        stateRef.current.playbackStartTime = audioTime;
        stateRef.current.playbackStartPerformanceTime = now;
        return audioTime;
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
      audio.currentTime = Math.max(0, audioStartTime);

      if (audioStartTime < 0) {
        playTimeoutRef.current = window.setTimeout(() => {
          playTimeoutRef.current = undefined;
          if (stateRef.current.isPlaying && audioRef.current) {
            applyAudioPlaybackSpeed(audioRef.current, stateRef.current.playbackSpeed);
            audioRef.current.play().catch(() => {});
          }
        }, (-audioStartTime / nextSpeed) * 1000);
      } else {
        audio.play().catch(() => {});
      }
    }

    setPlaybackSpeed(nextSpeed);
    setIsPlaybackSpeedMenuOpen(false);
  };

  const seekAudioToTime = (audio: HTMLAudioElement, time: number) => new Promise<void>((resolve) => {
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
      timeDisplayRef.current.textContent = formatTime(loopStartTime, sortedChanges, effectiveGridZoom);
    }
    updateProgressBarValue(loopStartTime, true);

    applyAudioPlaybackSpeed(audio, activePlaybackSpeed);

    if (offsetInSeconds > 0) {
      audio.pause();
      audio.currentTime = 0;
      playTimeoutRef.current = window.setTimeout(() => {
        playTimeoutRef.current = undefined;
        if (playRequestIdRef.current === playRequestId && stateRef.current.isPlaying && audioRef.current) {
          applyAudioPlaybackSpeed(audioRef.current, stateRef.current.playbackSpeed);
          audioRef.current.play()
            .then(() => {
              if (playRequestIdRef.current === playRequestId && stateRef.current.isPlaying && audioRef.current) {
                syncPlaybackToAudioClock(audioRef.current, offsetInSeconds, loopStartTime + offsetInSeconds);
              }
            })
            .catch(() => {});
        }
      }, (offsetInSeconds / activePlaybackSpeed) * 1000);
      isLoopingPlaybackRef.current = false;
      return;
    }

    await seekAudioToTime(audio, -offsetInSeconds);
    if (playRequestIdRef.current === playRequestId && stateRef.current.isPlaying) {
      await audio.play().catch(() => {});
      if (playRequestIdRef.current === playRequestId && stateRef.current.isPlaying) {
        syncPlaybackToAudioClock(audio, offsetInSeconds, loopStartTime);
      }
    }
    isLoopingPlaybackRef.current = false;
  }, [effectiveGridZoom, offset, projectData, resetPreviewJudgementState]);

  const togglePlay = useCallback(async () => {
    if (!audioRef.current || !projectData) return;
    const offsetInSeconds = parseFloat(offset.toString()) / 1000;
    
    if (stateRef.current.isPlaying) {
      playRequestIdRef.current += 1;
      const playbackTime = Math.max(0, getPlaybackTimeFromClock(audioRef.current, offsetInSeconds));
      stopHitsounds();
      audioRef.current.pause();
      clearPlayTimeout();
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = undefined;
      }
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
      audioRef.current.currentTime = Math.max(0, snappedTime - offsetInSeconds);
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = formatTime(snappedTime, sortedChanges, effectiveGridZoom);
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
      hitSoundCursorRef.current = findHitSoundCursor(playbackStartTime);
      scheduledHitSoundKeysRef.current.clear();
      lastPlayedTimeRef.current = playbackStartTime;
      // Apply offset here. If delay (offset > 0), wait. If advance (offset < 0), seek.
      if (offsetInSeconds > 0) {
        // Delay music: Editor starts at current time, Music starts playing after offsetInSeconds past audio seek point
        const audioStartTime = playbackStartTime - offsetInSeconds;
        if (audioStartTime < 0) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          const audioDelaySeconds = -audioStartTime / stateRef.current.playbackSpeed;
          playTimeoutRef.current = window.setTimeout(() => {
            playTimeoutRef.current = undefined;
            if (playRequestIdRef.current === playRequestId && audioRef.current) {
              applyAudioPlaybackSpeed(audioRef.current, stateRef.current.playbackSpeed);
              audioRef.current.play()
                .then(() => {
                  if (playRequestIdRef.current === playRequestId && stateRef.current.isPlaying && audioRef.current) {
                    syncPlaybackToAudioClock(audioRef.current, offsetInSeconds, offsetInSeconds);
                  }
                })
                .catch(() => {});
            }
          }, audioDelaySeconds * 1000);
        } else {
          await seekAudioToTime(audioRef.current, audioStartTime);
          if (playRequestIdRef.current !== playRequestId) {
            return;
          }
          await audioRef.current.play().catch(() => {});
          if (playRequestIdRef.current !== playRequestId) {
            return;
          }
          syncPlaybackToAudioClock(audioRef.current, offsetInSeconds, playbackStartTime);
        }
      } else {
        // Advance music: Start music early
        await seekAudioToTime(audioRef.current, playbackStartTime - offsetInSeconds);
        if (playRequestIdRef.current !== playRequestId) {
          return;
        }
        await audioRef.current.play().catch(() => {});
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
      } else {
        stateRef.current.playbackStartTime = playbackStartTime;
        stateRef.current.playbackStartPerformanceTime = performance.now();
        stateRef.current.playbackAudioClockReadyTime = stateRef.current.playbackStartPerformanceTime + AUDIO_CLOCK_HANDOFF_DELAY_MS;
        stateRef.current.currentTime = playbackStartTime;
      }
      stateRef.current.isPlaying = true;
      
      setIsPlaying(true);
    }
  }, [effectiveGridZoom, prepareHitSounds, projectData, offset, resetPreviewJudgementState, setupMusicGain, isPreviewMode]);

  const restoreOperationSnapshot = useCallback((snapshot: OperationHistorySnapshot) => {
    if (stateRef.current.isPlaying) {
      playRequestIdRef.current += 1;
      stopHitsounds();
      audioRef.current?.pause();
      clearPlayTimeout();

      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = undefined;
      }

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
  }, [renderPausedTimelineAtFullFps, setBpmChanges, setNotes, setOffset, setSpeedChanges]);

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

        if (e.code === 'Space') {
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
      
      if (e.code === 'Space') {
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
      letter: 'S' | 'C' | 'E' | '?',
      scale = 1,
    ) => {
      ctx.fillStyle = letter === '?' ? '#000000' : '#ffffff';
      ctx.font = `bold ${12 * scale}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, centerX, centerY);
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
      timeDisplayRef.current.textContent = formatTime(time, sortedChanges, effectiveGridZoom);
    }
    updateProgressBarValue(time);

    const currentBeat = getBeatAtTime(time, sortedChanges);
    const hitLineY = height - 150;
    const isPreviewPlaybackCanvas = isPreviewMode;
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
      ? getPreviewCameraXPositionOffset(previewCameraMovementSegments, time)
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
        const yProgress = easePreviewAppearOut(linearProgress);
        const scaleProgress = easePreviewAppearIn(linearProgress);
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
        const fromEdges = getProjectedNoteEdges(fromNote, fromY);
        const toEdges = getProjectedNoteEdges(toNote, toY);

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
        const fromEdges = getProjectedNoteEdges(segmentFromNote, segmentFromY);
        const toEdges = getProjectedNoteEdges(segmentToNote, segmentToY);

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
    const visibleHoldConnectorSegments = isPreviewPlaybackCanvas
      ? getPreviewConnectorSegmentsInDistanceRange(
          previewHoldConnectorDrawSegments,
          previewVisibleMinDistance,
          previewVisibleMaxDistance,
        )
      : noteRenderIndex.holdConnectorSegments;
    const activePreviewCameraTiltIntervals = isPreviewPlaybackCanvas
      ? (
          isPreviewPrecomputeEnabled
            ? (
                previewCameraTiltIntervalsRef.current.length > 0
                  ? previewCameraTiltIntervalsRef.current
                  : buildPreviewCameraTiltIntervals(previewCameraTiltSegmentsRef.current)
              )
            : buildPreviewCameraTiltIntervals(previewCameraTiltSegmentsRef.current)
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

    ctx.save();
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
      for (let i = 0; i <= lanes; i++) {
        const x = startX + i * laneWidth;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      ctx.stroke();
      countRenderedObject();
    }
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
    const pendingDragBeat = pendingDragUpdate
      ? getBeatAtTime(pendingDragUpdate.time, sortedChanges)
      : null;
    const visiblePreviewDistanceNoteEntries = isPreviewPlaybackCanvas
      ? getPreviewNoteEntriesInDistanceRange(
          previewDistanceIndexedNoteRenderEntries,
          previewVisibleMinDistance,
          previewVisibleMaxDistance,
        )
      : [];
    const visibleNoteEntries = isPreviewPlaybackCanvas
      ? (
          previewCurveNoteRenderEntries.length > 0
            ? [
                ...visiblePreviewDistanceNoteEntries,
                ...previewCurveNoteRenderEntries,
              ].sort(comparePreviewNoteRenderEntries)
            : visiblePreviewDistanceNoteEntries
        )
      : getNoteBeatEntriesInRange(
          noteRenderIndex.noteBeatEntries,
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

    gridLines.sort((a, b) => a.beat - b.beat);

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
      sortedChanges.forEach(change => {
        const changeBeat = change.startBeat;
        const y = hitLineY - (changeBeat - currentBeat) * pixelsPerBeat;

        if (y > 0 && y < height) {
          const indicatorKey = getIndicatorKeyAtBeat(changeBeat);
          const bpmLabel = isOfficialChartFormat
            ? `BPM: ${change.bpm}`
            : `BPM: ${change.bpm} | ${change.timeSignature}`;
          getIndicatorGroup(indicatorKey, y).bpmLabels.push(bpmLabel);
        }
      });

      // Queue speed change indicators above BPM changes at the same time position.
      stateRef.current.speedChanges.forEach(sc => {
        const scBeat = getBeatAtTimepos(sc.timepos, sortedChanges);
        const y = hitLineY - (scBeat - currentBeat) * pixelsPerBeat;

        if (y > 0 && y < height) {
          const indicatorKey = getIndicatorKeyAtBeat(scBeat);
          getIndicatorGroup(indicatorKey, y).speedLabels.push(`SC: ${sc.speedChange}x`);
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
        && currentPreviewTimepos < Math.max(previewSegment.parentTimepos, previewSegment.noteTimepos) - SNAP_EPSILON;
      const shouldClipPreviewConnectorAtJudgementLine = shouldClipPreviewHoldConnectors
        && isPreviewConnectorBeingJudged
        && Math.max(noteY, parentY) > hitLineY;
      if (shouldClipPreviewHoldConnectors && isPreviewConnectorBeingJudged && Math.min(noteY, parentY) >= hitLineY) {
        return;
      }

      if (shouldClipPreviewConnectorAtJudgementLine) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(-width, -height, width * 3, hitLineY + height);
        ctx.clip();
      }

      ctx.fillStyle = getConnectorFill(note.type);
      drawProjectedConnectorQuad(
        clippedConnector.fromNote,
        clippedConnector.fromY,
        clippedConnector.toNote,
        clippedConnector.toY,
      );
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
          currentPreviewTimepos >= Math.min(groupedSegment.parentTimepos, groupedSegment.noteTimepos) - SNAP_EPSILON
          && currentPreviewTimepos < Math.max(groupedSegment.parentTimepos, groupedSegment.noteTimepos) - SNAP_EPSILON
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
      const shouldFallbackToIndividualSegments = groupedSegments
        ? !canDrawGroupedHoldConnectorSegments(groupedSegments)
        : false;

      if (shouldFallbackToIndividualSegments) {
        groupedSegments!.forEach(drawHoldConnectorSegment);
      } else {
        drawHoldConnectorSegment(segment);
      }
    }

    if (curvePreviewNotes.length > 0 && canTypeHaveParent(curveNoteType) && previewStartNote) {
      const connectorAlpha = 0.08;
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

    const orderedVisibleNoteEntries = isPreviewPlaybackCanvas
      ? [...visibleNoteEntries].sort((a, b) => {
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

    // Draw notes
    orderedVisibleNoteEntries.forEach((entry) => {
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

      if (isPreviewMode && HOLD_CENTER_TYPES.includes(renderedNote.type)) {
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
      const scaledNoteHeight = 20 * combinedScale;
      const scaledX = appearedX + (notePixelWidth - scaledNotePixelWidth) / 2;
      const noteCenterX = appearedX + notePixelWidth / 2;
      const noteBodyInset = 2 * combinedScale;
      const noteBodyWidth = Math.max(1, scaledNotePixelWidth - noteBodyInset * 2);
      const noteBodyX = scaledX + noteBodyInset;
      const markAvailableWidth = Math.max(1, scaledNotePixelWidth - 12 * combinedScale);
      const shouldDrawTopIndicators = scaledNotePixelWidth > 0;
        
      const noteTypeInfo = NOTE_TYPES[renderedNote.type] || UNKNOWN_NOTE_TYPE;
      ctx.fillStyle = noteTypeInfo.color;
      ctx.fillRect(noteBodyX, appearedY - scaledNoteHeight / 2, noteBodyWidth, scaledNoteHeight);
        
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * combinedScale;
      ctx.strokeRect(noteBodyX, appearedY - scaledNoteHeight / 2, noteBodyWidth, scaledNoteHeight);

      if (shouldDrawTopIndicators && (renderedNote.type === 1 || renderedNote.type === 2)) {
        ctx.fillStyle = '#ffffff';
        drawInvertedTriangle(noteCenterX, appearedY, Math.min(markAvailableWidth, 12 * combinedScale));
      }

      if (shouldDrawTopIndicators && renderedNote.type === 9) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 * combinedScale;
        drawCircleMark(noteCenterX, appearedY, Math.min(markAvailableWidth / 2, 6 * combinedScale));
      }

      if (shouldDrawTopIndicators && HOLD_START_TYPES.includes(renderedNote.type)) {
        drawNoteLetter(noteCenterX, appearedY, 'S', combinedScale);
      }

      if (shouldDrawTopIndicators && HOLD_CENTER_TYPES.includes(renderedNote.type)) {
        drawNoteLetter(noteCenterX, appearedY, 'C', combinedScale);
      }

      if (shouldDrawTopIndicators && HOLD_END_TYPES.includes(renderedNote.type)) {
        drawNoteLetter(noteCenterX, appearedY, 'E', combinedScale);
      }

      if (shouldDrawTopIndicators && !(renderedNote.type in NOTE_TYPES)) {
        drawNoteLetter(noteCenterX, appearedY, '?', combinedScale);
      }

      if (shouldDrawTopIndicators && [13, 14, 15, 16].includes(renderedNote.type)) {
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

      // Highlight if selected
      if (selectedNoteIdSet.has(renderedNote.id)) {
        ctx.setLineDash([]);
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 4;
        ctx.strokeRect(scaledX, appearedY - scaledNoteHeight / 2 - 2, scaledNotePixelWidth, scaledNoteHeight + 4);
      } else if (noteRenderIndex.selectedParentNoteIds.has(renderedNote.id)) {
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 3;
        ctx.strokeRect(scaledX, appearedY - scaledNoteHeight / 2 - 2, scaledNotePixelWidth, scaledNoteHeight + 4);
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

        ctx.save();
        ctx.globalAlpha = fillAlpha;
        ctx.fillStyle = previewTypeInfo.color;
        ctx.fillRect(previewX + 2, previewY - 10, previewPixelWidth - 4, 20);

        if (curveNoteType === 1 || curveNoteType === 2) {
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

        if (HOLD_START_TYPES.includes(curveNoteType)) {
          drawNoteLetter(previewCenterX, previewY, 'S');
        }

        if (HOLD_CENTER_TYPES.includes(curveNoteType)) {
          drawNoteLetter(previewCenterX, previewY, 'C');
        }

        if (HOLD_END_TYPES.includes(curveNoteType)) {
          drawNoteLetter(previewCenterX, previewY, 'E');
        }

        if (!(curveNoteType in NOTE_TYPES)) {
          drawNoteLetter(previewCenterX, previewY, '?');
        }

        if ([13, 14, 15, 16].includes(curveNoteType)) {
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
        ctx.strokeRect(previewX + 2, previewY - 10, previewPixelWidth - 4, 20);
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

      ctx.save();
      ctx.globalAlpha = fillAlpha;
      ctx.fillStyle = previewTypeInfo.color;
      ctx.fillRect(previewX + 2, previewY - 10, previewBodyWidth, 20);
      if (shouldDrawTopIndicators && (previewType === 1 || previewType === 2)) {
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
      if (shouldDrawTopIndicators && HOLD_START_TYPES.includes(previewType)) {
        drawNoteLetter(previewCenterX, previewY, 'S');
      }
      if (shouldDrawTopIndicators && HOLD_CENTER_TYPES.includes(previewType)) {
        drawNoteLetter(previewCenterX, previewY, 'C');
      }
      if (shouldDrawTopIndicators && HOLD_END_TYPES.includes(previewType)) {
        drawNoteLetter(previewCenterX, previewY, 'E');
      }
      if (shouldDrawTopIndicators && !(previewType in NOTE_TYPES)) {
        drawNoteLetter(previewCenterX, previewY, '?');
      }
      if (shouldDrawTopIndicators && [13, 14, 15, 16].includes(previewType)) {
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
      ctx.strokeRect(previewX + 2, previewY - 10, previewBodyWidth, 20);
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
          if (!HOLD_CONNECTOR_TYPES.includes(note.type) || HOLD_START_TYPES.includes(note.type) || note.parentId === null) {
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
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(isPreview3DMode ? getPreviewLaneLeftX(hitLineY) : (isPreviewPlaybackCanvas ? chartStartX : startX), hitLineY);
    ctx.lineTo(isPreview3DMode ? getPreviewLaneRightX(hitLineY) : (isPreviewPlaybackCanvas ? chartStartX : startX) + gridWidth, hitLineY);
    ctx.stroke();
    
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
    countRenderedObject();
    ctx.restore();

    if (isPreviewMode) {
      const previewCanvasCombo = isPreviewPrecomputeEnabled
        ? (
            previewComboTimesRef.current.length > 0
              ? getPreviewComboAtTime(previewComboTimesRef.current, time)
              : notes.reduce((combo, note) => (note.time <= time ? combo + 1 : combo), 0)
          )
        : notes.reduce((combo, note) => (note.time <= time ? combo + 1 : combo), 0);

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

    renderedObjectsRef.current = objectCount;

  }, [activeLeftPanel, areTimingChangeIndicatorsAdjusted, copiedNotesPreviewVersion, curveDensityInput, curveEasingFamily, curveEasingType, curveEndIdInput, curveIdSelectTarget, curveNoteType, curveStartIdInput, effectiveGridZoom, getTimeFromTimepos, getTimeposFromTime, hasPinkHoldCameraNotes, pixelsPerBeat, projectData, isOfficialChartFormat, isPreviewMode, isPreviewCameraMovementEnabled, isPreviewCameraTiltEnabled, isPreviewNoteAppearModeEnabled, isPreviewPrecomputeEnabled, isXPositionGridEnabled, hoverPreview, isCtrlHeld, isShiftHeld, noteWidth, notes, preview3DTiltDegrees, preview3DZoomHeightCurve, previewCurveNoteRenderEntries, previewDisplayMode, previewDistanceIndexedNoteRenderEntries, previewHoldConnectorDrawSegments, previewMinimumNoteSpeedMagnitude, previewNoteRenderEntries, previewPlaybackSpeedDistanceIndex, selectedNoteIdSet, selectedNoteType, selectionBox, speedDistanceIndex, timedBpmChanges, noteRenderIndex, offset]);

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
        requestRef.current = requestAnimationFrame(update);
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
      requestRef.current = requestAnimationFrame(update);
    } else if (isPausedTimelineRendering && performance.now() < pausedTimelineRenderUntilRef.current) {
      requestRef.current = requestAnimationFrame(update);
    } else {
      requestRef.current = undefined;
    }
  }, [drawGrid, offset, scheduleHitSoundsThrough, isPausedTimelineRendering, isPreviewMode, previewJudgementNoteEntries, resetPreviewJudgementState, statisticsRefreshIntervalMs, timelineDuration, loopPlaybackToBeginning, updateRenderedObjectsDisplay]);

  useEffect(() => {
    if (!shouldAnimateCanvas) {
      fpsFrameCountRef.current = 0;
      fpsWindowStartRef.current = performance.now();
      setFps(0);
      updateRenderedObjectsDisplay();
      drawGrid();
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = undefined;
      }
      return;
    }

    if (!requestRef.current) {
      fpsFrameCountRef.current = 0;
      fpsWindowStartRef.current = performance.now();
      requestRef.current = requestAnimationFrame(update);
    }

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = undefined;
      }
    };
  }, [drawGrid, shouldAnimateCanvas, update, updateRenderedObjectsDisplay]);

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
      audioRef.current.currentTime = Math.max(0, clampedTime - offsetInSeconds);
    }
    if (timeDisplayRef.current) {
      timeDisplayRef.current.textContent = formatTime(clampedTime, sortedChanges, effectiveGridZoom);
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
    if (!projectData || isExportDisabled) return;

    setDr3FpPreviewStatus(DR3FP_PREVIEW_STATUS.exporting);
    setDr3FpPreviewLogs([
      createDr3FpPreviewLogEntry('Started DR3FP preview.'),
      createDr3FpPreviewLogEntry(DR3FP_PREVIEW_STATUS.exporting.message),
    ]);
    setIsDr3FpPreviewInfoOpen(true);

    try {
      let zipBuffer: ArrayBuffer;
      try {
        ({ zipBuffer } = await createExportZipInWorker({
          format: 'dr3-fp-preview',
          projectData,
          notes,
          bpmChanges,
          speedChanges,
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

  const exportDr3Viewer = async () => {
    if (!projectData || isExportDisabled) return;

    const songId = projectData.songId || 'level';
    const difficulty = projectData.difficulty || '0';
    const fileHandle = await getExportFileHandle(`${songId}.${difficulty}.zip`, 'DR3Viewer');
    if (fileHandle === undefined) return;

    try {
      const { zipBuffer, suggestedName } = await createExportZipInWorker({
        format: 'dr3-viewer',
        projectData,
        notes,
        bpmChanges,
        speedChanges,
        offset,
      });
      await saveZipData(zipBuffer, suggestedName, fileHandle, 'DR3Viewer');
    } catch (err) {
      console.error('DR3Viewer export failed', err);
    }
  };

  const exportDr3Fp = async () => {
    if (!projectData || isExportDisabled) return;

    const songId = projectData.songId || 'level';
    const fileHandle = await getExportFileHandle(`${songId}.zip`, 'DR3FP');
    if (fileHandle === undefined) return;

    try {
      const { zipBuffer, suggestedName } = await createExportZipInWorker({
        format: 'dr3-fp',
        projectData,
        notes,
        bpmChanges,
        speedChanges,
        offset,
      });
      await saveZipData(zipBuffer, suggestedName, fileHandle, 'DR3FP');
    } catch (err) {
      console.error('DR3FP export failed', err);
    }
  };

  const handleOrganizeNotes = () => {
    if (isOrganizingNotes || stateRef.current.notes.length === 0) {
      return;
    }

    setIsOrganizingNotes(true);

    window.requestAnimationFrame(() => {
      try {
        const pendingUpdate = pendingDragUpdateRef.current;
        const sourceNotes = stateRef.current.notes.map(note => (
          pendingUpdate && note.id === pendingUpdate.noteId
            ? { ...note, time: pendingUpdate.time, lane: pendingUpdate.lane }
            : note
        ));

        if (sourceNotes.length === 0) {
          return;
        }

        if (dragUpdateFrameRef.current) {
          cancelAnimationFrame(dragUpdateFrameRef.current);
          dragUpdateFrameRef.current = undefined;
        }

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
        const changedCount = organizedNotes.reduce((count, note, index) => {
          const previousNote = sourceNotes[index];
          return count + (note.id !== previousNote.id || note.parentId !== previousNote.parentId ? 1 : 0);
        }, 0);

        setNotes(organizedNotes);
        setSelectedNoteIds(prev => prev
          .map(id => nextIdByOriginalId.get(id))
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
            const nextParentId = nextIdByOriginalId.get(currentParentId);
            setCurrentParentInput(nextParentId === undefined ? '' : nextParentId.toString());
          }
        }

        recordOperation({
          category: 'note',
          title: 'Organized notes',
          detail: changedCount === 0
            ? `${sourceNotes.length} notes were already in time/xpos order`
            : `Reassigned ${sourceNotes.length} note IDs by timepos, xpos, then original ID`,
        });
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
    speedChanges,
    timedBpmChanges,
  }), [getTimeFromTimepos, getTimeposFromTime, isPreviewMode, isPreviewPrecomputeEnabled, liveStatsTime, notes, shouldShowChartStatistics, speedChanges, timedBpmChanges]);
  const {
    currentEditorBpm,
    currentEditorSpeed,
    currentEditorDistance,
    currentEditorCombo,
    currentEditorScore,
  } = chartStatistics;
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
  const chartProjectFiles = useMemo(() => {
    if (!shouldBuildChartProjectFiles) {
      return [];
    }

    return buildChartProjectFiles({
      projectData,
      notes,
      bpmChanges,
      speedChanges,
      offset,
      chartFileName,
    });
  }, [bpmChanges, chartFileName, notes, offset, projectData, shouldBuildChartProjectFiles, speedChanges]);

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
      audioRef.current.currentTime = Math.max(0, clampedTime - offsetInSeconds);
    }

    if (timeDisplayRef.current) {
      timeDisplayRef.current.textContent = formatTime(clampedTime, timedBpmChanges, effectiveGridZoom);
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
    notes,
    bpmChanges,
    speedChanges,
    currentEditorBpm,
    currentEditorSpeed,
    currentEditorDistance,
    currentEditorCombo,
    currentEditorScore,
  };

  return (
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
      projectData={projectData}
      audioRef={audioRef}
      setDuration={setDuration}
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
      isPreviewPrecomputeEnabled={isPreviewPrecomputeEnabled}
      isSelectionTypeMenuOpen={isSelectionTypeMenuOpen}
      isStatisticsRefreshRateMenuOpen={isStatisticsRefreshRateMenuOpen}
      selectionType={selectionType}
      statisticsRefreshRate={statisticsRefreshRate}
      musicVolume={musicVolume}
      tapSoundVolume={tapSoundVolume}
      flickSoundVolume={flickSoundVolume}
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
      setIsPreviewPrecomputeEnabled={setIsPreviewPrecomputeEnabled}
      setIsSelectionTypeMenuOpen={setIsSelectionTypeMenuOpen}
      setIsStatisticsRefreshRateMenuOpen={setIsStatisticsRefreshRateMenuOpen}
      setSelectionType={setSelectionType}
      setStatisticsRefreshRate={setStatisticsRefreshRate}
      setMusicVolume={setMusicVolume}
      setTapSoundVolume={setTapSoundVolume}
      setFlickSoundVolume={setFlickSoundVolume}
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
      effectiveGridZoom={effectiveGridZoom}
      pixelsPerBeat={pixelsPerBeat}
      playbackSpeed={playbackSpeed}
      bpmChanges={bpmChanges}
      progressBarRef={progressBarRef}
      timeDisplayRef={timeDisplayRef}
      isDraggingProgress={isDraggingProgress}
      isProgressBarInteractive={isProgressBarInteractive}
      openExitWarning={openExitWarning}
      togglePlay={togglePlay}
      handleSeekChange={handleSeekChange}
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
  );
}
