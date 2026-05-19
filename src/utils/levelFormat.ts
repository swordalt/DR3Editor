import type { BpmChange, Note, ProjectData, SpeedChange } from '../types/editorTypes';
import { HOLD_START_TYPES } from '../constants/editorConstants';
import { convertBpmChangesToTime, getActiveChange, getBeatAtTime, getBpmChangeTimepos, getTimeAtBeat } from './editorUtils';

export interface ParsedLevelData {
  notes: Note[];
  bpmChanges: BpmChange[];
  speedChanges: SpeedChange[];
  offset: number;
}

export interface LevelTextValidationError {
  lineNumber: number;
  message: string;
}

const DEFAULT_BPM_CHANGE: BpmChange = {
  timepos: 0,
  bpm: 120,
  timeSignature: '4/4',
};

const APPEAR_MODES = new Set(['L', 'R', 'H', 'P', 'N']);
const CHART_NUMBER_PATTERN = '-?(?:\\d+\\.?\\d*|\\.\\d+)';
const NON_NEGATIVE_CHART_NUMBER_PATTERN = '(?:\\d+\\.?\\d*|\\.\\d+)';

const formatChartNumber = (value: number, precision = 3) => {
  const roundedValue = Number(value.toFixed(precision));
  return Object.is(roundedValue, -0) ? '0' : roundedValue.toString();
};

const trimNumericTextTrailingZeros = (value: string) => (
  value.replace(/-?\d+(?:\.\d+)?/g, (numericText) => formatChartNumber(Number(numericText)))
);

const parseIndexedNumericValue = (line: string, prefix: string) => {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = line.match(new RegExp(`^${escapedPrefix}\\[(\\d+)\\]=(\\d+\\.?\\d*);$`));
  if (!match) {
    return null;
  }

  return {
    index: parseInt(match[1], 10),
    value: parseFloat(match[2]),
  };
};

const convertTimeposToBpmChange = (timepos: number, bpm: number): BpmChange => {
  return {
    timepos,
    bpm,
    timeSignature: '4/4',
  };
};

export function validateLevelText(text: string): LevelTextValidationError | null {
  const lines = text.split('\n');

  for (const [index, line] of lines.entries()) {
    const normalizedLine = line.trim();
    const lineNumber = index + 1;

    if (normalizedLine === '') {
      continue;
    }

    if (new RegExp(`^#OFFSET=${CHART_NUMBER_PATTERN};$`).test(normalizedLine)) {
      continue;
    }

    if (normalizedLine === '#BEAT=1;') {
      continue;
    }

    if (/^#BPM_NUMBER=\d+;$/.test(normalizedLine)) {
      continue;
    }

    if (new RegExp(`^#BPM \\[\\d+\\]=${NON_NEGATIVE_CHART_NUMBER_PATTERN};$`).test(normalizedLine)) {
      continue;
    }

    if (new RegExp(`^#BPMS\\[\\d+\\]=${NON_NEGATIVE_CHART_NUMBER_PATTERN};$`).test(normalizedLine)) {
      continue;
    }

    if (/^#SCN=\d+;$/.test(normalizedLine)) {
      continue;
    }

    if (new RegExp(`^#SC \\[\\d+\\]=${CHART_NUMBER_PATTERN};$`).test(normalizedLine)) {
      continue;
    }

    if (new RegExp(`^#SCI\\[\\d+\\]=${NON_NEGATIVE_CHART_NUMBER_PATTERN};$`).test(normalizedLine)) {
      continue;
    }

    if (normalizedLine.startsWith('<')) {
      const columns = [...normalizedLine.matchAll(/<([^>]*)>/g)].map((match) => match[1]);
      const reconstructedLine = columns.map(column => `<${column}>`).join('');

      if (reconstructedLine !== normalizedLine || (columns.length !== 7 && columns.length !== 8)) {
        return { lineNumber, message: 'Note lines must contain 7 fields, plus optional appear mode.' };
      }

      const [id, type, beatPos, lane, width, speed, parentId, appearMode] = columns;
      const numericValues = [
        { label: 'note ID', value: id, integer: true },
        { label: 'note type', value: type, integer: true },
        { label: 'time position', value: beatPos, integer: false },
        { label: 'x position', value: lane, integer: false },
        { label: 'width', value: width, integer: false },
        { label: 'parent ID', value: parentId, integer: true },
      ];

      for (const numericValue of numericValues) {
        const parsedValue = Number(numericValue.value);
        if (!Number.isFinite(parsedValue) || (numericValue.integer && !Number.isInteger(parsedValue))) {
          return { lineNumber, message: `Invalid ${numericValue.label}.` };
        }
      }

      if (speed.replace(/\s+/g, '') === '') {
        return { lineNumber, message: 'Note speed cannot be empty.' };
      }

      if (appearMode && !APPEAR_MODES.has(appearMode.trim().toUpperCase())) {
        return { lineNumber, message: 'Appear mode must be L, R, H, P, or N.' };
      }

      continue;
    }

    return { lineNumber, message: 'Unrecognized chart line.' };
  }

  return null;
}

export function parseValidatedLevelText(text: string): ParsedLevelData {
  const validationError = validateLevelText(text);

  if (validationError) {
    throw Object.assign(new Error(validationError.message), validationError);
  }

  return parseLevelText(text);
}

export function parseLevelText(text: string): ParsedLevelData {
  const lines = text.split('\n');
  const notes: Note[] = [];
  const bpmValues = new Map<number, number>();
  const bpmPositions = new Map<number, number>();
  const speedChanges: SpeedChange[] = [];
  let offset = 0;

  for (const [index, line] of lines.entries()) {
    const normalizedLine = line.trim();

    if (normalizedLine.startsWith('#OFFSET=')) {
      offset = parseFloat(normalizedLine.split('=')[1]) * -1000;
      continue;
    }

    const bpmValueEntry = parseIndexedNumericValue(normalizedLine, '#BPM ');
    if (bpmValueEntry) {
      bpmValues.set(bpmValueEntry.index, bpmValueEntry.value);
      continue;
    }

    const bpmPositionEntry = parseIndexedNumericValue(normalizedLine, '#BPMS');
    if (bpmPositionEntry) {
      bpmPositions.set(bpmPositionEntry.index, bpmPositionEntry.value);
      continue;
    }

    if (normalizedLine.startsWith('#SC [')) {
      const match = normalizedLine.match(/#SC \[(\d+)\]=(-?\d+\.?\d*);/);
      const sciMatch = lines[index + 1]?.trim().match(/#SCI\[(\d+)\]=(\d+\.?\d*);/);
      if (match && sciMatch) {
        const speedChange = parseFloat(match[2]);
        const sci = parseFloat(sciMatch[2]);
        speedChanges.push({
          timepos: sci,
          speedChange,
        });
      }
      continue;
    }

    if (!normalizedLine.startsWith('<')) {
      continue;
    }

    const columns = [...normalizedLine.matchAll(/<([^>]*)>/g)].map((match) => match[1]);
    if (columns.length < 7) {
      continue;
    }

    const id = parseInt(columns[0], 10);
    const type = parseInt(columns[1], 10);
    const beatPos = parseFloat(columns[2]);
    const lane = parseFloat(columns[3]);
    const width = parseFloat(columns[4]);
    const speed = columns[5].replace(/\s+/g, '');
    const parsedParentId = parseInt(columns[6], 10);
    const importedAppearMode = columns[7]?.trim().toUpperCase();
    const appearMode = importedAppearMode && APPEAR_MODES.has(importedAppearMode)
      ? importedAppearMode as Note['appearMode']
      : undefined;

    if ([id, type, beatPos, lane, width, parsedParentId].some((value) => Number.isNaN(value)) || speed === '') {
      continue;
    }

    const bpmChanges = Array.from(bpmValues.entries())
      .map(([entryIndex, bpm]) => convertTimeposToBpmChange(bpmPositions.get(entryIndex) ?? 0, bpm))
      .sort((a, b) => getBpmChangeTimepos(a) - getBpmChangeTimepos(b))
      .filter((change, entryIndex, changes) => {
        if (entryIndex === 0) {
          return true;
        }

        const previous = changes[entryIndex - 1];
        return getBpmChangeTimepos(previous) !== getBpmChangeTimepos(change) || previous.bpm !== change.bpm;
      });

    const timedBpmChanges = convertBpmChangesToTime(
      bpmChanges.length > 0
        ? bpmChanges
        : [DEFAULT_BPM_CHANGE],
    );

    notes.push({
      id,
      time: getTimeAtBeat(beatPos * 4, timedBpmChanges),
      lane,
      type,
      width,
      speed,
      parentId: parsedParentId >= 0 ? parsedParentId : null,
      appearMode,
    });
  }

  const bpmChanges = Array.from(bpmValues.entries())
    .map(([index, bpm]) => convertTimeposToBpmChange(bpmPositions.get(index) ?? 0, bpm))
    .sort((a, b) => getBpmChangeTimepos(a) - getBpmChangeTimepos(b))
    .filter((change, index, changes) => {
      if (index === 0) {
        return true;
      }

      const previous = changes[index - 1];
      return getBpmChangeTimepos(previous) !== getBpmChangeTimepos(change) || previous.bpm !== change.bpm;
    });

  return { notes, bpmChanges, speedChanges, offset };
}

export function buildLevelText(params: {
  projectData?: ProjectData | null;
  notes: Note[];
  bpmChanges: BpmChange[];
  speedChanges: SpeedChange[];
  offset: string | number;
}): string {
  const { notes, bpmChanges, speedChanges, offset } = params;
  const getSerializedParentId = (note: Note) => (HOLD_START_TYPES.includes(note.type) ? 0 : (note.parentId ?? 0));
  const getSerializedSpeed = (note: Note) => {
    const normalizedSpeed = note.speed?.replace(/\s+/g, '');
    if (!normalizedSpeed) {
      return '1';
    }

    const numericSpeed = Number(normalizedSpeed);
    return Number.isFinite(numericSpeed) ? formatChartNumber(numericSpeed) : trimNumericTextTrailingZeros(normalizedSpeed);
  };
  const normalizedBpmChanges = [...(bpmChanges.length > 0 ? bpmChanges : [DEFAULT_BPM_CHANGE])]
    .sort((a, b) => getBpmChangeTimepos(a) - getBpmChangeTimepos(b));
  const normalizedSpeedChanges = [...speedChanges]
    .sort((a, b) => a.timepos - b.timepos);
  const formatTimepos = (change: BpmChange) => formatChartNumber(getBpmChangeTimepos(change));

  let content = `#OFFSET=${formatChartNumber(parseFloat(offset.toString()) / -1000)};\n`;
  content += '#BEAT=1;\n';
  content += `#BPM_NUMBER=${normalizedBpmChanges.length};\n`;
  normalizedBpmChanges.forEach((change, index) => {
    content += `#BPM [${index}]=${formatChartNumber(change.bpm)};\n`;
    content += `#BPMS[${index}]=${formatTimepos(change)};\n`;
  });
  content += `#SCN=${normalizedSpeedChanges.length};\n`;

  normalizedSpeedChanges.forEach((change, index) => {
    content += `#SC [${index}]=${formatChartNumber(change.speedChange)};\n`;
    content += `#SCI[${index}]=${formatChartNumber(change.timepos)};\n`;
  });

  const sortedChanges = convertBpmChangesToTime(bpmChanges);

  notes.forEach((note) => {
    const totalBeats = getBeatAtTime(note.time, sortedChanges);

    let currentMeasureBeat = 0;
    let measureCount = 0;
    let currentBeatsPerMeasure = 4;

    while (measureCount < 10000) {
      const timeAtMeasure = getTimeAtBeat(currentMeasureBeat, sortedChanges);
      const activeChange = getActiveChange(timeAtMeasure + 0.001, sortedChanges);
      currentBeatsPerMeasure = parseInt(activeChange.timeSignature.split('/')[0], 10) || 4;

      if (totalBeats < currentMeasureBeat + currentBeatsPerMeasure) {
        break;
      }

      currentMeasureBeat += currentBeatsPerMeasure;
      measureCount++;
    }

    const beatInMeasure = totalBeats - currentMeasureBeat;
    const serializedAppearMode = note.appearMode && APPEAR_MODES.has(note.appearMode)
      ? `<${note.appearMode}>`
      : '';
    content += `<${note.id}><${note.type}><${formatChartNumber(measureCount + beatInMeasure / currentBeatsPerMeasure)}><${formatChartNumber(note.lane)}><${formatChartNumber(note.width)}><${getSerializedSpeed(note)}><${getSerializedParentId(note)}>${serializedAppearMode}\n`;
  });

  return content;
}
