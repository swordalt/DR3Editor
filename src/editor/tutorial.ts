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
    title: 'Edit Difficulty',
    body: 'A great way to organize your projects is to use metadata. You can edit this information in the Info & Files tab of the left sidebar.',
    objective: 'Set Difficulty to 15 and save by pressing Enter.',
    objectiveId: 'metadataSaved',
    dialoguePosition: 'right',
    focusTargets: ['leftSidebar'],
    allowedOperations: ['metadata', 'exitEditor'],
  },
  {
    id: 'edit-offset',
    title: 'Edit Offset',
    body: 'Offset shifts the chart against the audio and is important in any rhythm game. You can edit offset in the BPM & Timing tab.',
    objective: 'Set Offset to 50 and save by pressing Enter.',
    objectiveId: 'offsetEdited',
    dialoguePosition: 'right',
    focusTargets: ['leftSidebar'],
    allowedOperations: ['offset', 'exitEditor'],
  },
  {
    id: 'scroll-around',
    title: 'Scroll Around',
    body: 'The canvas is where you will place notes and do the actual charting. Move around by scrolling up or down. (You can change the scroll direction in Settings.)',
    objective: 'Scroll the timeline once.',
    objectiveId: 'timelineScrolled',
    dialoguePosition: 'right',
    focusTargets: ['canvas'],
    allowedOperations: ['timelineScroll', 'exitEditor'],
  },
  {
    id: 'place-notes',
    title: 'Place Notes',
    body: 'Left-click to place notes. You can see a glowing translucent preview while hovering above the canvas.',
    objective: 'Place one note with left click.',
    objectiveId: 'notePlaced',
    dialoguePosition: 'right',
    focusTargets: ['canvas'],
    allowedOperations: ['canvasPointer', 'timelineScroll', 'exitEditor'],
  },
  {
    id: 'delete-notes',
    title: 'Delete Notes',
    body: 'Right-click to easily remove notes. This is the simplest method of removing a note.',
    objective: 'Delete one note with right click.',
    objectiveId: 'noteDeleted',
    dialoguePosition: 'right',
    focusTargets: ['canvas'],
    allowedOperations: ['canvasPointer', 'timelineScroll', 'exitEditor'],
  },
  {
    id: 'change-note-type',
    title: 'Change Note Type',
    body: 'DanceRail3 offers many note types. Use the A and D keys to cycle through note types, like a carousel.',
    objective: 'Select the Blue Hold Start (5).',
    objectiveId: 'noteTypeSelected',
    dialoguePosition: 'topLeft',
    focusTargets: ['selectedNoteTypeIndicator'],
    allowedOperations: ['noteTypeHotkeys', 'exitEditor'],
  },
  {
    id: 'place-hold-notes',
    title: 'Place Hold Notes',
    body: 'A complete hold is built from a start, center, and end. Place them in that order, advancing in time, to create a hold chain.',
    objective: 'Place type 5, then type 6, then type 7 across time, one after another.',
    objectiveId: 'holdSequencePlaced',
    dialoguePosition: 'topLeft',
    focusTargets: ['canvas', 'selectedNoteTypeIndicator'],
    allowedOperations: ['noteTypeHotkeys', 'canvasPointer', 'timelineScroll', 'exitEditor'],
  },
  {
    id: 'start-pause-playback',
    title: 'Playback',
    body: 'You have been teleported to the beginning of a chart. Use the space bar or P to begin playback.',
    objective: 'Commence playback and let the chart finish.',
    objectiveId: 'playbackMeasure2Completed',
    dialoguePosition: 'topLeft',
    focusTargets: ['canvas', 'topBar'],
    allowedOperations: ['playback', 'exitEditor'],
  },
  {
    id: 'preview-mode',
    title: 'Preview Mode',
    body: 'Preview mode is a 2D recreation of DanceRail3. Use the I key to switch to Preview Mode.',
    objective: 'Press I, then start playback (Space or P) and let the chart finish.',
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
