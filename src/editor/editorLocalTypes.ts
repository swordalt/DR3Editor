import type { Dispatch, SetStateAction } from 'react';
import type { BpmChange, EditorMode, ImportLoadStatus, Note, ProjectData, SpeedChange } from '../types/editorTypes';

export type ActiveLeftPanel = 'main' | 'editInfo' | 'speedChanges' | 'curveSpeedChanges' | 'curveNotes' | 'organize' | 'history' | 'chartIssues' | 'bpmTiming';
export type CurveIdSelectTarget = 'start' | 'end' | null;
export type CurveEasingFamily = 'linear' | 'sine' | 'quad' | 'cubic' | 'quart' | 'quint' | 'expo' | 'circ' | 'back' | 'elastic';
export type CurveEasingType = 'in' | 'out' | 'inOut';
export type CurveEasingId =
  | 'linear'
  | 'easeInSine'
  | 'easeOutSine'
  | 'easeInOutSine'
  | 'easeInQuad'
  | 'easeOutQuad'
  | 'easeInOutQuad'
  | 'easeInCubic'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  | 'easeInQuart'
  | 'easeOutQuart'
  | 'easeInOutQuart'
  | 'easeInQuint'
  | 'easeOutQuint'
  | 'easeInOutQuint'
  | 'easeInExpo'
  | 'easeOutExpo'
  | 'easeInOutExpo'
  | 'easeInCirc'
  | 'easeOutCirc'
  | 'easeInOutCirc'
  | 'easeInBack'
  | 'easeOutBack'
  | 'easeInOutBack'
  | 'easeInElastic'
  | 'easeOutElastic'
  | 'easeInOutElastic';

export interface EditorProps {
  onBack: () => void;
  mode?: EditorMode;
  isTutorial?: boolean;
  initialProjectData?: ProjectData | null;
  initialChartFileName?: string | null;
  notes: Note[];
  setNotes: Dispatch<SetStateAction<Note[]>>;
  bpmChanges: BpmChange[];
  setBpmChanges: Dispatch<SetStateAction<BpmChange[]>>;
  speedChanges: SpeedChange[];
  setSpeedChanges: Dispatch<SetStateAction<SpeedChange[]>>;
  offset: string | number;
  setOffset: Dispatch<SetStateAction<string | number>>;
  onImportLoadStatusChange?: (status: ImportLoadStatus | null) => void;
}

export interface EditorRuntimeState {
  isPlaying: boolean;
  currentTime: number;
  playbackStartTime: number;
  playbackStartPerformanceTime: number;
  playbackAudioClockReadyTime: number;
  playbackSpeed: number;
  bpm: number;
  bpmChanges: BpmChange[];
  speedChanges: SpeedChange[];
  offset: string | number;
  notes: Note[];
}

export interface HoverPreview {
  lane: number;
  time: number;
}

export interface SpeedDistancePoint {
  timepos: number;
  distance: number;
  speed: number;
}

export interface PreviewNoteSpeedKeyframe {
  time: number;
  value: number;
}

export interface PreviewNotePosition {
  x: number;
  y: number;
  scale: number;
}

export type PreviewNoteSpeed =
  | { kind: 'multiplier'; multiplier: number }
  | { kind: 'curve'; keyframes: PreviewNoteSpeedKeyframe[] };

export interface PreviewNoteRenderEntry {
  note: Note;
  beat: number;
  timepos: number;
  playbackTime: number;
  distance: number;
  noteSpeed: PreviewNoteSpeed;
}

export interface PreviewHoldConnectorSegment {
  note: Note;
  parentNote: Note;
  noteBeat: number;
  parentBeat: number;
  noteTimepos: number;
  parentTimepos: number;
  notePlaybackTime: number;
  parentPlaybackTime: number;
  noteDistance: number;
  parentDistance: number;
  noteSpeed: PreviewNoteSpeed;
  parentSpeed: PreviewNoteSpeed;
  minDistance: number;
  maxDistance: number;
  groupedSegments?: PreviewHoldConnectorSegment[];
}

export interface PreviewJudgementNoteEntry {
  id: number;
  time: number;
  type: number;
  lane: number;
  width: number;
}

export interface PreviewHitFxEvent {
  id: string;
  noteId: number;
  time: number;
  type: number;
  lane: number;
  width: number;
}

export interface PreviewCameraMovementSegment {
  startTime: number;
  endTime: number;
  deltaXPosition: number;
}

export interface PreviewCameraMovementInterval {
  startTime: number;
  endTime: number;
  offsetAtStart: number;
  slope: number;
}

export interface PreviewCameraTiltSegment {
  startTime: number;
  endTime: number;
  startTimepos: number;
  endTimepos: number;
  parentTiltDegrees: number;
  noteTiltDegrees: number;
}

export interface PreviewCameraTiltInterval {
  startTime: number;
  endTime: number;
  startTimepos: number;
  endTimepos: number;
  tiltAtStartDegrees: number;
  slopeDegreesPerSecond: number;
}

export interface HitSoundEvent {
  time: number;
  soundUrl: string;
  key: string;
}

export interface PendingDragUpdate {
  noteId: number;
  lane: number;
  time: number;
}

export interface CopiedNote extends Note {
  copiedTimepos: number;
}
