import type { Note, SpeedChange, TimedBpmChange } from '../types/editorTypes';
import { getActiveChange } from '../utils/editorUtils';
import type { SpeedDistancePoint } from './editorLocalTypes';
import { buildSpeedDistanceIndex, getSpeedDistanceAtTimepos } from './previewPlayback';

export interface ChartStatisticsIndex {
  sortedNoteTimes: number[];
  scorePerCombo: number;
  speedDistanceIndex: SpeedDistancePoint[];
  sortedSpeedChanges: SpeedChange[];
}

export const EMPTY_CHART_STATISTICS_INDEX: ChartStatisticsIndex = {
  sortedNoteTimes: [],
  scorePerCombo: 0,
  speedDistanceIndex: [],
  sortedSpeedChanges: [],
};

export const getEmptyChartStatistics = () => ({
  currentEditorBpm: 0,
  currentEditorSpeed: 1,
  currentEditorDistance: 0,
  currentEditorCombo: 0,
  currentEditorScore: 0,
});

const findFirstValueAfter = (values: number[], target: number) => {
  let low = 0;
  let high = values.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (values[mid] <= target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
};

const getActiveSpeedAtTimepos = (speedChanges: SpeedChange[], timepos: number) => {
  let low = 0;
  let high = speedChanges.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (speedChanges[mid].timepos <= timepos) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return speedChanges[low - 1]?.speedChange ?? 1;
};

export const buildChartStatisticsIndex = ({
  getTimeFromTimepos,
  notes,
  speedChanges,
}: {
  getTimeFromTimepos: (timepos: number) => number;
  notes: Note[];
  speedChanges: SpeedChange[];
}): ChartStatisticsIndex => {
  const sortedNoteTimes = notes
    .map(note => note.time)
    .sort((a, b) => a - b);
  const sortedSpeedChanges = [...speedChanges].sort((a, b) => a.timepos - b.timepos);
  const speedDistanceIndex = buildSpeedDistanceIndex(sortedSpeedChanges.map(change => ({
    timepos: getTimeFromTimepos(change.timepos),
    speedChange: change.speedChange,
  })));

  return {
    sortedNoteTimes,
    scorePerCombo: notes.length > 0 ? 3000000 / notes.length : 0,
    speedDistanceIndex,
    sortedSpeedChanges,
  };
};

export const calculateChartStatistics = ({
  getTimeFromTimepos,
  getTimeposFromTime,
  liveStatsTime,
  notes,
  precomputedIndex,
  shouldShowChartStatistics,
  speedChanges,
  timedBpmChanges,
}: {
  getTimeFromTimepos: (timepos: number) => number;
  getTimeposFromTime: (time: number) => number;
  liveStatsTime: number;
  notes: Note[];
  precomputedIndex?: ChartStatisticsIndex | null;
  shouldShowChartStatistics: boolean;
  speedChanges: SpeedChange[];
  timedBpmChanges: TimedBpmChange[];
}) => {
  if (!shouldShowChartStatistics) {
    return getEmptyChartStatistics();
  }

  const currentEditorTimepos = getTimeposFromTime(liveStatsTime);
  const currentEditorBpm = getActiveChange(liveStatsTime, timedBpmChanges).bpm;
  const statisticsIndex = precomputedIndex ?? buildChartStatisticsIndex({
    getTimeFromTimepos,
    notes,
    speedChanges,
  });
  const currentEditorSpeed = getActiveSpeedAtTimepos(statisticsIndex.sortedSpeedChanges, currentEditorTimepos);
  const currentEditorDistance = getSpeedDistanceAtTimepos(liveStatsTime, statisticsIndex.speedDistanceIndex);
  const currentEditorCombo = findFirstValueAfter(statisticsIndex.sortedNoteTimes, liveStatsTime);
  const currentEditorScore = Math.floor(statisticsIndex.scorePerCombo * currentEditorCombo);

  return {
    currentEditorBpm,
    currentEditorSpeed,
    currentEditorDistance,
    currentEditorCombo,
    currentEditorScore,
  };
};
