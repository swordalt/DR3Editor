export interface NoteTypeDefinition {
  name: string;
  color: string;
  sound: string | null;
}

export const UNKNOWN_NOTE_TYPE: NoteTypeDefinition = {
  name: 'Unknown',
  color: '#ffffff',
  sound: null,
};

export const HOLD_CONNECTOR_TYPES = [3, 4, 5, 6, 7, 8, 10, 11, 17, 18, 19, 20, 21, 22, 23, 24];
export const HOLD_START_TYPES = [3, 5, 10];
export const HOLD_CENTER_TYPES = [6, 11, 17, 19, 21, 23];
export const HOLD_END_TYPES = [4, 7, 18, 20, 22, 24];
export const OFFICIAL_NOTE_SPEED_LOCKED_TYPES = [...HOLD_CENTER_TYPES, ...HOLD_END_TYPES];

export const canTypeHaveParent = (type: number) => HOLD_CENTER_TYPES.includes(type) || HOLD_END_TYPES.includes(type);
export const shouldOmitParentForType = (type: number) => !canTypeHaveParent(type);
export const isOfficialNoteSpeedLockedType = (type: number) => OFFICIAL_NOTE_SPEED_LOCKED_TYPES.includes(type);

export const getConnectorFill = (noteType: number) => {
  const color = (NOTE_TYPES[noteType] || UNKNOWN_NOTE_TYPE).color;
  const alpha = [10, 17, 18].includes(noteType) ? '70' : '40';
  return `${color}${alpha}`;
};

export const NOTE_TYPES: Record<number, NoteTypeDefinition> = {
  1: { name: 'Blue Tap', color: '#0080ff', sound: 'hit.ogg' },
  2: { name: 'Yellow Tap', color: '#ffc864', sound: 'hit.ogg' },
  3: { name: 'Orange Hold Start', color: '#ffc0a0', sound: 'hit.ogg' },
  4: { name: 'Orange Hold End', color: '#ff8040', sound: 'hit.ogg' },
  5: { name: 'Blue Hold Start', color: '#80c0ff', sound: 'hit.ogg' },
  6: { name: 'Blue Hold Center', color: '#80c0ff', sound: null },
  7: { name: 'Blue Hold End', color: '#80c0ff', sound: 'hit.ogg' },
  9: { name: 'Circle Flick', color: '#00ffff', sound: 'flick.ogg' },
  10: { name: 'Damage', color: '#870000', sound: 'hit.ogg' },
  11: { name: 'Orange Hold Center', color: '#ff8040', sound: null },
  13: { name: 'Flick Left', color: '#00ffff', sound: 'flick.ogg' },
  14: { name: 'Flick Right', color: '#ff80ff', sound: 'flick.ogg' },
  15: { name: 'Flick Up', color: '#00ff80', sound: 'flick.ogg' },
  16: { name: 'Flick Down', color: '#8000ff', sound: 'flick.ogg' },
  17: { name: 'Damage Middle', color: '#700000', sound: null },
  18: { name: 'Damage End', color: '#700000', sound: 'hit.ogg' },
  19: { name: 'Green Hold Center', color: '#68ff3f', sound: null },
  20: { name: 'Green Hold End', color: '#68ff3f', sound: 'hit.ogg' },
  21: { name: 'Yellow Hold Center', color: '#f8ff3f', sound: null },
  22: { name: 'Yellow Hold End', color: '#f8ff3f', sound: 'hit.ogg' },
  23: { name: 'Pink Hold Center', color: '#feb4b4', sound: null },
  24: { name: 'Pink Hold End', color: '#feb4b4', sound: 'hit.ogg' },
  25: { name: '2-Finger Tap', color: '#00fc41', sound: 'hit.ogg' },
  26: { name: '3-Finger Tap', color: '#fc8500', sound: 'hit.ogg' },
  27: { name: '4-Finger Tap', color: '#ff0000', sound: 'hit.ogg' },
};

export const AVAILABLE_NOTE_TYPES = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27];
