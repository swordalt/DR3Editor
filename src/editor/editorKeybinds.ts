import { translations } from '../lang';

export const EDITOR_KEYBIND_GROUPS = [
  {
    title: translations.hotkeys.playbackAndNavigation,
    bindings: [
      { keys: ['Space'], description: translations.hotkeys.playPause },
      { keys: ['I'], description: translations.hotkeys.togglePreviewMode },
      { keys: ['Mouse wheel'], description: translations.hotkeys.mouseWheel },
    ],
  },
  {
    title: translations.hotkeys.gridAndView,
    bindings: [
      { keys: ['W'], description: translations.hotkeys.increaseSnapBy4 },
      { keys: ['S'], description: translations.hotkeys.decreaseSnapBy4 },
      { keys: ['Shift', 'W'], description: translations.hotkeys.increaseSnapBy1 },
      { keys: ['Shift', 'S'], description: translations.hotkeys.decreaseSnapBy1 },
      { keys: ['R'], description: translations.hotkeys.zoomIn },
      { keys: ['F'], description: translations.hotkeys.zoomOut },
    ],
  },
  {
    title: translations.hotkeys.noteTools,
    bindings: [
      { keys: ['A'], description: translations.hotkeys.previousNoteType },
      { keys: ['D'], description: translations.hotkeys.nextNoteType },
      { keys: ['Q'], description: translations.hotkeys.decreaseNoteWidth },
      { keys: ['E'], description: translations.hotkeys.increaseNoteWidth },
    ],
  },
  {
    title: translations.hotkeys.canvasEditing,
    bindings: [
      { keys: ['Ctrl', 'Z'], description: translations.hotkeys.undo },
      { keys: ['Ctrl', 'Y'], description: translations.hotkeys.redo },
      { keys: ['Left click'], description: translations.hotkeys.placeNote },
      { keys: ['Right click'], description: translations.hotkeys.deleteClickedNote },
      { keys: ['Middle click note'], description: translations.hotkeys.selectClickedNote },
      { keys: ['Middle drag empty space'], description: translations.hotkeys.drawSelectionBox },
      { keys: ['Ctrl', 'Left click note'], description: translations.hotkeys.toggleNoteSelection },
      { keys: ['Shift', 'Left click note'], description: translations.hotkeys.moveClickedNote },
      { keys: ['Shift', 'Middle click note'], description: translations.hotkeys.moveClickedNote },
      { keys: ['Ctrl', 'C'], description: translations.hotkeys.copySelectedNotes },
      { keys: ['Ctrl', 'V'], description: translations.hotkeys.pasteCopiedNotes },
      { keys: ['Ctrl', 'Shift', 'V'], description: translations.hotkeys.mirrorPasteCopiedNotes },
      { keys: ['Delete'], description: translations.hotkeys.deleteSelectedNotes },
      { keys: ['Backspace'], description: translations.hotkeys.deleteSelectedNotes },
    ],
  },
  {
    title: translations.hotkeys.fields,
    bindings: [
      { keys: ['Enter'], description: translations.hotkeys.commitField },
    ],
  },
] as const;
