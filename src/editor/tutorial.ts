import { translations } from '../lang';

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

const tutorialStepText = translations.tutorial.steps;

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'edit-chart-metadata',
    title: tutorialStepText.editChartMetadata.title,
    body: tutorialStepText.editChartMetadata.body,
    objective: tutorialStepText.editChartMetadata.objective,
    objectiveId: 'metadataSaved',
    dialoguePosition: 'right',
    focusTargets: ['leftSidebar'],
    allowedOperations: ['metadata', 'exitEditor'],
  },
  {
    id: 'edit-offset',
    title: tutorialStepText.editOffset.title,
    body: tutorialStepText.editOffset.body,
    objective: tutorialStepText.editOffset.objective,
    objectiveId: 'offsetEdited',
    dialoguePosition: 'right',
    focusTargets: ['leftSidebar'],
    allowedOperations: ['offset', 'exitEditor'],
  },
  {
    id: 'scroll-around',
    title: tutorialStepText.scrollAround.title,
    body: tutorialStepText.scrollAround.body,
    objective: tutorialStepText.scrollAround.objective,
    objectiveId: 'timelineScrolled',
    dialoguePosition: 'right',
    focusTargets: ['canvas'],
    allowedOperations: ['timelineScroll', 'exitEditor'],
  },
  {
    id: 'place-notes',
    title: tutorialStepText.placeNotes.title,
    body: tutorialStepText.placeNotes.body,
    objective: tutorialStepText.placeNotes.objective,
    objectiveId: 'notePlaced',
    dialoguePosition: 'right',
    focusTargets: ['canvas'],
    allowedOperations: ['canvasPointer', 'timelineScroll', 'exitEditor'],
  },
  {
    id: 'delete-notes',
    title: tutorialStepText.deleteNotes.title,
    body: tutorialStepText.deleteNotes.body,
    objective: tutorialStepText.deleteNotes.objective,
    objectiveId: 'noteDeleted',
    dialoguePosition: 'right',
    focusTargets: ['canvas'],
    allowedOperations: ['canvasPointer', 'timelineScroll', 'exitEditor'],
  },
  {
    id: 'change-note-type',
    title: tutorialStepText.changeNoteType.title,
    body: tutorialStepText.changeNoteType.body,
    objective: tutorialStepText.changeNoteType.objective,
    objectiveId: 'noteTypeSelected',
    dialoguePosition: 'topLeft',
    focusTargets: ['selectedNoteTypeIndicator'],
    allowedOperations: ['noteTypeHotkeys', 'exitEditor'],
  },
  {
    id: 'place-hold-notes',
    title: tutorialStepText.placeHoldNotes.title,
    body: tutorialStepText.placeHoldNotes.body,
    objective: tutorialStepText.placeHoldNotes.objective,
    objectiveId: 'holdSequencePlaced',
    dialoguePosition: 'topLeft',
    focusTargets: ['canvas', 'selectedNoteTypeIndicator'],
    allowedOperations: ['noteTypeHotkeys', 'canvasPointer', 'timelineScroll', 'exitEditor'],
  },
  {
    id: 'start-pause-playback',
    title: tutorialStepText.startPausePlayback.title,
    body: tutorialStepText.startPausePlayback.body,
    objective: tutorialStepText.startPausePlayback.objective,
    objectiveId: 'playbackMeasure2Completed',
    dialoguePosition: 'topLeft',
    focusTargets: ['canvas', 'topBar'],
    allowedOperations: ['playback', 'exitEditor'],
  },
  {
    id: 'preview-mode',
    title: tutorialStepText.previewMode.title,
    body: tutorialStepText.previewMode.body,
    objective: tutorialStepText.previewMode.objective,
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
