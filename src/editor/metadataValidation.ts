import type { EditorFormData } from '../types/editorTypes';

export type MetadataField = 'songId' | 'songBpm' | 'difficulty' | 'songFile';
export type MetadataTouchedFields = Partial<Record<MetadataField, boolean>>;
export type MetadataInvalidFields = Record<MetadataField, boolean>;

export const METADATA_REQUIRED_FIELDS: MetadataField[] = ['songId', 'songBpm', 'difficulty', 'songFile'];
export const SONG_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
export const DIFFICULTY_PATTERN = /^\d+$/;
export const SONG_BPM_PATTERN = /^(?:\d+\.?\d*|\.\d+)$/;

export const isValidSongId = (songId: string) => SONG_ID_PATTERN.test(songId.trim());

export const isValidSongBpm = (songBpm: string) => {
  const trimmedSongBpm = songBpm.trim();
  return SONG_BPM_PATTERN.test(trimmedSongBpm) && Number(trimmedSongBpm) > 0;
};

export const isValidDifficulty = (difficulty: string) => DIFFICULTY_PATTERN.test(difficulty.trim());

export const getInvalidMetadataFields = (formData: EditorFormData): MetadataInvalidFields => ({
  songId: !isValidSongId(formData.songId),
  songBpm: !isValidSongBpm(formData.songBpm),
  difficulty: !isValidDifficulty(formData.difficulty),
  songFile: formData.songFile === null,
});

export const hasInvalidMetadataFields = (invalidFields: MetadataInvalidFields) => (
  METADATA_REQUIRED_FIELDS.some(field => invalidFields[field])
);
