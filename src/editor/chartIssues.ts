import { NOTE_TYPES, canTypeHaveParent } from '../constants/editorConstants';
import type { Note } from '../types/editorTypes';
import { formatTranslation, translations } from '../lang';
import { formatHistoryNumber, formatNoteLane, formatTimingPosition } from './editorHistory';
import { PINK_HOLD_CENTER_TYPE, PINK_HOLD_END_TYPE, SNAP_EPSILON } from './editorViewConstants';
import { buildPreviewCameraMovementIntervals, getPreviewCameraXPositionOffset } from './previewPlayback';

export type ChartIssueSeverity = 'warning';
export type ChartIssueCategory = 'overlap' | 'hold' | 'note' | 'camera';

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
const CAMERA_CENTER_X_POSITION = 8;
const CAMERA_X_POSITION_HALF_RANGE = 10;
const GOOD_HIT_WINDOW_SECONDS = 0.1;
const POSITION_EPSILON = 0.000001;

const getNoteEndLane = (note: Note) => note.lane + note.width;
const hasFiniteHorizontalBounds = (note: Note) => (
  Number.isFinite(note.lane)
  && Number.isFinite(note.width)
  && Number.isFinite(getNoteEndLane(note))
);

const doesNoteCoverXPosition = (coveringNote: Note, coveredNote: Note) => (
  coveringNote.lane <= coveredNote.lane + POSITION_EPSILON
  && getNoteEndLane(coveringNote) >= getNoteEndLane(coveredNote) - POSITION_EPSILON
);

const formatNotePosition = (note: Note) => `x${formatNoteLane(note.lane)} w${formatHistoryNumber(note.width)}`;
const formatIssueTimepos = (timepos: number | null) => (
  timepos === null ? translations.chartIssues.unknownTimepos : formatTimingPosition(timepos)
);

const isPinkCameraNote = (note: Note) => (
  note.type === PINK_HOLD_CENTER_TYPE || note.type === PINK_HOLD_END_TYPE
);

const buildCameraMovementSegments = (notes: Note[], notesById: Map<number, Note>) => notes
  .filter(note => isPinkCameraNote(note) && note.parentId !== null)
  .map((note) => {
    const parentNote = notesById.get(note.parentId ?? 0);
    if (!parentNote) {
      return null;
    }

    if (!Number.isFinite(parentNote.time) || !Number.isFinite(note.time)) {
      return null;
    }

    if (!hasFiniteHorizontalBounds(parentNote) || !hasFiniteHorizontalBounds(note)) {
      return null;
    }

    const parentCenter = parentNote.lane + parentNote.width / 2;
    const noteCenter = note.lane + note.width / 2;
    const deltaXPosition = noteCenter - parentCenter;

    if (!Number.isFinite(deltaXPosition)) {
      return null;
    }

    return {
      startTime: parentNote.time,
      endTime: note.time,
      deltaXPosition,
    };
  })
  .filter((segment): segment is NonNullable<typeof segment> => (
    segment !== null && Math.abs(segment.deltaXPosition) > SNAP_EPSILON
  ))
  .sort((a, b) => (a.endTime - b.endTime) || (a.startTime - b.startTime));

const doRangesOverlap = (
  firstMin: number,
  firstMax: number,
  secondMin: number,
  secondMax: number,
) => (
  firstMax >= secondMin - POSITION_EPSILON
  && firstMin <= secondMax + POSITION_EPSILON
);

const isCameraXPositionRangeHittable = (
  cameraXPositionMin: number,
  cameraXPositionMax: number,
  note: Note,
) => doRangesOverlap(
  Math.min(cameraXPositionMin, cameraXPositionMax),
  Math.max(cameraXPositionMin, cameraXPositionMax),
  note.lane - CAMERA_X_POSITION_HALF_RANGE,
  getNoteEndLane(note) + CAMERA_X_POSITION_HALF_RANGE,
);

const canNoteBeHitWithinCameraRange = (
  cameraMovementIntervals: ReturnType<typeof buildPreviewCameraMovementIntervals>,
  note: Note,
) => {
  const hitWindowStartTime = note.time - GOOD_HIT_WINDOW_SECONDS;
  const hitWindowEndTime = note.time + GOOD_HIT_WINDOW_SECONDS;
  let uncheckedStartTime = hitWindowStartTime;

  for (const interval of cameraMovementIntervals) {
    if (interval.endTime < hitWindowStartTime - SNAP_EPSILON) {
      continue;
    }

    if (interval.startTime > hitWindowEndTime + SNAP_EPSILON) {
      break;
    }

    const gapEndTime = Math.min(interval.startTime, hitWindowEndTime);
    if (
      gapEndTime > uncheckedStartTime + SNAP_EPSILON
      && isCameraXPositionRangeHittable(CAMERA_CENTER_X_POSITION, CAMERA_CENTER_X_POSITION, note)
    ) {
      return true;
    }

    const overlapStartTime = Math.max(hitWindowStartTime, interval.startTime);
    const overlapEndTime = Math.min(hitWindowEndTime, interval.endTime);
    if (overlapEndTime >= overlapStartTime - SNAP_EPSILON) {
      const startCameraXPosition = CAMERA_CENTER_X_POSITION
        + interval.offsetAtStart
        + interval.slope * (overlapStartTime - interval.startTime);
      const endCameraXPosition = CAMERA_CENTER_X_POSITION
        + interval.offsetAtStart
        + interval.slope * (overlapEndTime - interval.startTime);

      if (isCameraXPositionRangeHittable(startCameraXPosition, endCameraXPosition, note)) {
        return true;
      }

      uncheckedStartTime = Math.max(uncheckedStartTime, overlapEndTime);
    }
  }

  return (
    uncheckedStartTime < hitWindowEndTime - SNAP_EPSILON
    && isCameraXPositionRangeHittable(CAMERA_CENTER_X_POSITION, CAMERA_CENTER_X_POSITION, note)
  );
};

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
    if (note.type in NOTE_TYPES) {
      return;
    }

    const timepos = timeposByNoteId.get(note.id) ?? null;
    issues.push({
      id: nextIssueId++,
      severity: 'warning',
      category: 'note',
      title: translations.chartIssues.unknownNoteTypeTitle,
      detail: formatTranslation(translations.chartIssues.unknownNoteTypeDetail, {
        noteId: note.id,
        noteType: note.type,
        timepos: formatIssueTimepos(timepos),
        position: formatNotePosition(note),
      }),
      noteIds: [note.id],
      timepos,
    });
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
      title: translations.chartIssues.missingHoldParentTitle,
      detail: formatTranslation(translations.chartIssues.missingHoldParentDetail, {
        noteId: note.id,
        parentId: note.parentId ?? '',
      }),
      noteIds: [note.id],
      timepos,
    });
  });

  notes.forEach((note) => {
    if (!canTypeHaveParent(note.type) || note.parentId === null) {
      return;
    }

    const parentNote = notesById.get(note.parentId);
    if (!parentNote || !Number.isFinite(note.time) || !Number.isFinite(parentNote.time)) {
      return;
    }

    if (note.time + SNAP_EPSILON >= parentNote.time) {
      return;
    }

    const timepos = timeposByNoteId.get(note.id) ?? null;
    issues.push({
      id: nextIssueId++,
      severity: 'warning',
      category: 'hold',
      title: translations.chartIssues.holdChildBeforeParentTitle,
      detail: formatTranslation(translations.chartIssues.holdChildBeforeParentDetail, {
        noteId: note.id,
        parentId: parentNote.id,
      }),
      noteIds: [parentNote.id, note.id],
      timepos,
    });
  });

  if (notes.some(isPinkCameraNote)) {
    const cameraMovementSegments = buildCameraMovementSegments(notes, notesById);
    const cameraMovementIntervals = buildPreviewCameraMovementIntervals(cameraMovementSegments);

    notes.forEach((note) => {
      if (DAMAGE_NOTE_TYPES.has(note.type)) {
        return;
      }

      if (!Number.isFinite(note.time) || !hasFiniteHorizontalBounds(note)) {
        return;
      }

      if (canNoteBeHitWithinCameraRange(cameraMovementIntervals, note)) {
        return;
      }

      const cameraXPosition = CAMERA_CENTER_X_POSITION + getPreviewCameraXPositionOffset(cameraMovementIntervals, note.time);
      if (!Number.isFinite(cameraXPosition)) {
        return;
      }

      const minVisibleXPosition = cameraXPosition - CAMERA_X_POSITION_HALF_RANGE;
      const maxVisibleXPosition = cameraXPosition + CAMERA_X_POSITION_HALF_RANGE;

      const timepos = timeposByNoteId.get(note.id) ?? null;
      issues.push({
        id: nextIssueId++,
        severity: 'warning',
        category: 'camera',
        title: translations.chartIssues.noteOutsideCameraRangeTitle,
        detail: formatTranslation(translations.chartIssues.noteOutsideCameraRangeDetail, {
          noteId: note.id,
          position: formatNotePosition(note),
          minX: formatNoteLane(minVisibleXPosition),
          maxX: formatNoteLane(maxVisibleXPosition),
          timepos: formatIssueTimepos(timepos),
          cameraX: formatNoteLane(cameraXPosition),
        }),
        noteIds: [note.id],
        timepos,
      });
    });
  }

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
          title: translations.chartIssues.damageNoteCoversNoteTitle,
          detail: formatTranslation(translations.chartIssues.damageNoteCoversNoteDetail, {
            damageNoteId: damageNote.id,
            damagePosition: formatNotePosition(damageNote),
            noteId: nonDamageNote.id,
            notePosition: formatNotePosition(nonDamageNote),
            timepos: formatIssueTimepos(timepos),
          }),
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
