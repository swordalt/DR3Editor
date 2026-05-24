import type { Note, SpeedChange } from '../types/editorTypes';
import { APPEAR_MODE_ENTRY_DISTANCE, APPEAR_MODE_H_ENTRY_PROGRESS_EXPONENT, APPEAR_MODE_H_FLY_DOWN_PIXELS, APPEAR_MODE_H_START_SCALE, APPEAR_MODE_SIDE_ENTRY_MULTIPLIER, PREVIEW_CONNECTOR_TILT_DIVISOR, SNAP_EPSILON, X_POSITION_COUNT } from './editorViewConstants';
import type { PreviewCameraMovementInterval, PreviewCameraMovementSegment, PreviewCameraTiltInterval, PreviewCameraTiltSegment, PreviewHoldConnectorSegment, PreviewJudgementNoteEntry, PreviewNotePosition, PreviewNoteRenderEntry, PreviewNoteSpeed, PreviewNoteSpeedKeyframe, SpeedDistancePoint } from './editorLocalTypes';

export const buildSpeedDistanceIndex = (speedChanges: SpeedChange[]) => {
  const sortedSpeedChanges = [...speedChanges].sort((a, b) => a.timepos - b.timepos);
  const points: SpeedDistancePoint[] = [{
    timepos: 0,
    distance: 0,
    speed: 1,
  }];
  let distance = 0;
  let activeSpeed = 1;
  let previousTimepos = 0;

  sortedSpeedChanges.forEach((change) => {
    const changeTimepos = Math.max(0, change.timepos);
    const clampedChangeTimepos = Math.max(previousTimepos, changeTimepos);
    distance += activeSpeed * (clampedChangeTimepos - previousTimepos);
    activeSpeed = change.speedChange;
    previousTimepos = clampedChangeTimepos;
    points.push({
      timepos: clampedChangeTimepos,
      distance,
      speed: activeSpeed,
    });
  });

  return points;
};

export const getSpeedDistanceAtTimepos = (timepos: number, speedDistanceIndex: SpeedDistancePoint[]) => {
  const targetTimepos = Math.max(0, timepos);
  let low = 0;
  let high = speedDistanceIndex.length - 1;
  let activePoint = speedDistanceIndex[0] ?? { timepos: 0, distance: 0, speed: 1 };

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const point = speedDistanceIndex[mid];
    if (point.timepos <= targetTimepos) {
      activePoint = point;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return activePoint.distance + activePoint.speed * (targetTimepos - activePoint.timepos);
};

export const findFirstPreviewNoteDistanceIndex = (entries: PreviewNoteRenderEntry[], distance: number) => {
  let low = 0;
  let high = entries.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (entries[mid].distance < distance) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
};

export const getPreviewNoteEntriesInDistanceRange = (
  entries: PreviewNoteRenderEntry[],
  startDistance: number,
  endDistance: number,
) => {
  const minDistance = Math.min(startDistance, endDistance);
  const maxDistance = Math.max(startDistance, endDistance);
  const matchingEntries: PreviewNoteRenderEntry[] = [];
  const firstEntryIndex = findFirstPreviewNoteDistanceIndex(entries, minDistance);

  for (let index = firstEntryIndex; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.distance > maxDistance) {
      break;
    }

    matchingEntries.push(entry);
  }

  return matchingEntries;
};

export const comparePreviewNoteRenderEntries = (a: PreviewNoteRenderEntry, b: PreviewNoteRenderEntry) => (
  (a.distance - b.distance)
  || (a.timepos - b.timepos)
  || (a.note.id - b.note.id)
);

export const findFirstPreviewConnectorDistanceIndex = (entries: PreviewHoldConnectorSegment[], distance: number) => {
  let low = 0;
  let high = entries.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (entries[mid].minDistance < distance) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
};

export const getPreviewConnectorSegmentsInDistanceRange = (
  entries: PreviewHoldConnectorSegment[],
  startDistance: number,
  endDistance: number,
) => {
  const minDistance = Math.min(startDistance, endDistance);
  const maxDistance = Math.max(startDistance, endDistance);
  const matchingEntries: PreviewHoldConnectorSegment[] = [];
  let index = findFirstPreviewConnectorDistanceIndex(entries, minDistance);

  while (index > 0 && entries[index - 1].maxDistance >= minDistance) {
    index -= 1;
  }

  for (; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.minDistance > maxDistance) {
      break;
    }

    if (entry.maxDistance >= minDistance) {
      matchingEntries.push(entry);
    }
  }

  return matchingEntries;
};

export const parsePreviewNoteSpeed = (
  speed: string | undefined,
  noteTimepos: number,
  _speedDistanceIndex: SpeedDistancePoint[],
): PreviewNoteSpeed => {
  const normalizedSpeed = speed?.replace(/\s+/g, '') ?? '';

  if (!normalizedSpeed.includes(':')) {
    const multiplier = Number(normalizedSpeed);
    return {
      kind: 'multiplier',
      multiplier: Number.isFinite(multiplier) && multiplier !== 0 ? multiplier : 1,
    };
  }

  const keyframes = normalizedSpeed
    .split(';')
    .map((entry) => {
      const [timeOffsetText, valueOffsetText] = entry.split(':');
      const timeOffset = Number(timeOffsetText);
      const valueOffset = Number(valueOffsetText);

      if (!Number.isFinite(timeOffset) || !Number.isFinite(valueOffset)) {
        return null;
      }

      // Complex NSC is "timepos offset : displayed timepos offset".
      // Example: "0.25:0" means when playback is at noteTimepos - 0.25,
      // render the note as if it were positioned at noteTimepos - 0.
      return {
        time: noteTimepos - timeOffset,
        value: noteTimepos - valueOffset,
      };
    })
    .filter((keyframe): keyframe is PreviewNoteSpeedKeyframe => keyframe !== null)
    .sort((a, b) => a.time - b.time);

  return keyframes.length > 0
    ? { kind: 'curve', keyframes }
    : { kind: 'multiplier', multiplier: 1 };
};

export const evaluatePreviewNoteSpeedCurve = (
  keyframes: PreviewNoteSpeedKeyframe[],
  currentTimepos: number,
) => {
  if (keyframes.length === 0) {
    return currentTimepos;
  }

  if (currentTimepos <= keyframes[0].time) {
    return keyframes[0].value;
  }

  const lastKeyframe = keyframes[keyframes.length - 1];
  if (currentTimepos >= lastKeyframe.time) {
    return lastKeyframe.value;
  }

  let low = 1;
  let high = keyframes.length - 1;
  let nextIndex = keyframes.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (currentTimepos <= keyframes[mid].time) {
      nextIndex = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  const previous = keyframes[nextIndex - 1];
  const next = keyframes[nextIndex];
  const span = next.time - previous.time;
  const progress = Math.abs(span) <= SNAP_EPSILON
    ? 0
    : (currentTimepos - previous.time) / span;

  return previous.value + (next.value - previous.value) * progress;
};

export const getPreviewNoteVisualDistance = (
  noteDistance: number,
  noteTimepos: number,
  notePlaybackTime: number,
  noteSpeed: PreviewNoteSpeed,
  currentDistance: number,
  currentTimepos: number,
  getPlaybackTimeFromTimepos?: (timepos: number) => number,
) => (
  noteSpeed.kind === 'curve'
    ? notePlaybackTime - (
        getPlaybackTimeFromTimepos
          ? getPlaybackTimeFromTimepos(evaluatePreviewNoteSpeedCurve(noteSpeed.keyframes, currentTimepos))
          : evaluatePreviewNoteSpeedCurve(noteSpeed.keyframes, currentTimepos)
      )
    : (noteDistance - currentDistance) * noteSpeed.multiplier
);

export const easeOutCubic = (value: number) => 1 - ((1 - value) ** 3);

export const easeInCubic = (value: number) => value ** 3;

export const getPreviewAppearModePosition = (
  note: Note,
  x: number,
  y: number,
  notePixelWidth: number,
  visualDistance: number,
  chartStartX: number,
  gridWidth: number,
): PreviewNotePosition => {
  if (note.appearMode === 'L' || note.appearMode === 'R' || note.appearMode === 'H') {
    const linearProgress = Math.max(0, Math.min(1, 1 - Math.max(0, visualDistance) / APPEAR_MODE_ENTRY_DISTANCE));

    if (note.appearMode === 'L') {
      const startX = chartStartX - gridWidth * APPEAR_MODE_SIDE_ENTRY_MULTIPLIER - notePixelWidth;
      return {
        x: startX + (x - startX) * linearProgress,
        y,
        scale: 1,
      };
    }

    if (note.appearMode === 'R') {
      const startX = chartStartX + gridWidth * (1 + APPEAR_MODE_SIDE_ENTRY_MULTIPLIER);
      return {
        x: startX + (x - startX) * linearProgress,
        y,
        scale: 1,
      };
    }

    const hProgress = linearProgress ** APPEAR_MODE_H_ENTRY_PROGRESS_EXPONENT;
    const yProgress = easeOutCubic(hProgress);
    const scaleProgress = easeInCubic(hProgress);
    const startY = y - APPEAR_MODE_H_FLY_DOWN_PIXELS;
    return {
      x,
      y: startY + (y - startY) * yProgress,
      scale: APPEAR_MODE_H_START_SCALE + (1 - APPEAR_MODE_H_START_SCALE) * scaleProgress,
    };
  }

  return { x, y, scale: 1 };
};

export const findFirstPreviewJudgementNoteIndex = (entries: PreviewJudgementNoteEntry[], time: number) => {
  let low = 0;
  let high = entries.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (entries[mid].time < time) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
};

export const buildPreviewComboTimes = (notes: Note[]) => (
  notes.map(note => note.time).sort((a, b) => a - b)
);

export const getPreviewComboAtTime = (comboTimes: number[], time: number) => {
  let low = 0;
  let high = comboTimes.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (comboTimes[mid] <= time) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
};

export const buildPreviewCameraTiltIntervals = (segments: PreviewCameraTiltSegment[]) => {
  const events: Array<{ timepos: number; countDelta: number; tiltDelta: number }> = [];

  segments.forEach((segment) => {
    if (segment.endTimepos - segment.startTimepos <= SNAP_EPSILON) {
      return;
    }

    const tiltDegrees = (
      (segment.connectorCenterXPosition - X_POSITION_COUNT / 2)
      / PREVIEW_CONNECTOR_TILT_DIVISOR
    );

    events.push(
      { timepos: segment.startTimepos, countDelta: 1, tiltDelta: tiltDegrees },
      { timepos: segment.endTimepos, countDelta: -1, tiltDelta: -tiltDegrees },
    );
  });

  events.sort((a, b) => a.timepos - b.timepos);

  const intervals: PreviewCameraTiltInterval[] = [];
  let activeCount = 0;
  let activeTiltTotal = 0;
  let eventIndex = 0;

  while (eventIndex < events.length) {
    const timepos = events[eventIndex].timepos;

    while (
      eventIndex < events.length
      && Math.abs(events[eventIndex].timepos - timepos) <= SNAP_EPSILON
    ) {
      activeCount += events[eventIndex].countDelta;
      activeTiltTotal += events[eventIndex].tiltDelta;
      eventIndex += 1;
    }

    const nextTimepos = events[eventIndex]?.timepos;
    if (
      nextTimepos !== undefined
      && nextTimepos - timepos > SNAP_EPSILON
      && activeCount > 0
    ) {
      const tiltDegrees = activeTiltTotal / activeCount;

      intervals.push({
        startTimepos: timepos,
        endTimepos: nextTimepos,
        tiltDegrees,
        rotationRadians: (tiltDegrees * Math.PI) / 180,
      });
    }
  }

  return intervals;
};

export const getPreviewCameraTiltDegrees = (
  intervals: PreviewCameraTiltInterval[],
  currentTimepos: number,
) => {
  let low = 0;
  let high = intervals.length;
  const searchTimepos = currentTimepos + SNAP_EPSILON;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (intervals[mid].startTimepos <= searchTimepos) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const interval = intervals[low - 1];
  return interval && currentTimepos < interval.endTimepos - SNAP_EPSILON
    ? interval.tiltDegrees
    : 0;
};

export const getPreviewCameraRotationRadians = (
  intervals: PreviewCameraTiltInterval[],
  currentTimepos: number,
) => {
  let low = 0;
  let high = intervals.length;
  const searchTimepos = currentTimepos + SNAP_EPSILON;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (intervals[mid].startTimepos <= searchTimepos) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const interval = intervals[low - 1];
  return interval && currentTimepos < interval.endTimepos - SNAP_EPSILON
    ? interval.rotationRadians
    : 0;
};

export const buildPreviewCameraMovementIntervals = (
  segments: PreviewCameraMovementSegment[],
): PreviewCameraMovementInterval[] => {
  const events: Array<{ time: number; slopeDelta: number; interceptDelta: number }> = [];

  segments.forEach((segment) => {
    const segmentStartTime = Math.min(segment.startTime, segment.endTime);
    const segmentEndTime = Math.max(segment.startTime, segment.endTime);
    const duration = segmentEndTime - segmentStartTime;

    if (duration <= SNAP_EPSILON) {
      events.push({ time: segmentEndTime, slopeDelta: 0, interceptDelta: segment.deltaXPosition });
      return;
    }

    const slope = segment.deltaXPosition / duration;
    const intercept = -slope * segmentStartTime;

    events.push(
      { time: segmentStartTime, slopeDelta: slope, interceptDelta: intercept },
      { time: segmentEndTime, slopeDelta: -slope, interceptDelta: segment.deltaXPosition - intercept },
    );
  });

  events.sort((a, b) => a.time - b.time);

  const intervals: PreviewCameraMovementInterval[] = [];
  let activeSlope = 0;
  let activeIntercept = 0;
  let eventIndex = 0;

  while (eventIndex < events.length) {
    const time = events[eventIndex].time;

    while (
      eventIndex < events.length
      && Math.abs(events[eventIndex].time - time) <= SNAP_EPSILON
    ) {
      activeSlope += events[eventIndex].slopeDelta;
      activeIntercept += events[eventIndex].interceptDelta;
      eventIndex += 1;
    }

    const nextTime = events[eventIndex]?.time;
    if (nextTime !== undefined && nextTime - time > SNAP_EPSILON) {
      intervals.push({
        startTime: time,
        endTime: nextTime,
        offsetAtStart: activeSlope * time + activeIntercept,
        slope: activeSlope,
      });
    } else if (nextTime === undefined && Math.abs(activeSlope * time + activeIntercept) > SNAP_EPSILON) {
      intervals.push({
        startTime: time,
        endTime: Number.POSITIVE_INFINITY,
        offsetAtStart: activeSlope * time + activeIntercept,
        slope: activeSlope,
      });
    }
  }

  return intervals;
};

export const getPreviewCameraXPositionOffset = (
  intervals: PreviewCameraMovementInterval[],
  currentTime: number,
) => {
  let low = 0;
  let high = intervals.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (intervals[mid].startTime <= currentTime) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const interval = intervals[low - 1];
  return interval && currentTime < interval.endTime - SNAP_EPSILON
    ? interval.offsetAtStart + interval.slope * (currentTime - interval.startTime)
    : 0;
};
