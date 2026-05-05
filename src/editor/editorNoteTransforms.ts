import { X_POSITION_COUNT } from './editorViewConstants';

export const getMirroredNoteLane = (note: { lane: number; width: number }) => (
  X_POSITION_COUNT - note.lane - note.width
);
