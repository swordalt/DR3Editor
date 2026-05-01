import { canTypeHaveParent } from '../constants/editorConstants';
import type { Note } from '../types/editorTypes';
import { formatHistoryNumber, formatNoteLane, formatTimingPosition } from './editorHistory';

export type ChartIssueSeverity = 'warning';
export type ChartIssueCategory = 'overlap' | 'hold';

export interface ChartIssue {
  id: number;
  severity: ChartIssueSeverity;
  category: ChartIssueCategory;
  title: string;
  detail: string;
  noteIds: number[];
  timepos: number | null;
}

const DAMAGE_NOTE_TYPES = new Set([10, 17, 18]);
const POSITION_EPSILON = 0.000001;

const getNoteEndLane = (note: Note) => note.lane + note.width;

const doesNoteCoverXPosition = (coveringNote: Note, coveredNote: Note) => (
  coveringNote.lane <= coveredNote.lane + POSITION_EPSILON
  && getNoteEndLane(coveringNote) >= getNoteEndLane(coveredNote) - POSITION_EPSILON
);

const formatNotePosition = (note: Note) => `x${formatNoteLane(note.lane)} w${formatHistoryNumber(note.width)}`;

export const findChartIssues = (
  notes: Note[],
  getTimeposFromTime: (time: number) => number,
): ChartIssue[] => {
  const issues: ChartIssue[] = [];
  const notesById = new Map(notes.map(note => [note.id, note]));
  const timeposByNoteId = new Map<number, number>();
  let nextIssueId = 1;

  notes.forEach((note) => {
    timeposByNoteId.set(note.id, getTimeposFromTime(note.time));
  });

  notes.forEach((note) => {
    if (!canTypeHaveParent(note.type) || note.parentId === null || notesById.has(note.parentId)) {
      return;
    }

    const timepos = timeposByNoteId.get(note.id) ?? null;
    issues.push({
      id: nextIssueId++,
      severity: 'warning',
      category: 'hold',
      title: 'Missing Hold Parent',
      detail: `Note #${note.id} -> missing parent #${note.parentId}`,
      noteIds: [note.id],
      timepos,
    });
  });

  const notesByTimepos = new Map<string, Note[]>();
  notes.forEach((note) => {
    const timepos = timeposByNoteId.get(note.id) ?? 0;
    const key = timepos.toFixed(6);
    notesByTimepos.set(key, [...(notesByTimepos.get(key) ?? []), note]);
  });

  for (const notesAtTimepos of notesByTimepos.values()) {
    const damageNotes = notesAtTimepos.filter(note => DAMAGE_NOTE_TYPES.has(note.type));
    const nonDamageNotes = notesAtTimepos.filter(note => !DAMAGE_NOTE_TYPES.has(note.type));

    damageNotes.forEach((damageNote) => {
      nonDamageNotes.forEach((nonDamageNote) => {
        if (!doesNoteCoverXPosition(damageNote, nonDamageNote)) {
          return;
        }

        const timepos = timeposByNoteId.get(nonDamageNote.id) ?? null;
        issues.push({
          id: nextIssueId++,
          severity: 'warning',
          category: 'overlap',
          title: 'Damage Note Covers Note',
          detail: `Damage #${damageNote.id} ${formatNotePosition(damageNote)} covers #${nonDamageNote.id} ${formatNotePosition(nonDamageNote)} at ${timepos === null ? 'unknown timepos' : formatTimingPosition(timepos)}`,
          noteIds: [damageNote.id, nonDamageNote.id],
          timepos,
        });
      });
    });
  }

  return issues.sort((a, b) => (
    (a.timepos ?? Number.POSITIVE_INFINITY) - (b.timepos ?? Number.POSITIVE_INFINITY)
    || a.id - b.id
  ));
};
