import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { motion } from 'motion/react';
import { Pause, Play, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { isOfficialNoteSpeedLockedType, NOTE_TYPES, UNKNOWN_NOTE_TYPE } from '../constants/editorConstants';
import {
  getMediaTimeFromPlaybackTime,
  getPlaybackTimeFromMediaTime,
  type AudioTimingCorrection,
} from '../editor/audioTiming';
import { SOUND_URLS } from '../editor/editorAudioAssets';
import { APPEAR_MODE_P_NSC } from '../editor/editorViewConstants';
import { formatHistoryNumber } from '../editor/editorHistory';
import { PREVIEW_NOTE_TEXTURE_URLS } from '../editor/previewNoteSprites';
import type { Note } from '../types/editorTypes';
import {
  dialogFooterClassName,
  dialogHeaderClassName,
  dialogSurfaceClassName,
  getDialogMotionProps,
  getOverlayClassName,
  getOverlayMotionProps,
} from './editorDesign';

interface NscKeyframe {
  id: string;
  timeOffset: number;
  valueOffset: number;
}

interface ParsedNscState {
  keyframes: NscKeyframe[];
}

interface NscGraphAxisBounds {
  maxTimeOffset: number;
  minTimeOffset: number;
  timeOffsetRange: number;
  maxValueOffset: number;
  minValueOffset: number;
  valueOffsetRange: number;
}

interface EditorNscToolModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedNote: Note | null;
  selectedNoteTimepos: number;
  currentBpm: number;
  isOfficialChartFormat: boolean;
  isBackdropBlurDisabled: boolean;
  isAnimationDisabled: boolean;
  playbackAudioUrl: string;
  chartOffset: string | number;
  audioTimingCorrection: AudioTimingCorrection;
  musicVolume: number;
  tapSoundVolume: number;
  getTimeFromTimepos: (timepos: number) => number;
  getTimeposFromTime: (time: number) => number;
  updateSelectedNote: (updates: Partial<Note>) => void;
}

const GRAPH_WIDTH = 640;
const GRAPH_HEIGHT = 300;
const GRAPH_PADDING_TOP = 22;
const GRAPH_PADDING_RIGHT = 24;
const GRAPH_PADDING_BOTTOM = 54;
const GRAPH_PADDING_LEFT = 66;
const GRAPH_SNAP_STEP = 0.025;
const PREVIEW_TRACK_WIDTH = 420;
const PREVIEW_TRACK_HEIGHT = 112;
const PREVIEW_TRACK_PADDING = 34;
const PREVIEW_NOTE_SIZE = 56;
const PREVIEW_NOTE_Y = PREVIEW_TRACK_HEIGHT / 2;
const SECONDS_PER_TIMEPOS_BEATS = 4 * 60;
const NSC_TOOL_DRAFT_STORAGE_KEY = 'dr3-editor-nsc-tool-draft-v1';
const NSC_TOOL_PREVIEW_ZOOM_STORAGE_KEY = 'dr3-editor-nsc-tool-preview-zoom-v1';
const DEFAULT_KEYFRAMES = [
  { timeOffset: 7, valueOffset: 7 },
  { timeOffset: -1, valueOffset: -1 },
];

const createKeyframeId = () => `nsc-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const formatNscNumber = (value: number, precision = 4) => {
  const roundedValue = Number(value.toFixed(precision));
  return Object.is(roundedValue, -0) ? '0' : roundedValue.toString();
};

const normalizeFiniteNumber = (value: number, fallback: number) => (
  Number.isFinite(value) ? value : fallback
);

const sanitizeNumericDraft = (value: string) => {
  const sanitizedValue = value.replace(/[^\d.-]/g, '');
  const sign = sanitizedValue.includes('-') ? '-' : '';
  const unsignedValue = sanitizedValue.replace(/-/g, '');
  const [integerPart, ...decimalParts] = unsignedValue.split('.');
  const decimalText = decimalParts.length > 0 ? `.${decimalParts.join('')}` : '';
  return `${sign}${integerPart}${decimalText}`;
};

const sanitizeChartValueDraft = (value: string) => (
  value.replace(/[^\d.:\-;\s]/g, '')
);

const snapGraphValue = (value: number) => (
  Number((Math.round(value / GRAPH_SNAP_STEP) * GRAPH_SNAP_STEP).toFixed(3))
);

const createKeyframes = (keyframes: Array<{ timeOffset: number; valueOffset: number }>): NscKeyframe[] => (
  keyframes.map(keyframe => ({
    id: createKeyframeId(),
    timeOffset: normalizeFiniteNumber(keyframe.timeOffset, 0),
    valueOffset: normalizeFiniteNumber(keyframe.valueOffset, 0),
  }))
);

const getSortedKeyframes = (keyframes: NscKeyframe[]) => (
  [...keyframes].sort((a, b) => b.timeOffset - a.timeOffset)
);

const parseNscSpeed = (speed: string | undefined): ParsedNscState => {
  const normalizedSpeed = speed?.replace(/\s+/g, '') || '';

  if (!normalizedSpeed.includes(':')) {
    const multiplier = Number(normalizedSpeed || '1');
    const normalizedMultiplier = Number.isFinite(multiplier) && multiplier !== 0 ? multiplier : 1;

    return {
      keyframes: createKeyframes([
        { timeOffset: 0.25, valueOffset: 0.25 * normalizedMultiplier },
        { timeOffset: 0, valueOffset: 0 },
      ]),
    };
  }

  const keyframes = normalizedSpeed
    .split(';')
    .map((entry) => {
      const [timeOffsetText, valueOffsetText] = entry.split(':');
      const timeOffset = Number(timeOffsetText);
      const valueOffset = Number(valueOffsetText);

      if (!Number.isFinite(timeOffset) || !Number.isFinite(valueOffset)) {
        return null;
      }

      return {
        id: createKeyframeId(),
        timeOffset,
        valueOffset,
      };
    })
    .filter((keyframe): keyframe is NscKeyframe => keyframe !== null);

  return {
    keyframes: keyframes.length > 0
      ? getSortedKeyframes(keyframes)
      : createKeyframes(DEFAULT_KEYFRAMES),
  };
};

const serializeCurveKeyframes = (keyframes: NscKeyframe[]) => (
  getSortedKeyframes(keyframes)
    .map((keyframe) => `${formatNscNumber(keyframe.timeOffset)}:${formatNscNumber(keyframe.valueOffset)}`)
    .join(';')
);

const isValidNscChartValue = (value: string) => {
  const normalizedValue = value.replace(/\s+/g, '');
  if (!normalizedValue || !normalizedValue.includes(':')) {
    return false;
  }

  return normalizedValue.split(';').every((entry) => {
    const columns = entry.split(':');
    if (columns.length !== 2) {
      return false;
    }

    const timeOffset = Number(columns[0]);
    const valueOffset = Number(columns[1]);
    return Number.isFinite(timeOffset)
      && Number.isFinite(valueOffset);
  });
};

const evaluateCurveValueOffset = (keyframes: NscKeyframe[], playbackOffset: number) => {
  const sortedKeyframes = getSortedKeyframes(keyframes);

  if (sortedKeyframes.length === 0) {
    return playbackOffset;
  }

  const first = sortedKeyframes[0];
  const last = sortedKeyframes[sortedKeyframes.length - 1];

  if (playbackOffset >= first.timeOffset) {
    return first.valueOffset;
  }

  if (playbackOffset <= last.timeOffset) {
    return last.valueOffset;
  }

  for (let index = 1; index < sortedKeyframes.length; index += 1) {
    const previous = sortedKeyframes[index - 1];
    const next = sortedKeyframes[index];

    if (playbackOffset <= previous.timeOffset && playbackOffset >= next.timeOffset) {
      const span = previous.timeOffset - next.timeOffset;
      const progress = span <= 0.000001 ? 0 : (previous.timeOffset - playbackOffset) / span;
      return previous.valueOffset + (next.valueOffset - previous.valueOffset) * progress;
    }
  }

  return last.valueOffset;
};

const getStoredKeyframes = () => {
  try {
    const storedDraft = window.localStorage.getItem(NSC_TOOL_DRAFT_STORAGE_KEY);
    if (!storedDraft) {
      return null;
    }

    const parsedDraft = JSON.parse(storedDraft) as Partial<{ keyframes: Array<{ timeOffset: number; valueOffset: number }> }>;
    if (!Array.isArray(parsedDraft.keyframes) || parsedDraft.keyframes.length === 0) {
      return null;
    }

    return createKeyframes(parsedDraft.keyframes);
  } catch {
    return null;
  }
};

const getStoredPreviewZoom = () => {
  try {
    const storedZoom = window.localStorage.getItem(NSC_TOOL_PREVIEW_ZOOM_STORAGE_KEY);
    const parsedZoom = Number(storedZoom);
    return Number.isFinite(parsedZoom) && parsedZoom >= 0 ? parsedZoom : 0;
  } catch {
    return 0;
  }
};

export default function EditorNscToolModal({
  isOpen,
  onClose,
  selectedNote,
  selectedNoteTimepos,
  currentBpm,
  isOfficialChartFormat,
  isBackdropBlurDisabled,
  isAnimationDisabled,
  playbackAudioUrl,
  chartOffset,
  audioTimingCorrection,
  musicVolume,
  tapSoundVolume,
  getTimeFromTimepos,
  getTimeposFromTime,
  updateSelectedNote,
}: EditorNscToolModalProps) {
  const [keyframes, setKeyframes] = useState<NscKeyframe[]>(() => getStoredKeyframes() ?? createKeyframes(DEFAULT_KEYFRAMES));
  const [chartValueDraft, setChartValueDraft] = useState(() => serializeCurveKeyframes(getStoredKeyframes() ?? createKeyframes(DEFAULT_KEYFRAMES)));
  const [keyframeInputDrafts, setKeyframeInputDrafts] = useState<Record<string, { timeOffset: string; valueOffset: string }>>({});
  const [draggingKeyframeId, setDraggingKeyframeId] = useState<string | null>(null);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [previewZoom, setPreviewZoom] = useState(getStoredPreviewZoom);
  const [previewZoomDraft, setPreviewZoomDraft] = useState(() => formatNscNumber(getStoredPreviewZoom(), 3));
  const [dragAxisBounds, setDragAxisBounds] = useState<NscGraphAxisBounds | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [isPreviewLooping, setIsPreviewLooping] = useState(true);
  const [hitEffectId, setHitEffectId] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [chartValueError, setChartValueError] = useState('');
  const svgRef = useRef<SVGSVGElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const hitSoundAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewProgressRef = useRef(0);
  const loadedNoteIdRef = useRef<number | null>(null);
  const bpm = Number.isFinite(currentBpm) && currentBpm > 0 ? currentBpm : 120;
  const isSelectedNoteSpeedLocked = Boolean(
    isOfficialChartFormat
    && selectedNote
    && isOfficialNoteSpeedLockedType(selectedNote.type),
  );
  const isSelectedNoteNscCompatible = Boolean(selectedNote && !isSelectedNoteSpeedLocked);

  useEffect(() => {
    if (!isOpen) {
      setIsPreviewPlaying(false);
      previewAudioRef.current?.pause();
      return;
    }

    setIsPreviewPlaying(false);

    if (!selectedNote) {
      loadedNoteIdRef.current = null;
      return;
    }

    if (loadedNoteIdRef.current === selectedNote.id) {
      return;
    }

    const parsed = parseNscSpeed(selectedNote?.speed);
    setKeyframes(parsed.keyframes);
    setChartValueDraft(serializeCurveKeyframes(parsed.keyframes));
    setKeyframeInputDrafts({});
    setPreviewProgress(0);
    setStatusMessage('');
    setChartValueError('');
    loadedNoteIdRef.current = selectedNote.id;
  }, [isOpen, selectedNote]);

  const sortedKeyframes = useMemo(() => getSortedKeyframes(keyframes), [keyframes]);
  const maxTimeOffset = useMemo(() => (
    Math.max(0.5, ...sortedKeyframes.map(keyframe => keyframe.timeOffset))
  ), [sortedKeyframes]);
  const minTimeOffset = useMemo(() => (
    Math.min(0, ...sortedKeyframes.map(keyframe => keyframe.timeOffset))
  ), [sortedKeyframes]);
  const timeOffsetRange = Math.max(0.5, maxTimeOffset - minTimeOffset);
  const maxValueOffset = useMemo(() => (
    Math.max(0.5, maxTimeOffset, ...sortedKeyframes.map(keyframe => keyframe.valueOffset))
  ), [maxTimeOffset, sortedKeyframes]);
  const minValueOffset = useMemo(() => (
    Math.min(0, ...sortedKeyframes.map(keyframe => keyframe.valueOffset))
  ), [sortedKeyframes]);
  const valueOffsetRange = Math.max(0.5, maxValueOffset - minValueOffset);
  const graphAxisBounds: NscGraphAxisBounds = {
    maxTimeOffset,
    minTimeOffset,
    timeOffsetRange,
    maxValueOffset,
    minValueOffset,
    valueOffsetRange,
  };
  const activeGraphAxisBounds = dragAxisBounds ?? graphAxisBounds;
  const serializedSpeed = useMemo(() => serializeCurveKeyframes(sortedKeyframes), [sortedKeyframes]);
  const previewPlaybackRange = Math.max(0.5, maxTimeOffset);
  const previewStartTimepos = selectedNoteTimepos - previewPlaybackRange;
  const previewStartChartTime = isSelectedNoteNscCompatible ? getTimeFromTimepos(previewStartTimepos) : 0;
  const previewEndChartTime = isSelectedNoteNscCompatible ? getTimeFromTimepos(selectedNoteTimepos) : 0;
  const notePreviewPlaybackSeconds = Math.max(0.001, previewEndChartTime - previewStartChartTime);
  const standalonePreviewDurationSeconds = Math.max(1.2, Math.min(4, previewPlaybackRange * SECONDS_PER_TIMEPOS_BEATS / bpm));
  const previewPlaybackSeconds = isSelectedNoteNscCompatible
    ? notePreviewPlaybackSeconds
    : standalonePreviewDurationSeconds;
  const previewDurationSeconds = previewPlaybackSeconds;
  const previewPlaybackChartTime = isSelectedNoteNscCompatible
    ? previewStartChartTime + previewPlaybackSeconds * previewProgress
    : 0;
  const previewPlaybackTimepos = isSelectedNoteNscCompatible ? getTimeposFromTime(previewPlaybackChartTime) : selectedNoteTimepos;
  const playbackLeadOffset = isSelectedNoteNscCompatible
    ? selectedNoteTimepos - previewPlaybackTimepos
    : maxTimeOffset - previewPlaybackRange * previewProgress;
  const visualLeadOffset = evaluateCurveValueOffset(sortedKeyframes, playbackLeadOffset);
  const visualLeadSeconds = isSelectedNoteNscCompatible
    ? getTimeFromTimepos(selectedNoteTimepos) - getTimeFromTimepos(selectedNoteTimepos - visualLeadOffset)
    : visualLeadOffset * SECONDS_PER_TIMEPOS_BEATS / bpm;
  const playbackLeadSeconds = isSelectedNoteNscCompatible
    ? Math.max(0, previewEndChartTime - previewPlaybackChartTime)
    : playbackLeadOffset * SECONDS_PER_TIMEPOS_BEATS / bpm;
  const selectedNoteType = selectedNote ? (NOTE_TYPES[selectedNote.type] ?? UNKNOWN_NOTE_TYPE) : null;
  const autoPreviewScaleOffset = Math.max(0.5, maxValueOffset);
  const previewMaxVisualOffset = previewZoom > 0 ? previewZoom : autoPreviewScaleOffset;
  const previewVisualOffsetRange = previewMaxVisualOffset;
  const previewJudgementX = PREVIEW_TRACK_WIDTH - PREVIEW_TRACK_PADDING;
  const previewTravelWidth = previewJudgementX - PREVIEW_TRACK_PADDING;
  const previewNoteX = previewJudgementX - (visualLeadOffset / previewVisualOffsetRange) * previewTravelWidth;
  const previewNoteTextureUrl = PREVIEW_NOTE_TEXTURE_URLS[selectedNote?.type ?? 1] ?? PREVIEW_NOTE_TEXTURE_URLS[1];

  useEffect(() => {
    setChartValueDraft(serializedSpeed);

    try {
      window.localStorage.setItem(
        NSC_TOOL_DRAFT_STORAGE_KEY,
        JSON.stringify({
          keyframes: sortedKeyframes.map(({ timeOffset, valueOffset }) => ({ timeOffset, valueOffset })),
        }),
      );
    } catch {
      // Ignore local storage failures; modal state still persists while mounted.
    }
  }, [serializedSpeed, sortedKeyframes]);

  useEffect(() => {
    try {
      window.localStorage.setItem(NSC_TOOL_PREVIEW_ZOOM_STORAGE_KEY, previewZoom.toString());
    } catch {
      // Ignore local storage failures; the in-memory draft still works.
    }
  }, [previewZoom]);

  useEffect(() => {
    previewProgressRef.current = previewProgress;
  }, [previewProgress]);

  useEffect(() => {
    if (!isPreviewPlaying) {
      previewAudioRef.current?.pause();
      return undefined;
    }

    const initialPreviewProgress = previewProgressRef.current;
    const audio = previewAudioRef.current;
    const canPlayPreviewAudio = Boolean(
      audio
      && playbackAudioUrl
      && isSelectedNoteNscCompatible
    );
    const chartOffsetSeconds = Number(chartOffset) / 1000;
    const normalizedChartOffsetSeconds = Number.isFinite(chartOffsetSeconds) ? chartOffsetSeconds : 0;
    const seekPreviewAudio = (playbackProgress: number) => {
      if (!audio || !isSelectedNoteNscCompatible) {
        return;
      }

      const clampedProgress = Math.min(1, Math.max(0, playbackProgress));
      const playbackChartTime = previewStartChartTime + previewPlaybackSeconds * clampedProgress;
      audio.currentTime = getMediaTimeFromPlaybackTime(
        playbackChartTime,
        normalizedChartOffsetSeconds,
        audioTimingCorrection,
      );
    };

    if (audio && canPlayPreviewAudio) {
      audio.volume = musicVolume;
      audio.playbackRate = 1;
      seekPreviewAudio(initialPreviewProgress);
      void audio.play().catch(() => {
        // Browsers can reject autoplay. Visual preview should continue.
      });
    }

    const durationMs = previewDurationSeconds * 1000;
    const startTime = performance.now() - initialPreviewProgress * durationMs;
    const judgementProgress = 1;
    let hasPlayedHit = false;
    let previousCycle = 0;
    let previousProgress = initialPreviewProgress;
    let frameId = 0;
    const triggerHitIfCrossed = (currentProgress: number) => {
      if (!hasPlayedHit && previousProgress < judgementProgress && currentProgress >= judgementProgress) {
        hasPlayedHit = true;
        setHitEffectId(current => current + 1);
      }
    };

    const tick = (now: number) => {
      const rawElapsed = Math.max(0, now - startTime);
      const fallbackRawProgress = rawElapsed / durationMs;
      const audioPlaybackTime = canPlayPreviewAudio && audio && !audio.paused
        ? getPlaybackTimeFromMediaTime(audio.currentTime, normalizedChartOffsetSeconds, audioTimingCorrection)
        : null;
      const rawProgress = audioPlaybackTime !== null
        ? (audioPlaybackTime - previewStartChartTime) / previewPlaybackSeconds
        : fallbackRawProgress;
      const normalizedRawProgress = Math.max(0, rawProgress);
      const currentCycle = Math.floor(normalizedRawProgress);
      const currentProgress = isPreviewLooping
        ? normalizedRawProgress % 1
        : Math.min(1, normalizedRawProgress);

      if (isPreviewLooping && currentCycle > previousCycle) {
        triggerHitIfCrossed(1);
        if (canPlayPreviewAudio) {
          seekPreviewAudio(0);
          void audio?.play().catch(() => undefined);
        }
        previousCycle = canPlayPreviewAudio ? 0 : currentCycle;
        previousProgress = 0;
        hasPlayedHit = false;
      }

      triggerHitIfCrossed(currentProgress);
      previousProgress = currentProgress;
      setPreviewProgress(currentProgress);

      if (!isPreviewLooping && normalizedRawProgress >= 1) {
        setPreviewProgress(1);
        setIsPreviewPlaying(false);
        audio?.pause();
        return;
      }

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frameId);
      audio?.pause();
    };
  }, [
    audioTimingCorrection,
    chartOffset,
    isPreviewLooping,
    isPreviewPlaying,
    isSelectedNoteNscCompatible,
    musicVolume,
    playbackAudioUrl,
    previewDurationSeconds,
    previewStartChartTime,
    previewPlaybackSeconds,
    selectedNote,
  ]);

  useEffect(() => {
    if (hitEffectId === 0) {
      return undefined;
    }

    const hitSoundAudio = hitSoundAudioRef.current;
    if (hitSoundAudio && tapSoundVolume > 0) {
      hitSoundAudio.volume = tapSoundVolume;
      hitSoundAudio.currentTime = 0;
      void hitSoundAudio.play().catch(() => undefined);
    }

    const timeoutId = window.setTimeout(() => setHitEffectId(0), 420);
    return () => window.clearTimeout(timeoutId);
  }, [hitEffectId, tapSoundVolume]);

  if (!isOpen) {
    return null;
  }

  const graphInnerWidth = GRAPH_WIDTH - GRAPH_PADDING_LEFT - GRAPH_PADDING_RIGHT;
  const graphInnerHeight = GRAPH_HEIGHT - GRAPH_PADDING_TOP - GRAPH_PADDING_BOTTOM;
  const getGraphPoint = (keyframe: NscKeyframe) => ({
    x: GRAPH_PADDING_LEFT + ((activeGraphAxisBounds.maxTimeOffset - keyframe.timeOffset) / activeGraphAxisBounds.timeOffsetRange) * graphInnerWidth,
    y: GRAPH_PADDING_TOP + (1 - ((keyframe.valueOffset - activeGraphAxisBounds.minValueOffset) / activeGraphAxisBounds.valueOffsetRange)) * graphInnerHeight,
  });
  const graphPolylinePoints = sortedKeyframes
    .map(getGraphPoint)
    .map(point => `${point.x},${point.y}`)
    .join(' ');
  const graphTicks = [0, 0.25, 0.5, 0.75, 1];
  const updateKeyframe = (id: string, updates: Partial<NscKeyframe>) => {
    setKeyframes(currentKeyframes => currentKeyframes.map(keyframe => (
      keyframe.id === id
        ? {
          ...keyframe,
          ...updates,
          timeOffset: normalizeFiniteNumber(updates.timeOffset ?? keyframe.timeOffset, keyframe.timeOffset),
          valueOffset: normalizeFiniteNumber(updates.valueOffset ?? keyframe.valueOffset, keyframe.valueOffset),
        }
        : keyframe
    )));
  };
  const setKeyframeInputDraft = (id: string, field: 'timeOffset' | 'valueOffset', value: string) => {
    setKeyframeInputDrafts(currentDrafts => ({
      ...currentDrafts,
      [id]: {
        timeOffset: currentDrafts[id]?.timeOffset ?? '',
        valueOffset: currentDrafts[id]?.valueOffset ?? '',
        [field]: sanitizeNumericDraft(value),
      },
    }));
  };
  const commitKeyframeInputDraft = (keyframe: NscKeyframe, field: 'timeOffset' | 'valueOffset') => {
    const draftValue = keyframeInputDrafts[keyframe.id]?.[field];
    if (draftValue === undefined) {
      return;
    }

    const parsedValue = Number(draftValue);
    if (Number.isFinite(parsedValue)) {
      updateKeyframe(keyframe.id, {
        [field]: parsedValue,
      });
    }

    setKeyframeInputDrafts(currentDrafts => {
      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[keyframe.id];
      return nextDrafts;
    });
  };
  const getPointerGraphValue = (event: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) {
      return null;
    }

    const rect = svg.getBoundingClientRect();
    const viewX = ((event.clientX - rect.left) / rect.width) * GRAPH_WIDTH;
    const viewY = ((event.clientY - rect.top) / rect.height) * GRAPH_HEIGHT;
    const clampedX = Math.max(GRAPH_PADDING_LEFT, Math.min(GRAPH_WIDTH - GRAPH_PADDING_RIGHT, viewX));
    const clampedY = Math.max(GRAPH_PADDING_TOP, Math.min(GRAPH_HEIGHT - GRAPH_PADDING_BOTTOM, viewY));

    return {
      timeOffset: snapGraphValue(activeGraphAxisBounds.maxTimeOffset - ((clampedX - GRAPH_PADDING_LEFT) / graphInnerWidth) * activeGraphAxisBounds.timeOffsetRange),
      valueOffset: snapGraphValue(activeGraphAxisBounds.minValueOffset + (((GRAPH_HEIGHT - GRAPH_PADDING_BOTTOM - clampedY) / graphInnerHeight) * activeGraphAxisBounds.valueOffsetRange)),
    };
  };
  const handleGraphPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!draggingKeyframeId) {
      return;
    }

    const value = getPointerGraphValue(event);
    if (!value) {
      return;
    }

    updateKeyframe(draggingKeyframeId, value);
  };
  const applyToSelectedNote = () => {
    if (!selectedNote || isSelectedNoteSpeedLocked) {
      return;
    }

    updateSelectedNote({
      speed: serializedSpeed,
    });
    setStatusMessage(`Applied NSC to note #${selectedNote.id}.`);
  };
  const updateKeyframesFromChartValue = (value: string) => {
    setChartValueDraft(sanitizeChartValueDraft(value));
    setChartValueError('');
    setStatusMessage('');
  };
  const commitPreviewZoomDraft = () => {
    const parsedZoom = Number(previewZoomDraft);
    const nextZoom = Number.isFinite(parsedZoom) ? Math.max(0, parsedZoom) : previewZoom;
    setPreviewZoom(nextZoom);
    setPreviewZoomDraft(formatNscNumber(nextZoom, 3));
  };
  const commitChartValueDraft = () => {
    if (!isValidNscChartValue(chartValueDraft)) {
      setChartValueError('Enter keyframes as time:value pairs, separated by semicolons.');
      return;
    }

    const parsed = parseNscSpeed(chartValueDraft);
    setKeyframes(parsed.keyframes);
    setKeyframeInputDrafts({});
    setChartValueError('');
    setStatusMessage('');
  };
  const loadPreset = (preset: 'linear' | 'freeze' | 'pop' | 'default') => {
    if (preset === 'default') {
      const defaultKeyframes = createKeyframes(DEFAULT_KEYFRAMES);
      setKeyframes(defaultKeyframes);
      setKeyframeInputDrafts({});
      setStatusMessage('');
      setChartValueError('');
      return;
    }

    const parsedPreset = preset === 'pop'
      ? parseNscSpeed(APPEAR_MODE_P_NSC)
      : {
        keyframes: preset === 'freeze'
          ? [
            { id: createKeyframeId(), timeOffset: 0.5, valueOffset: 0.5 },
            { id: createKeyframeId(), timeOffset: 0.05, valueOffset: 0.4 },
            { id: createKeyframeId(), timeOffset: 0, valueOffset: 0 },
          ]
          : [
            { id: createKeyframeId(), timeOffset: 0.5, valueOffset: 0.5 },
            { id: createKeyframeId(), timeOffset: 0, valueOffset: 0 },
          ],
      };

    setKeyframes(parsedPreset.keyframes);
    setKeyframeInputDrafts({});
    setStatusMessage('');
    setChartValueError('');
  };

  return (
    <motion.div
      className={`${getOverlayClassName(isBackdropBlurDisabled, isAnimationDisabled, 'z-[65]')} text-neutral-100`}
      {...getOverlayMotionProps(isAnimationDisabled)}
      onMouseDown={onClose}
    >
      {playbackAudioUrl && (
        <audio ref={previewAudioRef} src={playbackAudioUrl} preload="auto" />
      )}
      <audio ref={hitSoundAudioRef} src={SOUND_URLS['hit.ogg']} preload="auto" />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nsc-tool-title"
        className={`relative max-h-[92vh] w-full max-w-5xl ${dialogSurfaceClassName}`}
        {...getDialogMotionProps(isAnimationDisabled)}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={`${dialogHeaderClassName} flex items-start justify-between gap-4`}>
          <div>
            <div className="text-sm font-semibold uppercase tracking-wider text-indigo-300">NSC Tool</div>
            <h2 id="nsc-tool-title" className="mt-2 text-xl font-semibold text-white">
              Note speed change editor
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
              Complex NSC uses keyframes to determine how the note is drawn at what time. This tool simplifies the process with real-time preview, drag-to-edit, and a table of values.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
            aria-label="Close NSC Tool"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] gap-4 overflow-y-auto p-5">
          <section className="flex min-w-0 flex-col gap-4">
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-neutral-100">Keyframes</div>
                  <div className="text-xs text-neutral-500">
                    {selectedNote ? `Editing note #${selectedNote.id} at timepos ${formatNscNumber(selectedNoteTimepos, 3)}` : 'The points on this graph are draggable.'}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                  <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
                    <svg
                      ref={svgRef}
                      viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
                      className="block w-full touch-none"
                      onPointerMove={handleGraphPointerMove}
                      onPointerUp={(event) => {
                        if (draggingKeyframeId) {
                          svgRef.current?.releasePointerCapture(event.pointerId);
                        }
                        setDraggingKeyframeId(null);
                        setDragAxisBounds(null);
                      }}
                      onPointerCancel={() => {
                        setDraggingKeyframeId(null);
                        setDragAxisBounds(null);
                      }}
                    >
                      <rect x="0" y="0" width={GRAPH_WIDTH} height={GRAPH_HEIGHT} fill="#0a0a0a" />
                      <line x1={GRAPH_PADDING_LEFT} y1={GRAPH_HEIGHT - GRAPH_PADDING_BOTTOM} x2={GRAPH_WIDTH - GRAPH_PADDING_RIGHT} y2={GRAPH_HEIGHT - GRAPH_PADDING_BOTTOM} stroke="#525252" />
                      <line x1={GRAPH_PADDING_LEFT} y1={GRAPH_PADDING_TOP} x2={GRAPH_PADDING_LEFT} y2={GRAPH_HEIGHT - GRAPH_PADDING_BOTTOM} stroke="#525252" />
                      {graphTicks.map((tick) => {
                        const x = GRAPH_PADDING_LEFT + tick * graphInnerWidth;
                        const y = GRAPH_PADDING_TOP + tick * graphInnerHeight;
                        const xValue = activeGraphAxisBounds.maxTimeOffset - activeGraphAxisBounds.timeOffsetRange * tick;
                        const yValue = activeGraphAxisBounds.minValueOffset + activeGraphAxisBounds.valueOffsetRange * (1 - tick);
                        return (
                          <g key={tick}>
                            <line x1={x} y1={GRAPH_PADDING_TOP} x2={x} y2={GRAPH_HEIGHT - GRAPH_PADDING_BOTTOM} stroke="#262626" />
                            <line x1={GRAPH_PADDING_LEFT} y1={y} x2={GRAPH_WIDTH - GRAPH_PADDING_RIGHT} y2={y} stroke="#262626" />
                            <line x1={x} y1={GRAPH_HEIGHT - GRAPH_PADDING_BOTTOM} x2={x} y2={GRAPH_HEIGHT - GRAPH_PADDING_BOTTOM + 5} stroke="#525252" />
                            <line x1={GRAPH_PADDING_LEFT - 5} y1={y} x2={GRAPH_PADDING_LEFT} y2={y} stroke="#525252" />
                            <text x={x} y={GRAPH_HEIGHT - GRAPH_PADDING_BOTTOM + 18} fill="#a3a3a3" fontSize="11" textAnchor="middle">
                              {formatNscNumber(xValue, 3)}
                            </text>
                            <text x={GRAPH_PADDING_LEFT - 9} y={y + 4} fill="#a3a3a3" fontSize="11" textAnchor="end">
                              {formatNscNumber(yValue, 3)}
                            </text>
                          </g>
                        );
                      })}
                      <polyline points={graphPolylinePoints} fill="none" stroke="#818cf8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                      {sortedKeyframes.map((keyframe) => {
                        const point = getGraphPoint(keyframe);
                        return (
                          <g key={keyframe.id}>
                            <circle
                              cx={point.x}
                              cy={point.y}
                              r="9"
                              fill="#c7d2fe"
                              stroke="#4f46e5"
                              strokeWidth="3"
                              className="cursor-grab active:cursor-grabbing"
                              onPointerDown={(event) => {
                                event.preventDefault();
                                setDragAxisBounds(graphAxisBounds);
                                setDraggingKeyframeId(keyframe.id);
                                svgRef.current?.setPointerCapture(event.pointerId);
                              }}
                            />
                          </g>
                        );
                      })}
                      <text x={GRAPH_WIDTH / 2} y={GRAPH_HEIGHT - 9} fill="#d4d4d4" fontSize="13" fontWeight="600" textAnchor="middle">
                        Playback offset from hit (timepos)
                      </text>
                      <text x="16" y={GRAPH_HEIGHT / 2} fill="#d4d4d4" fontSize="13" fontWeight="600" textAnchor="middle" transform={`rotate(-90 16 ${GRAPH_HEIGHT / 2})`}>
                        Displayed offset from hit (timepos)
                      </text>
                    </svg>
                  </div>
                  <div className="text-xs text-neutral-500">
                    Dragging points snaps them to {formatNscNumber(GRAPH_SNAP_STEP, 3)} increments.
                  </div>

                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.25rem] gap-2 text-xs">
                    <div className="font-semibold uppercase tracking-wider text-neutral-500">Playback offset</div>
                    <div className="font-semibold uppercase tracking-wider text-neutral-500">Displayed offset</div>
                    <div />
                    {sortedKeyframes.map((keyframe) => (
                      <div key={keyframe.id} className="contents">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={keyframeInputDrafts[keyframe.id]?.timeOffset ?? keyframe.timeOffset}
                          onChange={(event) => setKeyframeInputDraft(keyframe.id, 'timeOffset', event.target.value)}
                          onBlur={() => commitKeyframeInputDraft(keyframe, 'timeOffset')}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              commitKeyframeInputDraft(keyframe, 'timeOffset');
                              event.currentTarget.blur();
                            }
                          }}
                          className="min-w-0 rounded border border-neutral-700 bg-neutral-800 p-2 text-sm outline-none focus:border-indigo-500"
                        />
                        <input
                          type="text"
                          inputMode="decimal"
                          value={keyframeInputDrafts[keyframe.id]?.valueOffset ?? keyframe.valueOffset}
                          onChange={(event) => setKeyframeInputDraft(keyframe.id, 'valueOffset', event.target.value)}
                          onBlur={() => commitKeyframeInputDraft(keyframe, 'valueOffset')}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              commitKeyframeInputDraft(keyframe, 'valueOffset');
                              event.currentTarget.blur();
                            }
                          }}
                          className="min-w-0 rounded border border-neutral-700 bg-neutral-800 p-2 text-sm outline-none focus:border-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => setKeyframes(currentKeyframes => currentKeyframes.filter(current => current.id !== keyframe.id))}
                          disabled={sortedKeyframes.length <= 1}
                          className="flex items-center justify-center rounded border border-neutral-700 bg-neutral-800 text-neutral-400 transition-colors hover:bg-red-500/20 hover:text-red-200 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-700"
                          aria-label="Delete NSC keyframe"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const middleOffset = Number((maxTimeOffset / 2).toFixed(3));
                      setKeyframes(currentKeyframes => [
                        ...currentKeyframes,
                        { id: createKeyframeId(), timeOffset: middleOffset, valueOffset: middleOffset },
                      ]);
                    }}
                    className="inline-flex w-fit items-center gap-2 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
                  >
                    <Plus className="h-4 w-4" />
                    Add keyframe
                  </button>
                </div>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-4">
              <div className="mb-3 text-sm font-semibold text-neutral-100">Examples</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => loadPreset('default')} className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-300 hover:bg-neutral-700 hover:text-white">Ignore Speed</button>
                <button type="button" onClick={() => loadPreset('linear')} className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-300 hover:bg-neutral-700 hover:text-white">Sudden Appear</button>
                <button type="button" onClick={() => loadPreset('freeze')} className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-300 hover:bg-neutral-700 hover:text-white">Sudden Rush</button>
                <button type="button" onClick={() => loadPreset('pop')} className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-300 hover:bg-neutral-700 hover:text-white">Jump Curve</button>
              </div>
            </div>
          </section>

          <section className="flex min-w-0 flex-col gap-4">
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-neutral-100">Preview</div>
                  <div className="text-xs text-neutral-500">Current BPM: {formatHistoryNumber(bpm)}</div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-neutral-400">
                    <span>Zoom</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={previewZoomDraft}
                      onChange={(event) => setPreviewZoomDraft(sanitizeNumericDraft(event.target.value).replace(/-/g, ''))}
                      onBlur={commitPreviewZoomDraft}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          commitPreviewZoomDraft();
                          event.currentTarget.blur();
                        }
                      }}
                      className="w-16 rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-xs text-neutral-100 outline-none focus:border-indigo-500"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isPreviewPlaying && previewProgress >= 1) {
                        setPreviewProgress(0);
                      }
                      setIsPreviewPlaying(current => !current);
                    }}
                    className="inline-flex items-center gap-2 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
                  >
                    {isPreviewPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    {isPreviewPlaying ? 'Pause' : 'Play'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPreviewLooping(current => !current)}
                    className={`rounded border px-3 py-2 text-xs font-semibold transition-colors ${
                      isPreviewLooping
                        ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30'
                        : 'border-red-500/40 bg-red-500/20 text-red-100 hover:bg-red-500/30'
                    }`}
                  >
                    Loop
                  </button>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950 p-4">
                <svg
                  viewBox={`0 0 ${PREVIEW_TRACK_WIDTH} ${PREVIEW_TRACK_HEIGHT}`}
                  className="block h-28 w-full"
                  role="img"
                  aria-label="NSC preview path"
                >
                  <line
                    x1={PREVIEW_TRACK_PADDING}
                    y1={PREVIEW_NOTE_Y}
                    x2={previewJudgementX}
                    y2={PREVIEW_NOTE_Y}
                    stroke="#404040"
                    strokeWidth="1"
                  />
                  <line
                    x1={PREVIEW_TRACK_PADDING}
                    y1="18"
                    x2={PREVIEW_TRACK_PADDING}
                    y2="94"
                    stroke="#22d3ee"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={PREVIEW_TRACK_PADDING}
                    y="13"
                    fill="#67e8f9"
                    fontSize="11"
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    max {formatNscNumber(previewMaxVisualOffset, 2)}
                  </text>
                  <line
                    x1={previewJudgementX}
                    y1="16"
                    x2={previewJudgementX}
                    y2="96"
                    stroke="#c7d2fe"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                  <text
                    x={previewJudgementX}
                    y="13"
                    fill="#c7d2fe"
                    fontSize="11"
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    0
                  </text>
                  <image
                    href={previewNoteTextureUrl}
                    x={previewNoteX - PREVIEW_NOTE_SIZE / 2}
                    y={PREVIEW_NOTE_Y - PREVIEW_NOTE_SIZE / 2}
                    width={PREVIEW_NOTE_SIZE}
                    height={PREVIEW_NOTE_SIZE}
                    preserveAspectRatio="xMidYMid meet"
                    transform={`rotate(90 ${previewNoteX} ${PREVIEW_NOTE_Y})`}
                    className="drop-shadow-[0_0_12px_rgba(56,189,248,0.45)]"
                  />
                  {hitEffectId > 0 && (
                    <g key={hitEffectId}>
                      <circle
                        cx={previewJudgementX}
                        cy={PREVIEW_NOTE_Y}
                        r="24"
                        fill="#facc15"
                        fillOpacity="0.22"
                        stroke="#fde047"
                        strokeWidth="4"
                      />
                      {[
                        { x1: 0, y1: -31, x2: 0, y2: -12 },
                        { x1: 0, y1: 12, x2: 0, y2: 31 },
                        { x1: -14, y1: -25, x2: -5, y2: -10 },
                        { x1: 14, y1: -25, x2: 5, y2: -10 },
                        { x1: -14, y1: 25, x2: -5, y2: 10 },
                        { x1: 14, y1: 25, x2: 5, y2: 10 },
                      ].map((spark, index) => (
                        <line
                          key={index}
                          x1={previewJudgementX + spark.x1}
                          y1={PREVIEW_NOTE_Y + spark.y1}
                          x2={previewJudgementX + spark.x2}
                          y2={PREVIEW_NOTE_Y + spark.y2}
                          stroke="#fef3c7"
                          strokeWidth="4"
                          strokeLinecap="round"
                        />
                      ))}
                      <circle
                        cx={previewJudgementX}
                        cy={PREVIEW_NOTE_Y}
                        r="7"
                        fill="#fbbf24"
                      />
                    </g>
                  )}
                </svg>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.001"
                  value={previewProgress}
                  onChange={(event) => {
                    setIsPreviewPlaying(false);
                    setPreviewProgress(Number(event.target.value));
                  }}
                  className="mt-3 w-full accent-indigo-500"
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="col-span-2 rounded border border-neutral-800 bg-neutral-900/60 p-2 text-neutral-400">
                  Preview zoom: {previewZoom > 0 ? `left edge ${formatNscNumber(previewZoom, 3)}` : `auto (${formatNscNumber(autoPreviewScaleOffset, 3)})`}
                </div>
                <div className="rounded border border-neutral-800 bg-neutral-900/60 p-2">
                  <div className="text-neutral-500">Playback offset</div>
                  <div className="mt-1 font-mono text-neutral-100">{formatNscNumber(playbackLeadSeconds, 3)}s</div>
                </div>
                <div className="rounded border border-neutral-800 bg-neutral-900/60 p-2">
                  <div className="text-neutral-500">Displayed offset</div>
                  <div className="mt-1 font-mono text-neutral-100">{formatNscNumber(visualLeadSeconds, 3)}s</div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-4">
              <div className="mb-2 text-sm font-semibold text-neutral-100">NSC Data</div>
              <textarea
                value={chartValueDraft}
                onChange={(event) => updateKeyframesFromChartValue(event.target.value)}
                onBlur={commitChartValueDraft}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                    commitChartValueDraft();
                    event.currentTarget.blur();
                  }
                }}
                spellCheck={false}
                className={`h-24 w-full resize-none rounded border bg-neutral-900 p-2 font-mono text-xs text-neutral-200 outline-none focus:border-indigo-500 ${chartValueError ? 'border-red-500' : 'border-neutral-700'}`}
              />
              <p className={`mt-2 text-xs leading-5 ${chartValueError ? 'text-red-300' : 'text-neutral-500'}`}>
                {chartValueError || 'Editing/pasting updates the graph and table of values automatically.'}
              </p>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-4 text-xs leading-5 text-neutral-400">
              <div className="mb-1 font-semibold text-neutral-200">How NSC Works</div>
              A keyframe string uses pairs such as <span className="font-mono text-neutral-200">0.5:0.25</span>, meaning that 0.5 measures before the note, the note is drawn as if it were 0.25 measures away (at 1x speed). The visible area ends at around 0.5 displayed offset.
            </div>
          </section>
        </div>

        <div className={`${dialogFooterClassName} flex flex-wrap items-center justify-between gap-3`}>
          <div className="min-h-5 text-xs text-neutral-400">
            {isSelectedNoteSpeedLocked
              ? 'This note type does not support note speed changes.'
              : statusMessage}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div
              className={`rounded border px-3 py-2 text-xs font-semibold uppercase tracking-wider ${
                selectedNote
                  ? 'border-indigo-400/40 bg-indigo-950/80 text-indigo-100'
                  : 'border-neutral-700 bg-neutral-900 text-neutral-400'
              }`}
            >
              {selectedNote
                ? `Selected note #${selectedNote.id} - ${selectedNoteType?.name ?? UNKNOWN_NOTE_TYPE.name} - ${formatNscNumber(selectedNoteTimepos, 3)}`
                : 'No note selected'}
            </div>
            <button
              type="button"
              onClick={() => {
                setKeyframes(createKeyframes(DEFAULT_KEYFRAMES));
                setStatusMessage('');
                setChartValueError('');
              }}
              className="inline-flex items-center gap-2 rounded border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-semibold text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
            <button
              type="button"
              onClick={applyToSelectedNote}
              disabled={!selectedNote || isSelectedNoteSpeedLocked}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
            >
              Apply to selected note
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
