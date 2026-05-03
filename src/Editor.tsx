import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Box, Square, X, ChevronLeft, ChevronRight, Copy, Trash2, FlipHorizontal, FileText, Image, Info, Music } from 'lucide-react';
import { convertBpmChangesToTime, getActiveChange, getBeatAtTime, getBpmChangeTimepos, getTimeAtBeat, formatTime } from './utils/editorUtils';
import EditorModal from './components/EditorModal';
import EditorCanvas from './components/EditorCanvas';
import EditorOverlays from './components/EditorOverlays';
import EditorTopBar from './components/EditorTopBar';
import CommitInput from './components/CommitInput';
import VirtualizedChangeList from './components/VirtualizedChangeList';
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
  MAX_PREVIEW_3D_TILT_DEGREES,
  MIN_PIXELS_PER_BEAT,
  MIN_PREVIEW_3D_TILT_DEGREES,
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
} from './editor/editorLocalTypes';
import { getTierBadge } from './editor/editorMetadata';
import { getBeatAtTimepos, getBeatsPerMeasureAtBeat, getCurveSnapBeatsBetween, getIndicatorKeyAtBeat, snapBeatToMeasureDivision } from './editor/editorTiming';
import {
  buildPreviewCameraTiltIntervals,
  buildPreviewComboTimes,
  buildSpeedDistanceIndex,
  comparePreviewNoteRenderEntries,
  findFirstPreviewJudgementNoteIndex,
  getPreviewCameraTiltDegrees,
  getPreviewCameraXPositionOffset,
  getPreviewComboAtTime,
  getPreviewConnectorSegmentsInDistanceRange,
  getPreviewNoteEntriesInDistanceRange,
  getPreviewNoteVisualDistance,
  getPreviewAppearModePosition,
  getSpeedDistanceAtTimepos,
  parsePreviewNoteSpeed,
} from './editor/previewPlayback';

const HIT_SOUND_URL = new URL('../hit.ogg', import.meta.url).href;
const FLICK_SOUND_URL = new URL('../flick.ogg', import.meta.url).href;
const SOUND_URLS: Record<string, string> = {
  'hit.ogg': HIT_SOUND_URL,
  'flick.ogg': FLICK_SOUND_URL,
};
const getHitSoundVolume = (soundUrl: string, tapSoundVolume: number, flickSoundVolume: number) => (
  soundUrl === FLICK_SOUND_URL ? flickSoundVolume : tapSoundVolume
);
const PREVIEW_3D_MAX_GRID_WIDTH_RATIO = 0.84;
const PREVIEW_3D_HORIZON_VIEWPORT_MULTIPLIER = 0.6;
const PREVIEW_3D_NEAR_SPEED_MULTIPLIER = 2.05;
const PREVIEW_3D_FAR_DISTANCE_MULTIPLIER = 2.2;
const PREVIEW_3D_CONNECTOR_CLIP_PADDING = 80;
const PREVIEW_3D_CONNECTOR_MAX_SEGMENT_HEIGHT = 18;
const PREVIEW_3D_CAMERA_BASE_Z = -7;
const PREVIEW_3D_CAMERA_Z_PER_HEIGHT = -14;
const PREVIEW_3D_CAMERA_Y_OFFSET_PER_HEIGHT = -120;
const PREVIEW_3D_CAMERA_EASE_PER_SECOND = 20;
const DR3FP_PREVIEW_RECEIVER_ORIGIN = 'http://127.0.0.1:27373';
const DR3FP_PREVIEW_RECEIVER_TIMEOUT_MS = 30_000;
const DR3FP_PREVIEW_RECEIVER_POLL_MS = 250;

const getMirroredNoteLane = (note: Pick<Note, 'lane' | 'width'>) => (
  X_POSITION_COUNT - note.lane - note.width
);

const getFileExtension = (file: File) => {
  const extension = file.name.split('.').pop();
  return extension && extension !== file.name ? extension : 'bin';
};

const formatFileSize = (file: File | null) => {
  if (!file) return '';

  return formatByteSize(file.size);
};

const formatByteSize = (size: number) => {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${size} B`;
};

interface MusicAudioGraph {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

const musicAudioGraphs = new WeakMap<HTMLAudioElement, MusicAudioGraph>();

export default function Editor({ 
  onBack, 
  mode,
  initialProjectData = null,
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
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isPlaybackSpeedMenuOpen, setIsPlaybackSpeedMenuOpen] = useState(false);
  const [isPreviewMenuOpen, setIsPreviewMenuOpen] = useState(false);
  const [isStatisticsRefreshRateMenuOpen, setIsStatisticsRefreshRateMenuOpen] = useState(false);
  const [isSelectionTypeMenuOpen, setIsSelectionTypeMenuOpen] = useState(false);
  const [isExitWarningOpen, setIsExitWarningOpen] = useState(false);
  const [isExitWarningEnabled, setIsExitWarningEnabled] = useState(initialEditorSettings.isExitWarningEnabled);
  const [isScrollDirectionInverted, setIsScrollDirectionInverted] = useState(initialEditorSettings.isScrollDirectionInverted);
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
  const [gridZoom, setGridZoom] = useState(initialEditorSettings.gridZoom);
  const [isXPositionGridEnabled, setIsXPositionGridEnabled] = useState(initialEditorSettings.isXPositionGridEnabled);
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
      isScrollDirectionInverted,
      selectionType,
      statisticsRefreshRate,
      musicVolume,
      tapSoundVolume,
      flickSoundVolume,
      gridZoom,
      isXPositionGridEnabled,
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
    isScrollDirectionInverted,
    selectionType,
    statisticsRefreshRate,
    musicVolume,
    tapSoundVolume,
    flickSoundVolume,
    gridZoom,
    isXPositionGridEnabled,
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
  const previewCameraTiltSegmentsRef = useRef<PreviewCameraTiltSegment[]>([]);
  const previewCameraTiltIntervalsRef = useRef<PreviewCameraTiltInterval[]>([]);
  const previewJudgementCursorTimeRef = useRef(0);
  const previewTiltAngleRef = useRef(0);
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
    }
  }, [mode]);

  useEffect(() => {
    const maxNoteId = notes.reduce((maxId, note) => Math.max(maxId, note.id), 0);
    nextNoteIdRef.current = maxNoteId + 1;
  }, [notes]);

  const timedBpmChanges = useMemo(() => convertBpmChangesToTime(bpmChanges), [bpmChanges]);
  const isOfficialChartFormat = (projectData?.chartFormat ?? 'Official') === 'Official';
  const hasExportIncompatibleTimeSignature = useMemo(
    () => !isOfficialChartFormat && bpmChanges.some(change => change.timeSignature.trim() !== '4/4'),
    [bpmChanges, isOfficialChartFormat],
  );
  const hasRequiredExportMetadata = Boolean(
    projectData?.songId.trim() &&
    projectData?.difficulty.trim() &&
    projectData?.songFile,
  );
  const isExportDisabled = hasExportIncompatibleTimeSignature || !hasRequiredExportMetadata;
  const selectedNoteIdSet = useMemo(() => new Set(selectedNoteIds), [selectedNoteIds]);

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
        previewComboTimesRef.current = buildPreviewComboTimes(stateRef.current.notes);
        previewCameraTiltIntervalsRef.current = buildPreviewCameraTiltIntervals(previewCameraTiltSegmentsRef.current);
        previewTiltAngleRef.current = 0;
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
        previewComboTimesRef.current = [];
        previewCameraTiltIntervalsRef.current = [];
        previewTiltAngleRef.current = 0;
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
      Math.ceil(Math.max(duration, ...notes.map(note => note.time), 0)) + 3,
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
  }, [duration, notes]);
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

  const handleConfirm = () => {
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

    recordOperation({
      category: 'metadata',
      title: wasProjectCreated ? 'Created project metadata' : 'Updated chart metadata',
      detail: `${formData.songName || 'Untitled Project'} | BPM ${formatHistoryNumber(nextBpm)} | Difficulty ${formData.difficulty || 'None'}`,
    });
  };

  const handleEditInfo = () => {
    setFormData({
      songId: projectData?.songId || '',
      songName: projectData?.songName || '',
      songArtist: projectData?.songArtist || '',
      songBpm: projectData?.bpm?.toString() || '',
      difficulty: projectData?.difficulty || '1',
      songFile: projectData?.songFile || null,
      songIllustration: projectData?.songIllustration || null,
    });
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
    const targetTime = parseFloat(e.target.value);

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
    
    const offsetInSeconds = parseFloat(offset.toString()) / 1000;
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, newTime - offsetInSeconds);
    }
    if (timeDisplayRef.current && projectData) {
      timeDisplayRef.current.textContent = formatTime(newTime, sortedChanges, effectiveGridZoom);
    }
    renderPausedTimelineAtFullFps();
  }, [projectData, offset, effectiveGridZoom, isPreviewMode, renderPausedTimelineAtFullFps, resetPreviewJudgementState, timedBpmChanges]);

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
      if (Math.abs(audioTime - projectedTime) <= AUDIO_CLOCK_SYNC_TOLERANCE_SECONDS) {
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
    if (progressBarRef.current && !isDraggingProgress.current) {
      progressBarRef.current.value = loopStartTime.toString();
    }

    applyAudioPlaybackSpeed(audio, activePlaybackSpeed);

    if (offsetInSeconds > 0) {
      audio.pause();
      audio.currentTime = 0;
      playTimeoutRef.current = window.setTimeout(() => {
        playTimeoutRef.current = undefined;
        if (playRequestIdRef.current === playRequestId && stateRef.current.isPlaying && audioRef.current) {
          applyAudioPlaybackSpeed(audioRef.current, stateRef.current.playbackSpeed);
          audioRef.current.play().catch(() => {});
        }
      }, (offsetInSeconds / activePlaybackSpeed) * 1000);
      isLoopingPlaybackRef.current = false;
      return;
    }

    await seekAudioToTime(audio, -offsetInSeconds);
    if (playRequestIdRef.current === playRequestId && stateRef.current.isPlaying) {
      await audio.play().catch(() => {});
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
      if (progressBarRef.current && !isDraggingProgress.current) {
        progressBarRef.current.value = snappedTime.toString();
      }
    } else {
      const playRequestId = playRequestIdRef.current + 1;
      playRequestIdRef.current = playRequestId;
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
        audioRef.current.currentTime = Math.max(0, audioStartTime);
        const audioDelaySeconds = Math.max(0, -audioStartTime) / stateRef.current.playbackSpeed;
        playTimeoutRef.current = window.setTimeout(() => {
          playTimeoutRef.current = undefined;
          if (playRequestIdRef.current === playRequestId && audioRef.current) {
            applyAudioPlaybackSpeed(audioRef.current, stateRef.current.playbackSpeed);
            audioRef.current.play().catch(() => {});
          }
        }, audioDelaySeconds * 1000);
      } else {
        // Advance music: Start music early
        await seekAudioToTime(audioRef.current, playbackStartTime - offsetInSeconds);
        if (playRequestIdRef.current !== playRequestId) {
          return;
        }
        await audioRef.current.play().catch(() => {});
      }
      if (playRequestIdRef.current !== playRequestId) {
        return;
      }
      stateRef.current.playbackStartTime = playbackStartTime;
      stateRef.current.playbackStartPerformanceTime = performance.now();
      stateRef.current.playbackAudioClockReadyTime = stateRef.current.playbackStartPerformanceTime + AUDIO_CLOCK_HANDOFF_DELAY_MS;
      stateRef.current.currentTime = playbackStartTime;
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
    if (progressBarRef.current && !isDraggingProgress.current) {
      progressBarRef.current.value = time.toString();
    }

    const currentBeat = getBeatAtTime(time, sortedChanges);
    const hitLineY = height - 150;
    const isPreviewPlaybackCanvas = isPreviewMode;
    const isPreview3DMode = isPreviewPlaybackCanvas && previewDisplayMode === '3d';
    const shouldClipPreviewHoldConnectors = !isPreviewPlaybackCanvas || stateRef.current.isPlaying;
    const currentPreviewTimepos = isPreviewPlaybackCanvas ? getTimeposFromTime(time) : 0;
    const currentPreviewDistance = isPreviewPlaybackCanvas
      ? getSpeedDistanceAtTimepos(time, previewPlaybackSpeedDistanceIndex)
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
      hitLineY - (getSpeedDistanceAtTimepos(getTimeFromTimepos(timepos), previewPlaybackSpeedDistanceIndex) - currentPreviewDistance) * previewDistanceScale
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
          previewHoldConnectorSegments,
          previewVisibleMinDistance,
          previewVisibleMaxDistance,
        )
      : noteRenderIndex.holdConnectorSegments;
    const targetPreviewTiltDegrees = isPreviewPlaybackCanvas && isPreviewCameraTiltEnabled
      ? getPreviewCameraTiltDegrees(previewCameraTiltIntervalsRef.current, currentPreviewTimepos)
      : 0;
    const tiltNow = performance.now();
    const previousTiltTimestamp = previewTiltTimestampRef.current || tiltNow;
    const tiltElapsedMs = Math.max(0, tiltNow - previousTiltTimestamp);
    const previewTiltEase = isPreviewPlaybackCanvas
      ? 1 - Math.exp(-tiltElapsedMs / PREVIEW_CONNECTOR_TILT_EASING_MS)
      : 1;
    previewTiltAngleRef.current += (targetPreviewTiltDegrees - previewTiltAngleRef.current) * previewTiltEase;
    if (!isPreviewPlaybackCanvas || Math.abs(previewTiltAngleRef.current) < SNAP_EPSILON) {
      previewTiltAngleRef.current = isPreviewPlaybackCanvas ? 0 : targetPreviewTiltDegrees;
    }
    previewTiltTimestampRef.current = tiltNow;
    const previewTiltDegrees = previewTiltAngleRef.current;
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
    if (isPreviewPlaybackCanvas && Math.abs(previewTiltDegrees) > SNAP_EPSILON) {
      const editorCanvasCenterX = chartStartX + gridWidth / 2;
      ctx.translate(editorCanvasCenterX, height / 2);
      ctx.rotate((previewTiltDegrees * Math.PI) / 180);
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

        // Only draw indicators that are not at time 0 (as they are implied)
        if (change.time > 0 && y > 0 && y < height) {
          const indicatorKey = getIndicatorKeyAtBeat(changeBeat);
          getIndicatorGroup(indicatorKey, y).bpmLabels.push(`BPM: ${change.bpm} | ${change.timeSignature}`);
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
          top: Math.min(Math.max(centeredTop, minTop), maxTop),
        };
      }).filter(stack => stack.labels.length > 0)
        .sort((a, b) => a.top - b.top);

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

    // Draw hold connections before note bodies so linked notes render on top.
    for (const segment of visibleHoldConnectorSegments) {
      if (hiddenPreviewNoteIds?.has(segment.note.id)) {
        continue;
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
          continue;
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
          continue;
        }
      } else {
        const minSegmentBeat = Math.min(noteBeat, parentBeat);
        const maxSegmentBeat = Math.max(noteBeat, parentBeat);
        const editorSegment = segment as typeof noteRenderIndex.holdConnectorSegments[number];

        if (!pendingDragUpdate && editorSegment.minBeat > visibleEndBeat) {
          break;
        }

        if (maxSegmentBeat < visibleStartBeat || minSegmentBeat > visibleEndBeat) {
          continue;
        }
      }

      const clippedConnector = getClippedPreviewConnector(parentNote, parentY, note, noteY);
      if (!clippedConnector) {
        continue;
      }

      const isPreviewConnectorBeingJudged = isPreviewPlaybackCanvas
        && currentPreviewTimepos >= Math.min(previewSegment.parentTimepos, previewSegment.noteTimepos) - SNAP_EPSILON
        && currentPreviewTimepos < Math.max(previewSegment.parentTimepos, previewSegment.noteTimepos) - SNAP_EPSILON;
      const shouldClipPreviewConnectorAtJudgementLine = shouldClipPreviewHoldConnectors
        && isPreviewConnectorBeingJudged
        && Math.max(noteY, parentY) > hitLineY;
      if (shouldClipPreviewHoldConnectors && isPreviewConnectorBeingJudged && Math.min(noteY, parentY) >= hitLineY) {
        continue;
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
      const previewCanvasCombo = getPreviewComboAtTime(previewComboTimesRef.current, time);

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

  }, [activeLeftPanel, copiedNotesPreviewVersion, curveDensityInput, curveEasingFamily, curveEasingType, curveEndIdInput, curveIdSelectTarget, curveNoteType, curveStartIdInput, effectiveGridZoom, getTimeFromTimepos, getTimeposFromTime, hasPinkHoldCameraNotes, pixelsPerBeat, projectData, isPreviewMode, isPreviewCameraMovementEnabled, isPreviewCameraTiltEnabled, isPreviewNoteAppearModeEnabled, isXPositionGridEnabled, hoverPreview, isCtrlHeld, isShiftHeld, noteWidth, preview3DTiltDegrees, preview3DZoomHeightCurve, previewCurveNoteRenderEntries, previewDisplayMode, previewDistanceIndexedNoteRenderEntries, previewHoldConnectorSegments, previewMinimumNoteSpeedMagnitude, previewNoteRenderEntries, previewPlaybackSpeedDistanceIndex, selectedNoteIdSet, selectedNoteType, selectionBox, speedDistanceIndex, timedBpmChanges, noteRenderIndex, offset]);

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

  const update = useCallback(() => {
    if (stateRef.current.isPlaying && audioRef.current) {
      const offsetInSeconds = parseFloat(offset.toString()) / 1000;
      const activePlaybackSpeed = stateRef.current.playbackSpeed;
      const currentTime = getPlaybackTimeFromClock(audioRef.current, offsetInSeconds);
      const now = performance.now();

      if (duration > 0 && currentTime >= duration) {
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
  }, [drawGrid, offset, scheduleHitSoundsThrough, isPausedTimelineRendering, isPreviewMode, previewJudgementNoteEntries, resetPreviewJudgementState, statisticsRefreshIntervalMs, duration, loopPlaybackToBeginning, updateRenderedObjectsDisplay]);

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
  ) => {
    const xPositionWidth = laneWidth / 2;
    const rawLane = (canvasX - gridStartX) / xPositionWidth;
    const xPositionCount = laneCount * 2;

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

    if (clickX >= startX && clickX < startX + gridWidth) {
      pasteTargetRef.current = {
        lane: getLaneFromCanvasX(clickX, startX, laneWidth, lanes),
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

      if (clickX >= startX && clickX < startX + gridWidth) {
        const lane = getLaneFromCanvasX(clickX, startX, laneWidth, lanes);
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
    const hitLineY = height - 150;
    const sortedChanges = timedBpmChanges;
    const currentBeat = getBeatAtTime(stateRef.current.currentTime, sortedChanges);

    if (clickX >= startX && clickX < startX + gridWidth) {
      const lane = getLaneFromCanvasX(clickX, startX, laneWidth, lanes);
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
    } else if (clickX >= startX && clickX < startX + gridWidth) {
      const lane = getLaneFromCanvasX(clickX, startX, laneWidth, lanes);

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
    const newTime = isPreviewMode
      ? getTimeAtBeat(targetBeat, sortedChanges)
      : getTimeAtBeat(snapBeatToMeasureDivision(targetBeat, gridZoom, sortedChanges), sortedChanges);
    
    let clampedTime = Math.max(0, newTime);
    if (audioRef.current && audioRef.current.duration && clampedTime > audioRef.current.duration) {
      clampedTime = audioRef.current.duration;
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
    if (progressBarRef.current && !isDraggingProgress.current) {
      progressBarRef.current.value = clampedTime.toString();
    }
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

    while (Date.now() < deadline) {
      try {
        const response = await fetch(url, { method: 'GET' });
        if (response.ok) {
          const body = await response.json();
          if (body?.ready === true && body?.version === 1) {
            return;
          }
        }
      } catch {
        // DR3FanmadeViewer may still be starting.
      }

      await new Promise(resolve => window.setTimeout(resolve, DR3FP_PREVIEW_RECEIVER_POLL_MS));
    }

    throw new Error('DR3FanmadeViewer preview receiver did not become ready. If your browser reports ERR_BLOCKED_BY_CLIENT, allow requests to 127.0.0.1:27373 or disable ad blocking/privacy extensions for this editor page.');
  };

  const uploadDr3FpPreviewBundle = async (sessionId: string, zipBlob: Blob) => {
    const response = await fetch(`${DR3FP_PREVIEW_RECEIVER_ORIGIN}/preview/${encodeURIComponent(sessionId)}/bundle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/zip',
      },
      body: zipBlob,
    });

    if (!response.ok) {
      throw new Error(`Preview upload failed: HTTP ${response.status}`);
    }

    const body = await response.json().catch(() => null);
    if (body?.accepted !== true) {
      throw new Error('Preview upload was not accepted by DR3FanmadeViewer.');
    }
  };

  const previewDr3Fp = async () => {
    if (!projectData || isExportDisabled) return;

    setIsDr3FpPreviewInfoOpen(true);

    try {
      const { zipBuffer } = await createExportZipInWorker({
        format: 'dr3-fp-preview',
        projectData,
        notes,
        bpmChanges,
        speedChanges,
        offset,
      });
      const zipBlob = createZipBlobForSave(zipBuffer);
      const sessionId = crypto.randomUUID();

      window.location.href = `dr3fp://preview?session=${encodeURIComponent(sessionId)}&version=1`;

      await waitForDr3FpPreviewReceiver(sessionId);
      await uploadDr3FpPreviewBundle(sessionId, zipBlob);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Preview failed.';
      console.error('DR3FP preview failed', err);
      window.alert(message);
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
  const chartStatistics = useMemo(() => {
    if (!shouldShowChartStatistics) {
      return {
        currentEditorBpm: 0,
        currentEditorSpeed: 1,
        currentEditorDistance: 0,
        currentEditorCombo: 0,
        currentEditorScore: 0,
      };
    }

    const currentEditorTimepos = getTimeposFromTime(liveStatsTime);
    const currentEditorBpm = getActiveChange(liveStatsTime, timedBpmChanges).bpm;
    const sortedSpeedChanges = [...speedChanges].sort((a, b) => a.timepos - b.timepos);
    const currentEditorSpeed = sortedSpeedChanges.reduce((activeSpeed, change) => (
        change.timepos <= currentEditorTimepos
          ? change.speedChange
          : activeSpeed
      ), 1);
    const currentEditorDistanceState = sortedSpeedChanges.reduce((distanceState, change) => {
      const changeTimepos = change.timepos;

      if (changeTimepos > currentEditorTimepos) {
        return distanceState;
      }

      const clampedChangeTimepos = Math.max(distanceState.timepos, changeTimepos);
      return {
        distance: distanceState.distance + distanceState.speed * (clampedChangeTimepos - distanceState.timepos),
        speed: change.speedChange,
        timepos: clampedChangeTimepos,
      };
    }, { distance: 0, speed: 1, timepos: 0 });
    const currentEditorDistance = currentEditorDistanceState.distance +
      currentEditorDistanceState.speed * Math.max(0, currentEditorTimepos - currentEditorDistanceState.timepos);
    const currentEditorCombo = notes.reduce((combo, note) => (
      note.time <= liveStatsTime ? combo + 1 : combo
    ), 0);
    const currentEditorScore = notes.length > 0
      ? Math.floor((3000000 / notes.length) * currentEditorCombo)
      : 0;

    return {
      currentEditorBpm,
      currentEditorSpeed,
      currentEditorDistance,
      currentEditorCombo,
      currentEditorScore,
    };
  }, [getTimeposFromTime, liveStatsTime, notes, shouldShowChartStatistics, speedChanges, timedBpmChanges]);
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
    ? 'Provide the music file in Chart Metadata to start editing this imported chart.'
    : 'Fill in project details in Chart Metadata to start editing.';
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
  const chartProjectFiles = useMemo(() => {
    if (!projectData) return [];

    const songId = projectData.songId || 'level';
    const difficulty = projectData.difficulty || '0';
    const chartText = buildLevelText({
      projectData,
      notes,
      bpmChanges,
      speedChanges,
      offset,
    });
    const firstBpm = [...bpmChanges]
      .sort((a, b) => getBpmChangeTimepos(a) - getBpmChangeTimepos(b))[0]?.bpm ?? projectData.bpm ?? 120;
    const infoText = `${projectData.songName || ''}\n${projectData.songArtist || ''}\n${firstBpm}\n`;
    const textEncoder = new TextEncoder();
    const files = [
      {
        label: 'Chart File',
        name: `${songId}.${difficulty}.txt`,
        detail: formatByteSize(textEncoder.encode(chartText).byteLength),
        Icon: FileText,
      },
      {
        label: 'Info File',
        name: 'info.txt',
        detail: formatByteSize(textEncoder.encode(infoText).byteLength),
        Icon: Info,
      },
    ];

    if (projectData.songFile) {
      files.push({
        label: 'Audio',
        name: projectData.songFile.name || `${songId}.${getFileExtension(projectData.songFile)}`,
        detail: formatFileSize(projectData.songFile),
        Icon: Music,
      });
    }

    if (projectData.songIllustration) {
      files.push({
        label: 'Illustration',
        name: projectData.songIllustration.name || `${songId}.${getFileExtension(projectData.songIllustration)}`,
        detail: formatFileSize(projectData.songIllustration),
        Icon: Image,
      });
    }

    return files;
  }, [bpmChanges, notes, offset, projectData, speedChanges]);

  const jumpToNoteTime = (time: number) => {
    if (stateRef.current.isPlaying) {
      togglePlay();
    }

    let clampedTime = Math.max(0, time);
    if (audioRef.current && audioRef.current.duration && clampedTime > audioRef.current.duration) {
      clampedTime = audioRef.current.duration;
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
    if (progressBarRef.current && !isDraggingProgress.current) {
      progressBarRef.current.value = clampedTime.toString();
    }
    renderPausedTimelineAtFullFps();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="h-screen overflow-hidden bg-neutral-950 text-neutral-50 flex flex-col font-sans"
    >
      {projectData?.audioUrl && (
        <audio 
          ref={audioRef} 
          src={projectData.audioUrl} 
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration);
            applyAudioPlaybackSpeed(e.currentTarget, stateRef.current.playbackSpeed);
          }}
        />
      )}

      {/* Modal */}
      <EditorModal 
        isOpen={isModalOpen} 
        onClose={() => {
          if (mode === 'new') {
            onBack();
            return;
          }
          setIsModalOpen(false);
        }}
        onConfirm={() => {
          if (!formData.songId.trim() || !formData.difficulty.trim() || !formData.songFile || !formData.songBpm) {
            alert('Please fill in all required fields: Song ID, Difficulty, Audio File, and Song BPM.');
            return;
          }
          handleConfirm();
        }}
        formData={formData}
        setFormData={setFormData}
      />

      <EditorOverlays
        isExitWarningOpen={isExitWarningOpen}
        isSettingsOpen={isSettingsOpen}
        isHelpOpen={isHelpOpen}
        isDr3FpPreviewInfoOpen={isDr3FpPreviewInfoOpen}
        isExitWarningEnabled={isExitWarningEnabled}
        isScrollDirectionInverted={isScrollDirectionInverted}
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
        setIsScrollDirectionInverted={setIsScrollDirectionInverted}
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
        onBack={onBack}
      />

      {/* Top Navigation Bar */}
      <EditorTopBar
        projectData={projectData}
        tierBadge={tierBadge}
        isXPositionGridEnabled={isXPositionGridEnabled}
        isPlaying={isPlaying}
        isPlaybackSpeedMenuOpen={isPlaybackSpeedMenuOpen}
        isHelpOpen={isHelpOpen}
        isSettingsOpen={isSettingsOpen}
        isPreviewMode={isPreviewMode}
        isExportMenuOpen={isExportMenuOpen}
        isPreviewMenuOpen={isPreviewMenuOpen}
        isExportDisabled={isExportDisabled}
        hasExportIncompatibleTimeSignature={hasExportIncompatibleTimeSignature}
        duration={duration}
        currentTime={currentTime}
        effectiveGridZoom={effectiveGridZoom}
        pixelsPerBeat={pixelsPerBeat}
        playbackSpeed={playbackSpeed}
        bpmChanges={bpmChanges}
        progressBarRef={progressBarRef}
        timeDisplayRef={timeDisplayRef}
        isDraggingProgress={isDraggingProgress}
        openExitWarning={openExitWarning}
        togglePlay={togglePlay}
        handleSeekChange={handleSeekChange}
        setIsXPositionGridEnabled={setIsXPositionGridEnabled}
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
      />

      {projectData && (
        <div
          className="group fixed bottom-4 right-4 z-40 select-none"
          onMouseEnter={() => {
            shouldCountRenderedObjectsRef.current = true;
            setIsFpsCounterHovered(true);
            drawGrid();
            updateRenderedObjectsDisplay(true);
          }}
          onMouseLeave={() => {
            shouldCountRenderedObjectsRef.current = false;
            setIsFpsCounterHovered(false);
            renderedObjectsRef.current = 0;
            renderedObjectsDisplayLastUpdateRef.current = 0;
            setRenderedObjects(0);
          }}
          tabIndex={0}
          aria-label={`Performance statistics: ${fps} FPS, ${renderedObjects} rendered objects`}
        >
          <div className="pointer-events-none absolute bottom-full right-0 mb-2 min-w-40 translate-y-1 rounded-xl border border-neutral-700 bg-neutral-950/95 px-3 py-2 text-right font-mono text-xs text-neutral-300 opacity-0 shadow-2xl shadow-black/40 backdrop-blur transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100">
            Rendered objects <span className="ml-2 text-white">{renderedObjects}</span>
          </div>
          <div className="rounded-xl border border-neutral-700 bg-neutral-950/90 px-3 py-2 font-mono text-sm text-neutral-300 shadow-2xl shadow-black/40 backdrop-blur">
            FPS <span className="ml-2 inline-block min-w-8 text-right text-white">{fps}</span>
          </div>
        </div>
      )}

      {/* Main Editor Area */}
      <main className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Sidebar - General Functions */}
        {!isPreviewMode && (
        <aside className={`${isLeftPanelCompact ? 'w-12' : 'w-64'} shrink-0 border-r border-neutral-800 bg-neutral-900/30 flex flex-col transition-all duration-300 overflow-hidden`}>
          <div className={`p-2 border-b border-neutral-800 flex ${isLeftPanelContentVisible ? 'justify-start' : 'justify-center'}`}>
            <button
              onClick={toggleLeftPanelCompact}
              className={`flex items-center gap-2 rounded text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors ${isLeftPanelContentVisible ? 'px-2 py-1 text-xs font-medium' : 'p-1'}`}
            >
              {isLeftPanelCompact ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              {isLeftPanelContentVisible && <span>Collapse Window</span>}
            </button>
          </div>
          {isLeftPanelContentVisible && activeLeftPanel === 'main' && (
            <div className="p-4 flex flex-col gap-4 h-full overflow-y-auto min-h-0">
              <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">General Functions</div>
              <div className="flex flex-col gap-2 flex-1">
                <button 
                  onClick={handleEditInfo}
                  className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                >
                  Info & Files
                </button>
                <button onClick={() => setActiveLeftPanel('bpmTiming')} className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors">
                  BPM / Timing
                </button>
                <button onClick={() => setActiveLeftPanel('speedChanges')} className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors">
                  Speed Changes
                </button>
                <button onClick={() => setActiveLeftPanel('curveNotes')} className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors">
                  Curve Notes
                </button>
                <button onClick={() => setActiveLeftPanel('organize')} className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors">
                  Organize Notes
                </button>
                <button onClick={() => setActiveLeftPanel('history')} className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors">
                  Operation History
                </button>
                <button onClick={() => setActiveLeftPanel('chartIssues')} className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors">
                  Chart Issues
                </button>
              </div>
              
              <div className="mt-auto pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={handleClearCopiedNotes}
                  disabled={copiedNotesCount === 0}
                  className="mb-4 w-full px-3 py-2 text-sm text-neutral-300 bg-neutral-800 hover:bg-neutral-700 hover:text-white disabled:bg-neutral-900 disabled:text-neutral-600 rounded-lg transition-colors"
                >
                  Clear Clipboard
                </button>
                <div className="mb-4 border-t border-neutral-800 pt-4">
                  <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Current Parent</div>
                  <input
                    type="number"
                    min="0"
                    value={currentParentInput}
                    placeholder="Auto"
                    className="w-full p-2 text-sm bg-neutral-800 rounded border border-neutral-700 focus:border-indigo-500 outline-none"
                    onChange={(e) => setCurrentParentInput(e.target.value)}
                  />
                  <div className="text-xs text-neutral-400 mt-2">
                    {currentParentNote
                      ? `ID ${currentParentNote.id} | XPos ${formatNoteLane(currentParentNote.lane)} | Type ${NOTE_TYPES[currentParentNote.type]?.name || currentParentNote.type}`
                      : currentParentInput.trim() === ''
                        ? 'Auto-select current ID when placing.'
                        : 'No note exists with that ID.'}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setCurrentParentInput('')}
                      className="flex-1 px-2 py-1.5 text-xs text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded transition-colors"
                    >
                      Auto
                    </button>
                    <button
                      onClick={() => {
                        if (selectedSingleNote) {
                          setCurrentParentInput(selectedSingleNote.id.toString());
                        }
                      }}
                      disabled={!canUseSelectedAsParent}
                      className="flex-1 px-2 py-1.5 text-xs text-neutral-300 bg-neutral-800 hover:bg-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-600 rounded transition-colors"
                    >
                      Use Selected
                    </button>
                  </div>
                  <div className="text-xs text-neutral-500 mt-2">
                    Current ID: {currentId}
                  </div>
                </div>

                <div className="pt-4 border-t border-neutral-800">
                  <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Selected Note</div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded shadow-sm border border-neutral-700 flex items-center justify-center" style={{ backgroundColor: NOTE_TYPES[selectedNoteType]?.color || '#3b82f6' }}>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-neutral-300">{NOTE_TYPES[selectedNoteType]?.name || 'Unknown'}</span>
                    <span className="text-xs text-neutral-400">Width: {noteWidth} / 16</span>
                  </div>
                </div>
                </div>
              </div>
            </div>
          )}

          {isLeftPanelContentVisible && activeLeftPanel === 'editInfo' && (
            <div className="p-4 flex flex-col h-full overflow-hidden min-h-0">
              <div className="flex items-center gap-2 mb-4 shrink-0">
                <button onClick={() => setActiveLeftPanel('main')} className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Edit Info</div>
              </div>
              <div className="flex flex-col gap-3 overflow-y-auto flex-1 pr-1 pb-4">
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">Song ID *</label>
                  <input type="text" value={formData.songId} required className="w-full p-2 text-sm bg-neutral-800 rounded border border-neutral-700 focus:border-indigo-500 outline-none" onChange={(e) => setFormData({...formData, songId: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">Song Name</label>
                  <input type="text" value={formData.songName} className="w-full p-2 text-sm bg-neutral-800 rounded border border-neutral-700 focus:border-indigo-500 outline-none" onChange={(e) => setFormData({...formData, songName: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">Song Artist</label>
                  <input type="text" value={formData.songArtist} className="w-full p-2 text-sm bg-neutral-800 rounded border border-neutral-700 focus:border-indigo-500 outline-none" onChange={(e) => setFormData({...formData, songArtist: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">Difficulty *</label>
                  <input type="number" value={formData.difficulty} required className="w-full p-2 text-sm bg-neutral-800 rounded border border-neutral-700 focus:border-indigo-500 outline-none" onChange={(e) => setFormData({...formData, difficulty: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">Audio File *</label>
                  <label className="flex flex-col items-center justify-center w-full h-12 border-2 border-dashed border-neutral-700 rounded cursor-pointer hover:border-indigo-500 hover:bg-neutral-800/50 transition-colors">
                    <p className="text-xs text-neutral-400 truncate w-full px-2 text-center">
                      {formData.songFile ? <span className="font-semibold text-indigo-400">{formData.songFile.name}</span> : <span>Upload audio</span>}
                    </p>
                    <input type="file" accept="audio/*" required className="hidden" onChange={(e) => setFormData({...formData, songFile: e.target.files?.[0] || null})} />
                  </label>
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">Illustration</label>
                  <label className="group flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-neutral-700 rounded cursor-pointer hover:border-indigo-500 hover:bg-neutral-800/50 transition-colors relative overflow-hidden">
                    {illustrationPreview && (
                      <>
                        <img src={illustrationPreview} alt="Preview" className="absolute inset-0 w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-neutral-900/70 group-hover:bg-neutral-900/50 transition-colors" />
                      </>
                    )}
                    <p className="text-xs text-neutral-300 truncate w-full px-2 text-center relative z-10">
                      {formData.songIllustration ? <span className="font-semibold text-indigo-300">{formData.songIllustration.name}</span> : <span>Upload image</span>}
                    </p>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => setFormData({...formData, songIllustration: e.target.files?.[0] || null})} />
                  </label>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="block text-xs text-neutral-400">Available Files</label>
                    <span className="text-[11px] text-neutral-500">{chartProjectFiles.length} files</span>
                  </div>
                  <div className="overflow-hidden rounded border border-neutral-800 bg-neutral-900/60">
                    {chartProjectFiles.map(({ label, name, detail, Icon }) => (
                      <div key={`${label}-${name}`} className="flex items-center gap-3 border-b border-neutral-800 px-3 py-2 last:border-b-0">
                        <Icon className="h-4 w-4 shrink-0 text-neutral-500" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-neutral-300">{label}</div>
                          <div className="truncate text-xs text-neutral-500" title={name}>{name}</div>
                        </div>
                        {detail && <div className="shrink-0 text-[11px] text-neutral-500">{detail}</div>}
                      </div>
                    ))}
                  </div>
                </div>
                <button onClick={handleConfirm} className="w-full p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-semibold mt-2 transition-colors shrink-0">Save Changes</button>
              </div>
            </div>
          )}

          {isLeftPanelContentVisible && activeLeftPanel === 'bpmTiming' && (
            <div className="p-4 flex flex-col h-full overflow-hidden min-h-0">
              <div className="flex items-center gap-2 mb-4 shrink-0">
                <button onClick={() => setActiveLeftPanel('main')} className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">BPM / Timing</div>
              </div>
              <div className="flex flex-col gap-4 overflow-hidden flex-1 pr-1 pb-4 min-h-0">
                <div className="shrink-0">
                  <label className="block text-xs text-neutral-400 mb-1">Offset (ms)</label>
                  <CommitInput type="number" value={offset} className="w-full p-2 text-sm bg-neutral-800 rounded border border-neutral-700 focus:border-indigo-500 outline-none" onCommit={(val) => {
                    if (val === '-' || val === "") updateOffset(val);
                    else {
                      const num = parseFloat(val);
                      updateOffset(isNaN(num) ? 0 : num);
                    }
                  }} />
                </div>
                <div className="flex flex-1 min-h-0 flex-col">
                  {!isOfficialChartFormat && (
                    <p className="mb-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-200">
                      Export currently only supports BPM changes with 4/4 time signatures.
                    </p>
                  )}
                  <label className="block shrink-0 text-xs text-neutral-400 mb-1">BPM Changes</label>
                  <div className={`${bpmChangeGridClass} pb-2 text-left text-sm text-neutral-500`}>
                    <div>ID</div>
                    <div>Timepos</div>
                    <div>BPM</div>
                    {!isOfficialChartFormat && <div>Sig</div>}
                    <div />
                  </div>
                  <VirtualizedChangeList
                    items={bpmChanges}
                    rowHeight={36}
                    getKey={(_, index) => index}
                    className="min-h-0 flex-1 pr-1 text-sm text-neutral-300"
                    renderRow={(change, index, style) => (
                      <div style={style} className={`${bpmChangeGridClass} items-center`}>
                        <button
                          type="button"
                          className={changeTableJumpMarkerClass}
                          title={`Jump to BPM change ${index + 1}`}
                          onClick={() => jumpToNoteTime(getTimeFromTimepos(getBpmChangeTimepos(change)))}
                        >
                          {index + 1}
                        </button>
                        <CommitInput type="number" step="0.001" value={getBpmChangeTimepos(change)} className={changeTableInputClass} onCommit={(value) => {
                            const timepos = parseFloat(value);
                            updateBpmChange(index, { timepos: Number.isFinite(timepos) ? timepos : 0 });
                          }} />
                        <CommitInput type="number" value={change.bpm} className={changeTableInputClass} onCommit={(value) => {
                            updateBpmChange(index, { bpm: parseFloat(value) || 120 });
                          }} />
                        {!isOfficialChartFormat && (
                          <CommitInput type="text" value={change.timeSignature} className={changeTableInputClass} onCommit={(value) => {
                              updateBpmChange(index, { timeSignature: value });
                            }} />
                        )}
                        <div>
                          {index > 0 && (
                            <button onClick={() => {
                              deleteBpmChange(index);
                            }} className="text-red-400 hover:text-red-300">
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  />
                  <button onClick={addBpmChange} className="w-full shrink-0 p-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded text-sm mt-2 transition-colors">Add BPM Change</button>
                </div>
              </div>
            </div>
          )}

          {isLeftPanelContentVisible && activeLeftPanel === 'speedChanges' && (
            <div className="p-4 flex flex-col h-full overflow-hidden min-h-0">
              <div className="flex items-center gap-2 mb-4 shrink-0">
                <button onClick={() => setActiveLeftPanel('main')} className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Speed Changes</div>
              </div>
              <div className="flex flex-col overflow-hidden flex-1 pr-1 pb-4 min-h-0">
                <div className={`${speedChangeGridClass} pb-2 text-left text-sm text-neutral-500`}>
                  <div>ID</div>
                  <div>Timepos</div>
                  <div>Speed</div>
                  <div />
                </div>
                <VirtualizedChangeList
                  items={speedChanges}
                  rowHeight={36}
                    getKey={(_, index) => index}
                    className="min-h-0 flex-1 pr-1 text-sm text-neutral-300"
                    renderRow={(change, index, style) => (
                    <div style={style} className={`${speedChangeGridClass} items-center`}>
                      <button
                        type="button"
                        className={changeTableJumpMarkerClass}
                        title={`Jump to speed change ${index + 1}`}
                        onClick={() => jumpToNoteTime(getTimeFromTimepos(change.timepos))}
                      >
                        {index + 1}
                      </button>
                      <CommitInput type="number" step="0.001" value={change.timepos} className={changeTableInputClass} onCommit={(value) => {
                          const timepos = parseFloat(value);
                          updateSpeedChange(index, { timepos: Number.isFinite(timepos) ? timepos : 0 });
                        }} />
                      <CommitInput type="number" step="0.1" value={change.speedChange} className={changeTableInputClass} onCommit={(value) => {
                          const val = parseFloat(value);
                          updateSpeedChange(index, { speedChange: isNaN(val) ? 1 : val });
                        }} />
                      <div>
                        {index > 0 && (
                          <button onClick={() => {
                            deleteSpeedChange(index);
                          }} className="text-red-400 hover:text-red-300">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                />
                <button onClick={addSpeedChange} className="w-full shrink-0 p-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded text-sm mt-2 transition-colors">Add Speed Change</button>
              </div>
            </div>
          )}

          {isLeftPanelContentVisible && activeLeftPanel === 'curveNotes' && (
            <div className="p-4 flex flex-col h-full overflow-hidden min-h-0">
              <div className="flex items-center gap-2 mb-4 shrink-0">
                <button onClick={() => setActiveLeftPanel('main')} className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Curve Notes</div>
              </div>
              <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1 pb-4">
                <label className="block">
                  <span className="mb-1 block text-xs text-neutral-400">Start ID</span>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={curveStartIdInput}
                      className={`${notePropertyInputClass} min-w-0 flex-1`}
                      onChange={(e) => {
                        setCurveStartIdInput(e.target.value);
                        setCurveNotesMessage('');
                      }}
                    />
                    <button
                      type="button"
                      disabled={curveIdSelectTarget === 'end'}
                      onClick={() => {
                        const nextTarget = curveIdSelectTarget === 'start' ? null : 'start';
                        setCurveIdSelectTarget(nextTarget);
                        setCurveNotesMessage(nextTarget ? 'Click a note to set Start ID.' : '');
                      }}
                      className={`shrink-0 rounded border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-600 ${
                        curveIdSelectTarget === 'start'
                          ? 'border-indigo-500 bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'
                      }`}
                    >
                      {curveIdSelectTarget === 'start' ? 'Cancel' : 'Select'}
                    </button>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {curveStartNote
                      ? `${NOTE_TYPES[curveStartNote.type]?.name || UNKNOWN_NOTE_TYPE.name} at ${formatTime(curveStartNote.time, timedBpmChanges)}`
                      : curveStartIdInput.trim() === ''
                        ? 'Enter an existing note ID.'
                        : 'No note exists with that ID.'}
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-neutral-400">End ID</span>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={curveEndIdInput}
                      className={`${notePropertyInputClass} min-w-0 flex-1`}
                      onChange={(e) => {
                        setCurveEndIdInput(e.target.value);
                        setCurveNotesMessage('');
                      }}
                    />
                    <button
                      type="button"
                      disabled={curveIdSelectTarget === 'start'}
                      onClick={() => {
                        const nextTarget = curveIdSelectTarget === 'end' ? null : 'end';
                        setCurveIdSelectTarget(nextTarget);
                        setCurveNotesMessage(nextTarget ? 'Click a note to set End ID.' : '');
                      }}
                      className={`shrink-0 rounded border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-600 ${
                        curveIdSelectTarget === 'end'
                          ? 'border-indigo-500 bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'
                      }`}
                    >
                      {curveIdSelectTarget === 'end' ? 'Cancel' : 'Select'}
                    </button>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {curveEndNote
                      ? `${NOTE_TYPES[curveEndNote.type]?.name || UNKNOWN_NOTE_TYPE.name} at ${formatTime(curveEndNote.time, timedBpmChanges)}`
                      : curveEndIdInput.trim() === ''
                        ? 'Enter an existing note ID.'
                        : 'No note exists with that ID.'}
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-neutral-400">Type</span>
                  <select
                    value={curveNoteType}
                    className={notePropertyInputClass}
                    onChange={(e) => {
                      setCurveNoteType(Number(e.target.value));
                      setCurveNotesMessage('');
                    }}
                  >
                    {AVAILABLE_NOTE_TYPES.map(type => (
                      <option key={type} value={type}>
                        {type} - {NOTE_TYPES[type]?.name || UNKNOWN_NOTE_TYPE.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-neutral-400">Density</span>
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-sm text-neutral-400">1/</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={curveDensityInput}
                      className={`${notePropertyInputClass} min-w-0 flex-1`}
                      onChange={(e) => {
                        setCurveDensityInput(e.target.value);
                        setCurveNotesMessage('');
                      }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {curveDensityInput.trim() === ''
                      ? 'Enter a denominator.'
                      : hasValidCurveDensity
                        ? `Snap density 1/${parsedCurveDensity}.`
                        : 'Density denominator must be a positive whole number.'}
                  </div>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block min-w-0">
                    <span className="mb-1 block text-xs text-neutral-400">Easing</span>
                    <select
                      value={curveEasingFamily}
                      className={`${notePropertyInputClass} min-w-0`}
                      onChange={(e) => {
                        setCurveEasingFamily(e.target.value as CurveEasingFamily);
                        setCurveNotesMessage('');
                      }}
                    >
                      {CURVE_EASING_FAMILY_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block min-w-0">
                    <span className="mb-1 block text-xs text-neutral-400">Type</span>
                    <select
                      value={curveEasingType}
                      className={`${notePropertyInputClass} min-w-0`}
                      disabled={curveEasingFamily === 'linear'}
                      onChange={(e) => {
                        setCurveEasingType(e.target.value as CurveEasingType);
                        setCurveNotesMessage('');
                      }}
                    >
                      {CURVE_EASING_TYPE_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleGenerateCurveNotes}
                  disabled={!canGenerateCurveNotes}
                  className="mt-1 w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                >
                  Generate Curve Notes
                </button>

                <p className="text-xs leading-5 text-neutral-500">
                  Generates intermediate notes on the selected snap grid, interpolating xpos and width with the selected easing.
                </p>

                {canTypeHaveParent(curveNoteType) && (
                  <p className="text-xs leading-5 text-neutral-500">
                    Generated connector notes will parent to the previous point in the curve.
                  </p>
                )}

                {curveNotesMessage && (
                  <div className="rounded border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs leading-5 text-neutral-400">
                    {curveNotesMessage}
                  </div>
                )}
              </div>
            </div>
          )}

          {isLeftPanelContentVisible && ['organize', 'history', 'chartIssues'].includes(activeLeftPanel) && (
            <div className="p-4 flex flex-col h-full overflow-hidden min-h-0">
              <div className="flex items-center gap-2 mb-4 shrink-0">
                <button onClick={() => setActiveLeftPanel('main')} className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  {activeLeftPanel === 'organize' ? 'Organize' : activeLeftPanel === 'chartIssues' ? 'Chart Issues' : 'History'}
                </div>
              </div>
              {activeLeftPanel === 'organize' ? (
                <div className="flex-1">
                  <button
                    type="button"
                    onClick={handleOrganizeNotes}
                    disabled={notes.length === 0 || isOrganizingNotes}
                    className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                  >
                    {isOrganizingNotes ? 'Organizing...' : 'Organize Notes'}
                  </button>
                  <p className="mt-2 text-xs leading-5 text-neutral-500">
                    Reassigns note IDs from earliest to latest timepos, then left to right by xpos. Notes sharing the same timepos and xpos keep their original ID order, and parent links are remapped to stay grouped with their children.
                  </p>
                </div>
              ) : activeLeftPanel === 'chartIssues' ? (
                <div className="flex min-h-0 flex-1 flex-col gap-3">
                  <button
                    type="button"
                    onClick={recheckChartIssues}
                    className="w-full shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
                  >
                    Recheck Chart Issues
                  </button>

                  <div className="shrink-0 rounded border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs leading-5 text-neutral-400">
                    Initial scan found <span className="font-semibold text-neutral-200">{chartIssues.length}</span> potential {chartIssues.length === 1 ? 'issue' : 'issues'}.
                  </div>

                  {chartIssues.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-neutral-800 p-4 text-center text-sm text-neutral-600">
                      No chart issues found
                    </div>
                  ) : (
                    <VirtualizedChangeList
                      items={chartIssues}
                      rowHeight={124}
                      overscan={8}
                      getKey={(issue) => issue.id}
                      className="min-h-0 flex-1 pr-1"
                      renderRow={(issue, _index, style) => (
                        <div style={style} className="pb-2">
                          <div className="flex h-[116px] flex-col rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 truncate text-sm font-medium text-amber-100">
                                {issue.title}
                              </div>
                              <span className="shrink-0 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-200">
                                {issue.category}
                              </span>
                            </div>
                            <div className="mt-1 max-h-12 overflow-hidden break-words text-xs leading-5 text-neutral-300">
                              {issue.detail}
                            </div>
                            <div className="mt-auto flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                              <span>#{issue.id}</span>
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate">
                                  Notes {formatGroupedIds(issue.noteIds)}
                                </span>
                                <button
                                  type="button"
                                  disabled={issue.timepos === null}
                                  onClick={() => {
                                    if (issue.timepos !== null) {
                                      jumpToNoteTime(getTimeFromTimepos(issue.timepos));
                                    }
                                  }}
                                  className="shrink-0 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-[11px] font-medium text-neutral-300 transition-colors hover:border-indigo-500 hover:bg-indigo-600 hover:text-white disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-950 disabled:text-neutral-700"
                                >
                                  Jump
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    />
                  )}
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-3">
                  <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-neutral-400">
                    <input
                      type="checkbox"
                      checked={shouldShowUndoneOperations}
                      onChange={(event) => setShouldShowUndoneOperations(event.target.checked)}
                      className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 accent-indigo-500"
                    />
                    Show Undone Operations
                  </label>

                  {operationHistory.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-neutral-800 p-4 text-center text-sm text-neutral-600">
                      No operations recorded yet
                    </div>
                  ) : visibleOperationHistory.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-neutral-800 p-4 text-center text-sm text-neutral-600">
                      Undone operations are hidden
                    </div>
                  ) : (
                    <VirtualizedChangeList
                      items={visibleOperationHistory}
                      rowHeight={116}
                      overscan={8}
                      getKey={(entry) => entry.id}
                      className="min-h-0 flex-1 pr-1"
                      renderRow={(entry, _index, style) => {
                        const isUndone = undoneOperationIds.has(entry.id);

                        return (
                          <div style={style} className="pb-2">
                            <div className={`flex h-[108px] flex-col rounded-lg border p-3 ${isUndone ? 'border-neutral-800 bg-neutral-950/20 opacity-55' : 'border-neutral-800 bg-neutral-950/40'}`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className={`min-w-0 truncate text-sm font-medium ${isUndone ? 'text-neutral-500' : 'text-neutral-200'}`}>
                                  {entry.title}
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                  {isUndone && (
                                    <span className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-neutral-500">
                                      Undone
                                    </span>
                                  )}
                                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${isUndone ? 'border-neutral-700 bg-neutral-900 text-neutral-500' : operationCategoryStyles[entry.category]}`}>
                                    {entry.category}
                                  </span>
                                </div>
                              </div>
                              <div className={`mt-1 max-h-10 overflow-hidden break-words text-xs leading-5 ${isUndone ? 'text-neutral-600' : 'text-neutral-400'}`}>
                                {entry.detail}
                              </div>
                              <div className="mt-auto flex items-center justify-between text-[11px] text-neutral-600">
                                <span>#{entry.id}</span>
                                <time dateTime={new Date(entry.timestamp).toISOString()}>
                                  {formatHistoryTimestamp(entry.timestamp)}
                                </time>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </aside>
        )}

        {isPreviewMode && (
          <aside className="w-64 shrink-0 border-r border-neutral-800 bg-neutral-900/30 flex flex-col overflow-hidden">
            <div className="border-b border-neutral-800 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Preview Mode</div>
            </div>
            <div className="flex flex-col gap-4 p-4">
              <div>
                <div className="mb-2 text-xs font-medium text-neutral-400">Display Mode</div>
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-neutral-800 bg-neutral-950/40 p-1">
                  <button
                    type="button"
                    onClick={() => setPreviewDisplayMode('2d')}
                    aria-pressed={previewDisplayMode === '2d'}
                    className={`flex h-10 items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors ${
                      previewDisplayMode === '2d'
                        ? 'bg-indigo-600 text-white'
                        : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
                    }`}
                  >
                    <Square className="h-4 w-4" />
                    2D
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewDisplayMode('3d')}
                    aria-pressed={previewDisplayMode === '3d'}
                    className={`flex h-10 items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors ${
                      previewDisplayMode === '3d'
                        ? 'bg-indigo-600 text-white'
                        : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
                    }`}
                  >
                    <Box className="h-4 w-4" />
                    3D
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100">
                NSC and Note Appear Mode in Preview Mode may not be 100% accurate to the official game or other chart players.<br/><br/>Use direct preview via DR3FP for an 100% accurate preview in relation to DanceRail3.
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="preview-3d-tilt" className="text-xs font-medium text-neutral-400">
                    3D Tilt Angle
                  </label>
                  <span className="text-xs tabular-nums text-neutral-500">
                    {preview3DTiltDegrees.toFixed(1)}°
                  </span>
                </div>
                <input
                  id="preview-3d-tilt"
                  type="range"
                  min={MIN_PREVIEW_3D_TILT_DEGREES}
                  max={MAX_PREVIEW_3D_TILT_DEGREES}
                  step="0.1"
                  value={preview3DTiltDegrees}
                  onChange={(event) => setPreview3DTiltDegrees(Number(event.target.value))}
                  disabled={previewDisplayMode !== '3d'}
                  className="h-2 w-full accent-indigo-500 disabled:opacity-45"
                />
                <div className="flex justify-between text-[11px] text-neutral-600">
                  <span>{MIN_PREVIEW_3D_TILT_DEGREES}°</span>
                  <span>{MAX_PREVIEW_3D_TILT_DEGREES}°</span>
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* Center - Canvas */}
        <section 
          ref={containerRef}
          className="flex-1 bg-neutral-950 relative flex items-center justify-center overflow-hidden"
          onWheel={handleWheel}
        >
          {!projectData ? (
            <div className="text-neutral-500 z-10 flex flex-col items-center gap-4">
              <div className="w-16 h-16 border-2 border-dashed border-neutral-700 rounded-full flex items-center justify-center">
                <span className="text-2xl">🎵</span>
              </div>
              <p>{emptyCanvasMessage}</p>
            </div>
          ) : (
            <EditorCanvas 
              canvasRef={canvasRef}
              containerRef={containerRef}
              projectData={projectData}
              bpmChanges={bpmChanges}
              speedChanges={speedChanges}
              gridZoom={gridZoom}
              pixelsPerBeat={pixelsPerBeat}
              currentTime={currentTime}
              offset={offset}
              stateRef={stateRef}
              selectedNoteIds={selectedNoteIds}
              selectionBox={selectionBox}
              timeDisplayRef={timeDisplayRef}
              progressBarRef={progressBarRef}
              isDraggingProgress={isDraggingProgress}
              audioRef={audioRef}
              isPreviewMode={isPreviewMode}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={(event) => {
                if (!selectionBox) {
                  handleCanvasMouseUp(null);
                  return;
                }

                const selectionPoint = getSelectionPointFromClient(event.clientX, event.clientY);
                handleCanvasMouseUp(selectionPoint
                  ? {
                      ...selectionBox,
                      endXPosition: selectionPoint.xPosition,
                      endBeat: selectionPoint.beat,
                    }
                  : selectionBox);
              }}
              onMouseLeave={handleCanvasMouseLeave}
              onContextMenu={handleContextMenu}
            />
          )}
        </section>

        {/* Right Sidebar - Properties */}
        {!isPreviewMode && (
        <aside className={`${isRightPanelCompact ? 'w-12' : 'w-64'} shrink-0 border-l border-neutral-800 bg-neutral-900/30 flex flex-col transition-all duration-300 overflow-hidden`}>
          <div className={`p-2 border-b border-neutral-800 flex ${isRightPanelContentVisible ? 'justify-start' : 'justify-center'}`}>
            <button
              onClick={toggleRightPanelCompact}
              className={`flex items-center gap-2 rounded text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors ${isRightPanelContentVisible ? 'px-2 py-1 text-xs font-medium' : 'p-1'}`}
            >
              {isRightPanelCompact ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              {isRightPanelContentVisible && <span>Collapse Window</span>}
            </button>
          </div>
          {isRightPanelContentVisible && (
            <div className="p-4 flex flex-col gap-4 overflow-y-auto">
              <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Properties</div>
              {selectedSingleNote ? (
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedNoteIds([])}
                    className="flex w-full items-center justify-center gap-2 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Deselect All</span>
                  </button>

                  <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-8 w-8 rounded border border-neutral-700"
                        style={{ backgroundColor: NOTE_TYPES[selectedSingleNote.type]?.color || UNKNOWN_NOTE_TYPE.color }}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-neutral-200">
                          {NOTE_TYPES[selectedSingleNote.type]?.name || UNKNOWN_NOTE_TYPE.name}
                        </div>
                        <div className="text-xs text-neutral-500">ID {selectedSingleNote.id}</div>
                      </div>
                    </div>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-400">Type</span>
                    <select
                      value={selectedSingleNote.type}
                      className={notePropertyInputClass}
                      onChange={(e) => updateSelectedNote({ type: Number(e.target.value) })}
                    >
                      {AVAILABLE_NOTE_TYPES.map(type => (
                        <option key={type} value={type}>
                          {type} - {NOTE_TYPES[type]?.name || UNKNOWN_NOTE_TYPE.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-400">Timepos (measure/decimal)</span>
                    <CommitInput
                      type="number"
                      step="0.001"
                      min="0"
                      value={Number(selectedNoteTimepos.toFixed(3))}
                      className={notePropertyInputClass}
                      onCommit={(value) => updateSelectedNote({ time: getTimeFromTimepos(Math.max(0, Number(value) || 0)) })}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-400">XPos</span>
                    <CommitInput
                      type="number"
                      step="0.01"
                      value={selectedSingleNote.lane}
                      className={notePropertyInputClass}
                      onCommit={(value) => {
                        const lane = Number(value);
                        if (!Number.isFinite(lane)) return;
                        updateSelectedNote({ lane });
                      }}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-400">Width</span>
                    <CommitInput
                      type="number"
                      min="0"
                      max="16"
                      step="0.01"
                      value={selectedSingleNote.width}
                      className={notePropertyInputClass}
                      onCommit={(value) => {
                        const parsedWidth = Number(value);
                        const width = Number.isFinite(parsedWidth) ? Math.max(0, Math.min(16, parsedWidth)) : selectedSingleNote.width;
                        updateSelectedNote({ width });
                      }}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-400">Parent ID</span>
                    <div className="flex gap-2">
                      <CommitInput
                        type="number"
                        min="0"
                        value={selectedSingleNote.parentId ?? ''}
                        placeholder="None"
                        className={notePropertyInputClass}
                        disabled={!canEditSelectedNoteParent}
                        onCommit={(value) => {
                          const trimmedValue = value.trim();
                          updateSelectedNote({ parentId: trimmedValue === '' ? null : Math.max(0, Number(trimmedValue) || 0) });
                        }}
                      />
                      <button
                        type="button"
                        disabled={!canEditSelectedNoteParent || !selectedParentNote}
                        onClick={() => {
                          if (selectedParentNote) {
                            jumpToNoteTime(selectedParentNote.time);
                          }
                        }}
                        className="shrink-0 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-600"
                      >
                        Jump To
                      </button>
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-400">Speed</span>
                    <CommitInput
                      type="text"
                      value={selectedSingleNote.speed ?? ''}
                      placeholder="Default"
                      className={notePropertyInputClass}
                      onCommit={(value) => {
                        const normalizedValue = value.replace(/\s+/g, '');
                        updateSelectedNote({ speed: normalizedValue === '' ? undefined : normalizedValue });
                      }}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-400">AppearMode</span>
                    <select
                      value={selectedSingleNote.appearMode ?? 'none'}
                      className={notePropertyInputClass}
                      onChange={(e) => {
                        const nextAppearMode = e.target.value;
                        updateSelectedNote({
                          appearMode: nextAppearMode === 'none'
                            ? undefined
                            : nextAppearMode as Note['appearMode'],
                        });
                      }}
                    >
                      {APPEAR_MODE_OPTIONS.map((appearMode) => (
                        <option key={appearMode} value={appearMode}>
                          {appearMode}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : (
                selectedNoteIds.length > 1 ? (
                  <div className="flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedNoteIds([])}
                      className="flex w-full items-center justify-center gap-2 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>Deselect All</span>
                    </button>

                    <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
                      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Multiselect Functions</div>
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={handleCopySelectedNotes}
                          className="flex w-full items-center justify-center gap-2 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteSelectedNotes}
                          className="flex w-full items-center justify-center gap-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-200 transition-colors hover:bg-red-500/20 hover:text-white"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleMirrorSelectedNotes}
                          className="flex w-full items-center justify-center gap-2 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
                        >
                          <FlipHorizontal className="h-3.5 w-3.5" />
                          <span>Mirror</span>
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 flex items-center justify-center text-sm text-neutral-600 border border-dashed border-neutral-800 rounded-lg p-4 text-center">
                      {`${selectedNoteIds.length} notes selected`}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
                    <div className="text-sm font-medium text-neutral-200">Chart Summary</div>
                    <div className="mt-3 flex flex-col divide-y divide-neutral-800 text-sm">
                      <div className="flex items-center justify-between py-2 first:pt-0">
                        <span className="text-neutral-400">Total Notes</span>
                        <span className="font-mono text-neutral-100">{notes.length}</span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-neutral-400">BPM Changes</span>
                        <span className="font-mono text-neutral-100">{bpmChanges.length}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 last:pb-0">
                        <span className="text-neutral-400">Speed Changes</span>
                        <span className="font-mono text-neutral-100">{speedChanges.length}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-neutral-800 py-2 pt-4">
                        <span className="text-neutral-400">Current BPM</span>
                        <span className="font-mono text-neutral-100">{formatHistoryNumber(currentEditorBpm)}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 last:pb-0">
                        <span className="text-neutral-400">Current Speed</span>
                        <span className="font-mono text-neutral-100">{formatHistoryNumber(currentEditorSpeed)}x</span>
                      </div>
                      <div className="flex items-center justify-between py-2 last:pb-0">
                        <span className="text-neutral-400">Current Distance</span>
                        <span className="font-mono text-neutral-100">{currentEditorDistance.toFixed(3)}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-neutral-800 py-2 pt-4">
                        <span className="text-neutral-400">Current Combo</span>
                        <span className="font-mono text-neutral-100">{currentEditorCombo}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 last:pb-0">
                        <span className="text-neutral-400">Current Score</span>
                        <span className="font-mono text-neutral-100">{currentEditorScore}</span>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </aside>
        )}
      </main>
    </motion.div>
  );
}
