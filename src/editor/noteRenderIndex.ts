import { HOLD_CONNECTOR_TYPES, HOLD_START_TYPES } from '../constants/editorConstants';
import type { Note, TimedBpmChange } from '../types/editorTypes';
import { getBeatAtTime } from '../utils/editorUtils';
import { formatGroupedIds } from './editorHistory';

export interface NoteBeatEntry {
  note: Note;
  beat: number;
}

export interface HoldConnectorSegment {
  note: Note;
  parentNote: Note;
  noteBeat: number;
  parentBeat: number;
  minBeat: number;
  maxBeat: number;
}

export interface NoteRenderIndex {
  notesById: Map<number, Note>;
  noteBeats: Map<number, number>;
  noteBeatEntries: NoteBeatEntry[];
  noteBeatEntriesByLaneStart: NoteBeatEntry[];
  noteBeatEntriesByLaneEnd: NoteBeatEntry[];
  holdConnectorSegments: HoldConnectorSegment[];
  holdConnectorSegmentsByMinBeat: HoldConnectorSegment[];
  holdConnectorSegmentsByMaxBeat: HoldConnectorSegment[];
  groupedIdLabelsByNoteId: Map<number, string>;
}

const getNoteLaneStart = (entry: NoteBeatEntry) => Math.min(entry.note.lane, entry.note.lane + entry.note.width);
const getNoteLaneEnd = (entry: NoteBeatEntry) => Math.max(entry.note.lane, entry.note.lane + entry.note.width);

const findFirstLaneStartAfterIndex = (entries: NoteBeatEntry[], lane: number) => {
  let low = 0;
  let high = entries.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (getNoteLaneStart(entries[mid]) <= lane) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
};

const findFirstLaneEndIndex = (entries: NoteBeatEntry[], lane: number) => {
  let low = 0;
  let high = entries.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (getNoteLaneEnd(entries[mid]) < lane) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
};

export const getNoteBeatEntriesInViewport = (
  entriesByBeat: NoteBeatEntry[],
  entriesByLaneStart: NoteBeatEntry[],
  entriesByLaneEnd: NoteBeatEntry[],
  startBeat: number,
  endBeat: number,
  startLane: number,
  endLane: number,
) => {
  const firstBeatIndex = findFirstNoteBeatEntryIndex(entriesByBeat, startBeat);
  let beatLow = firstBeatIndex;
  let beatHigh = entriesByBeat.length;
  while (beatLow < beatHigh) {
    const mid = Math.floor((beatLow + beatHigh) / 2);
    if (entriesByBeat[mid].beat <= endBeat) beatLow = mid + 1;
    else beatHigh = mid;
  }
  const firstBeatAfterIndex = beatLow;
  const beatCandidateCount = firstBeatAfterIndex - firstBeatIndex;
  const firstLaneStartAfter = findFirstLaneStartAfterIndex(entriesByLaneStart, endLane);
  const firstLaneEnd = findFirstLaneEndIndex(entriesByLaneEnd, startLane);
  const laneEndCandidateCount = entriesByLaneEnd.length - firstLaneEnd;

  if (beatCandidateCount <= Math.min(firstLaneStartAfter, laneEndCandidateCount)) {
    const matchingEntries: NoteBeatEntry[] = [];
    for (let index = firstBeatIndex; index < firstBeatAfterIndex; index += 1) {
      const entry = entriesByBeat[index];
      if (getNoteLaneStart(entry) <= endLane && getNoteLaneEnd(entry) >= startLane) {
        matchingEntries.push(entry);
      }
    }
    return matchingEntries;
  }

  const matchingEntries: NoteBeatEntry[] = [];
  if (firstLaneStartAfter <= laneEndCandidateCount) {
    for (let index = 0; index < firstLaneStartAfter; index += 1) {
      const entry = entriesByLaneStart[index];
      if (
        getNoteLaneEnd(entry) >= startLane
        && entry.beat >= startBeat
        && entry.beat <= endBeat
      ) {
        matchingEntries.push(entry);
      }
    }
  } else {
    for (let index = firstLaneEnd; index < entriesByLaneEnd.length; index += 1) {
      const entry = entriesByLaneEnd[index];
      if (
        getNoteLaneStart(entry) <= endLane
        && entry.beat >= startBeat
        && entry.beat <= endBeat
      ) {
        matchingEntries.push(entry);
      }
    }
  }

  return matchingEntries.sort((a, b) => (a.beat - b.beat) || (a.note.id - b.note.id));
};

const findFirstNoteBeatEntryIndex = (entries: NoteBeatEntry[], beat: number) => {
  let low = 0;
  let high = entries.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (entries[mid].beat < beat) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
};

export const getNoteBeatEntriesInRange = (
  entries: NoteBeatEntry[],
  startBeat: number,
  endBeat: number,
) => {
  const matchingEntries: NoteBeatEntry[] = [];
  const firstEntryIndex = findFirstNoteBeatEntryIndex(entries, startBeat);

  for (let index = firstEntryIndex; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.beat > endBeat) {
      break;
    }

    matchingEntries.push(entry);
  }

  return matchingEntries;
};

const getNoteIdGroupKey = (note: Note, noteBeat: number) => {
  const centerPosition = note.lane + note.width / 2;
  return `${noteBeat.toFixed(6)}:${centerPosition.toFixed(6)}`;
};

const findFirstConnectorMaxBeatIndex = (segments: HoldConnectorSegment[], beat: number) => {
  let low = 0;
  let high = segments.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (segments[mid].maxBeat < beat) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
};

const findFirstConnectorMinBeatAfterIndex = (segments: HoldConnectorSegment[], beat: number) => {
  let low = 0;
  let high = segments.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (segments[mid].minBeat <= beat) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
};

export const getHoldConnectorSegmentsInRange = (
  segmentsByMinBeat: HoldConnectorSegment[],
  segmentsByMaxBeat: HoldConnectorSegment[],
  startBeat: number,
  endBeat: number,
) => {
  const matchingSegments: HoldConnectorSegment[] = [];
  const firstMaxBeatIndex = findFirstConnectorMaxBeatIndex(segmentsByMaxBeat, startBeat);
  const firstMinBeatAfterEndIndex = findFirstConnectorMinBeatAfterIndex(segmentsByMinBeat, endBeat);

  if (firstMinBeatAfterEndIndex <= segmentsByMaxBeat.length - firstMaxBeatIndex) {
    for (let index = 0; index < firstMinBeatAfterEndIndex; index += 1) {
      const segment = segmentsByMinBeat[index];
      if (segment.maxBeat >= startBeat) {
        matchingSegments.push(segment);
      }
    }

    return matchingSegments;
  }

  for (let index = firstMaxBeatIndex; index < segmentsByMaxBeat.length; index += 1) {
    const segment = segmentsByMaxBeat[index];
    if (segment.minBeat <= endBeat) {
      matchingSegments.push(segment);
    }
  }

  return matchingSegments;
};

export const buildNoteRenderIndex = (
  notes: Note[],
  timedBpmChanges: TimedBpmChange[],
): NoteRenderIndex => {
  const notesById = new Map<number, Note>();
  const noteBeats = new Map<number, number>();
  const noteBeatEntries: NoteBeatEntry[] = [];
  const holdConnectorSegments: HoldConnectorSegment[] = [];
  const groupedNoteIds = new Map<string, number[]>();
  const groupedIdLabelsByNoteId = new Map<number, string>();

  notes.forEach((note) => {
    const noteBeat = getBeatAtTime(note.time, timedBpmChanges);

    notesById.set(note.id, note);
    noteBeats.set(note.id, noteBeat);
    noteBeatEntries.push({ note, beat: noteBeat });

    const key = getNoteIdGroupKey(note, noteBeat);
    const groupedIds = groupedNoteIds.get(key);
    if (groupedIds) {
      groupedIds.push(note.id);
    } else {
      groupedNoteIds.set(key, [note.id]);
    }
  });

  noteBeatEntries.sort((a, b) => (a.beat - b.beat) || (a.note.id - b.note.id));
  const noteBeatEntriesByLaneStart = [...noteBeatEntries]
    .sort((a, b) => (getNoteLaneStart(a) - getNoteLaneStart(b)) || (a.note.id - b.note.id));
  const noteBeatEntriesByLaneEnd = [...noteBeatEntries]
    .sort((a, b) => (getNoteLaneEnd(a) - getNoteLaneEnd(b)) || (a.note.id - b.note.id));

  groupedNoteIds.forEach((groupedIds) => {
    const sortedGroupedIds = [...groupedIds].sort((a, b) => a - b);
    const [labelNoteId] = sortedGroupedIds;
    const label = formatGroupedIds(sortedGroupedIds);

    sortedGroupedIds.forEach((noteId) => {
      groupedIdLabelsByNoteId.set(noteId, noteId === labelNoteId ? label : '');
    });
  });

  notes.forEach((note) => {
    if (!HOLD_CONNECTOR_TYPES.includes(note.type) || HOLD_START_TYPES.includes(note.type) || note.parentId === null) {
      return;
    }

    const parentNote = notesById.get(note.parentId);
    const noteBeat = noteBeats.get(note.id);
    const parentBeat = parentNote ? noteBeats.get(parentNote.id) : undefined;

    if (!parentNote || noteBeat === undefined || parentBeat === undefined) {
      return;
    }

    holdConnectorSegments.push({
      note,
      parentNote,
      noteBeat,
      parentBeat,
      minBeat: Math.min(noteBeat, parentBeat),
      maxBeat: Math.max(noteBeat, parentBeat),
    });
  });

  const holdConnectorSegmentsByMinBeat = [...holdConnectorSegments]
    .sort((a, b) => (a.minBeat - b.minBeat) || (a.maxBeat - b.maxBeat) || (a.note.id - b.note.id));
  const holdConnectorSegmentsByMaxBeat = [...holdConnectorSegments]
    .sort((a, b) => (a.maxBeat - b.maxBeat) || (a.minBeat - b.minBeat) || (a.note.id - b.note.id));

  return {
    notesById,
    noteBeats,
    noteBeatEntries,
    noteBeatEntriesByLaneStart,
    noteBeatEntriesByLaneEnd,
    holdConnectorSegments,
    holdConnectorSegmentsByMinBeat,
    holdConnectorSegmentsByMaxBeat,
    groupedIdLabelsByNoteId,
  };
};
