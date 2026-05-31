import { formatTranslation, translations } from '../lang';

export interface NoteTypeDefinition {
  name: string;
  color: string;
  sound: string | null;
}

export const UNKNOWN_NOTE_TYPE: NoteTypeDefinition = {
  name: translations.noteTypes.unknown,
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
  1: { name: translations.noteTypes[1], color: '#0080ff', sound: 'hit.ogg' },
  2: { name: translations.noteTypes[2], color: '#ffc864', sound: 'hit.ogg' },
  3: { name: translations.noteTypes[3], color: '#ffc0a0', sound: 'hit.ogg' },
  4: { name: translations.noteTypes[4], color: '#ff8040', sound: 'hit.ogg' },
  5: { name: translations.noteTypes[5], color: '#80c0ff', sound: 'hit.ogg' },
  6: { name: translations.noteTypes[6], color: '#80c0ff', sound: null },
  7: { name: translations.noteTypes[7], color: '#80c0ff', sound: 'hit.ogg' },
  9: { name: translations.noteTypes[9], color: '#00ffff', sound: 'flick.ogg' },
  10: { name: translations.noteTypes[10], color: '#870000', sound: 'hit.ogg' },
  11: { name: translations.noteTypes[11], color: '#ff8040', sound: null },
  13: { name: translations.noteTypes[13], color: '#00ffff', sound: 'flick.ogg' },
  14: { name: translations.noteTypes[14], color: '#ff80ff', sound: 'flick.ogg' },
  15: { name: translations.noteTypes[15], color: '#00ff80', sound: 'flick.ogg' },
  16: { name: translations.noteTypes[16], color: '#8000ff', sound: 'flick.ogg' },
  17: { name: translations.noteTypes[17], color: '#700000', sound: null },
  18: { name: translations.noteTypes[18], color: '#700000', sound: 'hit.ogg' },
  19: { name: translations.noteTypes[19], color: '#68ff3f', sound: null },
  20: { name: translations.noteTypes[20], color: '#68ff3f', sound: 'hit.ogg' },
  21: { name: translations.noteTypes[21], color: '#f8ff3f', sound: null },
  22: { name: translations.noteTypes[22], color: '#f8ff3f', sound: 'hit.ogg' },
  23: { name: translations.noteTypes[23], color: '#feb4b4', sound: null },
  24: { name: translations.noteTypes[24], color: '#feb4b4', sound: 'hit.ogg' },
  25: { name: translations.noteTypes[25], color: '#00fc41', sound: 'hit.ogg' },
  26: { name: translations.noteTypes[26], color: '#fc8500', sound: 'hit.ogg' },
  27: { name: translations.noteTypes[27], color: '#ff0000', sound: 'hit.ogg' },
};

export const AVAILABLE_NOTE_TYPES = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27];
export const formatUnknownNoteTypeName = (type: number) => formatTranslation(translations.noteTypes.type, { type });
