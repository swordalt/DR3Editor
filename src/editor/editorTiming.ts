import { getActiveChange, getTimeAtBeat } from '../utils/editorUtils';
import type { TimedBpmChange } from '../types/editorTypes';
import { SNAP_EPSILON } from './editorViewConstants';

export const getBeatsPerMeasureAtBeat = (beat: number, timedBpmChanges: TimedBpmChange[]) => {
  const timeAtBeat = getTimeAtBeat(Math.max(0, beat), timedBpmChanges);
  const activeChange = getActiveChange(timeAtBeat + 0.001, timedBpmChanges);
  return parseInt(activeChange.timeSignature.split('/')[0], 10) || 4;
};

export const getMeasureSpanAtBeat = (beat: number, timedBpmChanges: TimedBpmChange[]) => {
  let measureStartBeat = 0;
  let beatsPerMeasure = getBeatsPerMeasureAtBeat(measureStartBeat, timedBpmChanges);
  let measureEndBeat = measureStartBeat + beatsPerMeasure;
  let guard = 0;

  while (beat >= measureEndBeat - SNAP_EPSILON && guard < 10000) {
    measureStartBeat = measureEndBeat;
    beatsPerMeasure = getBeatsPerMeasureAtBeat(measureStartBeat, timedBpmChanges);
    measureEndBeat = measureStartBeat + beatsPerMeasure;
    guard += 1;
  }

  return { measureStartBeat, measureEndBeat, beatsPerMeasure };
};

export const snapBeatToMeasureDivision = (
  beat: number,
  divisionsPerMeasure: number,
  timedBpmChanges: TimedBpmChange[],
) => {
  const { measureStartBeat, measureEndBeat, beatsPerMeasure } = getMeasureSpanAtBeat(beat, timedBpmChanges);

  if (divisionsPerMeasure <= 0) {
    return Math.abs(beat - measureStartBeat) <= Math.abs(measureEndBeat - beat)
      ? measureStartBeat
      : measureEndBeat;
  }

  const step = beatsPerMeasure / divisionsPerMeasure;
  return measureStartBeat + Math.round((beat - measureStartBeat) / step) * step;
};

export const getBeatAtTimepos = (
  timepos: number,
  timedBpmChanges: TimedBpmChange[],
) => {
  const measureCount = Math.max(0, Math.floor(timepos));
  const measureDecimal = Math.max(0, timepos - measureCount);
  let currentMeasureBeat = 0;
  let currentBeatsPerMeasure = 4;

  for (let currentMeasure = 0; currentMeasure <= measureCount; currentMeasure += 1) {
    currentBeatsPerMeasure = getBeatsPerMeasureAtBeat(currentMeasureBeat, timedBpmChanges);

    if (currentMeasure < measureCount) {
      currentMeasureBeat += currentBeatsPerMeasure;
    }
  }

  return currentMeasureBeat + measureDecimal * currentBeatsPerMeasure;
};

export const getIndicatorKeyAtBeat = (beat: number) => beat.toFixed(6);

export const getCurveSnapBeatsBetween = (
  startBeat: number,
  endBeat: number,
  divisionsPerMeasure: number,
  timedBpmChanges: TimedBpmChange[],
) => {
  const minBeat = Math.min(startBeat, endBeat);
  const maxBeat = Math.max(startBeat, endBeat);

  if (maxBeat - minBeat <= SNAP_EPSILON || divisionsPerMeasure <= 0) {
    return [];
  }

  const snapBeats: number[] = [];
  const seenBeatKeys = new Set<string>();
  let { measureStartBeat, measureEndBeat, beatsPerMeasure } = getMeasureSpanAtBeat(minBeat, timedBpmChanges);
  let guard = 0;

  while (measureStartBeat <= maxBeat + SNAP_EPSILON && guard < 10000) {
    const step = beatsPerMeasure / divisionsPerMeasure;
    const firstDivision = Math.max(0, Math.ceil((minBeat - measureStartBeat) / step - SNAP_EPSILON));
    const lastDivision = Math.min(divisionsPerMeasure, Math.floor((maxBeat - measureStartBeat) / step + SNAP_EPSILON));

    for (let division = firstDivision; division <= lastDivision; division += 1) {
      const beat = measureStartBeat + division * step;

      if (beat <= minBeat + SNAP_EPSILON || beat >= maxBeat - SNAP_EPSILON) {
        continue;
      }

      const key = beat.toFixed(6);
      if (!seenBeatKeys.has(key)) {
        snapBeats.push(beat);
        seenBeatKeys.add(key);
      }
    }

    measureStartBeat = measureEndBeat;
    beatsPerMeasure = getBeatsPerMeasureAtBeat(measureStartBeat, timedBpmChanges);
    measureEndBeat = measureStartBeat + beatsPerMeasure;
    guard += 1;
  }

  snapBeats.sort((a, b) => a - b);
  return startBeat <= endBeat ? snapBeats : snapBeats.reverse();
};
