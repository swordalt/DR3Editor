export type TutorialRegion =
  | 'topBar'
  | 'leftSidebar'
  | 'canvas'
  | 'rightSidebar'
  | 'previewSidebar'
  | 'selectedNoteTypeIndicator'
  | 'settings'
  | 'help';

export type TutorialOperation =
  | 'keyboardShortcuts'
  | 'noteTypeHotkeys'
  | 'playback'
  | 'timelineScroll'
  | 'canvasPointer'
  | 'metadata'
  | 'offset'
  | 'previewMode'
  | 'export'
  | 'openSettings'
  | 'openHelp'
  | 'exitEditor';

export type TutorialDialoguePosition =
  | 'top'
  | 'topLeft'
  | 'topRight'
  | 'bottom'
  | 'bottomLeft'
  | 'bottomRight'
  | 'left'
  | 'right';

export type TutorialObjective =
  | 'metadataSaved'
  | 'offsetEdited'
  | 'timelineScrolled'
  | 'notePlaced'
  | 'noteDeleted'
  | 'noteTypeSelected'
  | 'holdSequencePlaced'
  | 'playbackMeasure2Completed'
  | 'previewPlaybackMeasure2Completed';

export interface TutorialNoteSpec {
  id: number;
  type: number;
  timepos: number;
  lane: number;
  width: number;
  parentId: number | null;
}

export interface TutorialStep {
  id: string;
  title: string;
  body: string;
  objective: string;
  objectiveId: TutorialObjective;
  dialoguePosition?: TutorialDialoguePosition;
  focusTargets: TutorialRegion[];
  allowedOperations: TutorialOperation[];
}

export interface TutorialSessionState {
  steps: TutorialStep[];
  currentStepIndex: number;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'edit-chart-metadata',
    title: 'Edit chart metadata',
    body: 'Chart metadata identifies the project and keeps exports organized. Open Chart Metadata, change Difficulty to 15, then press Enter to save.',
    objective: 'Set Difficulty to 15 and save by pressing Enter.',
    objectiveId: 'metadataSaved',
    dialoguePosition: 'right',
    focusTargets: ['leftSidebar'],
    allowedOperations: ['metadata', 'exitEditor'],
  },
  {
    id: 'edit-offset',
    title: 'Edit offset',
    body: 'Offset shifts the chart timing against the audio. Open BPM / Timing, change Offset to 50, then press Enter to save.',
    objective: 'Set Offset to 50 and save by pressing Enter.',
    objectiveId: 'offsetEdited',
    dialoguePosition: 'right',
    focusTargets: ['leftSidebar'],
    allowedOperations: ['offset', 'exitEditor'],
  },
  {
    id: 'scroll-around',
    title: 'Scroll around',
    body: 'The canvas scrolls through the timeline by measures. Move the mouse over the chart area and scroll to change the current timeline position.',
    objective: 'Scroll the timeline once.',
    objectiveId: 'timelineScrolled',
    dialoguePosition: 'right',
    focusTargets: ['canvas'],
    allowedOperations: ['timelineScroll', 'exitEditor'],
  },
  {
    id: 'place-notes',
    title: 'Place notes',
    body: 'Left click inside the chart lanes to place the selected note type at the snapped beat. Place one note anywhere in the tutorial space.',
    objective: 'Place one note with left click.',
    objectiveId: 'notePlaced',
    dialoguePosition: 'right',
    focusTargets: ['canvas'],
    allowedOperations: ['canvasPointer', 'timelineScroll', 'exitEditor'],
  },
  {
    id: 'delete-notes',
    title: 'Delete notes',
    body: 'Right click an existing note to delete it. This is the fastest way to remove a note directly from the canvas.',
    objective: 'Delete one note with right click.',
    objectiveId: 'noteDeleted',
    dialoguePosition: 'right',
    focusTargets: ['canvas'],
    allowedOperations: ['canvasPointer', 'timelineScroll', 'exitEditor'],
  },
  {
    id: 'change-note-type',
    title: 'Change note type',
    body: 'A and D cycle through available note types. The current selected note indicator shows what will be placed next. Use A or D to navigate to type 5.',
    objective: 'Use A or D until the selected note type is 5.',
    objectiveId: 'noteTypeSelected',
    dialoguePosition: 'topLeft',
    focusTargets: ['selectedNoteTypeIndicator'],
    allowedOperations: ['noteTypeHotkeys', 'exitEditor'],
  },
  {
    id: 'place-hold-notes',
    title: 'Place hold notes',
    body: 'A complete blue hold is built from a type 5 start, type 6 center, and type 7 end. Place them in that order at later points in time so the editor links the chain.',
    objective: 'Place type 5, then type 6, then type 7 across time.',
    objectiveId: 'holdSequencePlaced',
    dialoguePosition: 'topLeft',
    focusTargets: ['canvas', 'selectedNoteTypeIndicator'],
    allowedOperations: ['noteTypeHotkeys', 'canvasPointer', 'timelineScroll', 'exitEditor'],
  },
  {
    id: 'start-pause-playback',
    title: 'Start and pause playback',
    body: 'Playback starts from the beginning of the chart. Press Space or P to start playback, then let it run until measure 2 finishes.',
    objective: 'Press Space or P and wait until measure 2 concludes.',
    objectiveId: 'playbackMeasure2Completed',
    dialoguePosition: 'topLeft',
    focusTargets: ['canvas', 'topBar'],
    allowedOperations: ['playback', 'exitEditor'],
  },
  {
    id: 'preview-mode',
    title: 'Preview mode',
    body: 'Preview mode shows the chart closer to gameplay. First press I to enter preview mode, then press Space or P and let the first two measures play.',
    objective: 'Press I, then press Space or P and wait until measure 2 concludes.',
    objectiveId: 'previewPlaybackMeasure2Completed',
    dialoguePosition: 'topLeft',
    focusTargets: ['canvas', 'topBar'],
    allowedOperations: ['previewMode', 'playback', 'exitEditor'],
  },
];

export const TUTORIAL_STEP_8_END_TIMEPOS = 3;

export const TUTORIAL_STEP_8_NOTES: TutorialNoteSpec[] = [
  { id: 1, type: 1, timepos: 0.5, lane: 2, width: 4, parentId: null },
  { id: 2, type: 1, timepos: 0.625, lane: 10, width: 4, parentId: null },
  { id: 3, type: 1, timepos: 0.75, lane: 4, width: 4, parentId: null },
  { id: 4, type: 1, timepos: 0.875, lane: 8, width: 4, parentId: null },
  { id: 5, type: 3, timepos: 1, lane: 2, width: 4, parentId: null },
  { id: 6, type: 11, timepos: 1.125, lane: 2, width: 4, parentId: 5 },
  { id: 7, type: 11, timepos: 1.25, lane: 2, width: 4, parentId: 6 },
  { id: 8, type: 11, timepos: 1.375, lane: 2, width: 4, parentId: 7 },
  { id: 9, type: 11, timepos: 1.5, lane: 2, width: 4, parentId: 8 },
  { id: 10, type: 14, timepos: 1, lane: 10, width: 4, parentId: null },
  { id: 11, type: 14, timepos: 1.25, lane: 10, width: 4, parentId: null },
  { id: 26, type: 2, timepos: 1.5, lane: 10, width: 4, parentId: null },
  { id: 27, type: 2, timepos: 1.625, lane: 2, width: 4, parentId: null },
  { id: 28, type: 2, timepos: 1.75, lane: 8, width: 4, parentId: null },
  { id: 29, type: 2, timepos: 1.875, lane: 4, width: 4, parentId: null },
  { id: 30, type: 27, timepos: 2, lane: 7, width: 2, parentId: null },
  { id: 31, type: 26, timepos: 2.25, lane: 7, width: 2, parentId: null },
  { id: 32, type: 25, timepos: 2.5, lane: 7, width: 2, parentId: null },
  { id: 33, type: 1, timepos: 2.75, lane: 7, width: 2, parentId: null },
  { id: 34, type: 9, timepos: 2.125, lane: 11, width: 4, parentId: null },
  { id: 35, type: 9, timepos: 2.375, lane: 1, width: 4, parentId: null },
  { id: 36, type: 9, timepos: 2.625, lane: 11, width: 4, parentId: null },
  { id: 37, type: 9, timepos: 2.875, lane: 1, width: 4, parentId: null },
];

export const createTutorialSession = (): TutorialSessionState => ({
  steps: TUTORIAL_STEPS,
  currentStepIndex: 0,
});

export const getActiveTutorialStep = (session: TutorialSessionState | null) => (
  session?.steps[session.currentStepIndex] ?? null
);

export const isTutorialOperationAllowed = (
  session: TutorialSessionState | null,
  operation: TutorialOperation,
) => {
  const activeStep = getActiveTutorialStep(session);
  return !activeStep || activeStep.allowedOperations.includes(operation);
};

export const isTutorialRegionFocused = (
  session: TutorialSessionState | null,
  region: TutorialRegion,
) => {
  const activeStep = getActiveTutorialStep(session);
  return !activeStep || activeStep.focusTargets.length === 0 || activeStep.focusTargets.includes(region);
};
