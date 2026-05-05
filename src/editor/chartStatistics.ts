import type { Note, SpeedChange, TimedBpmChange } from '../types/editorTypes';
import { getActiveChange } from '../utils/editorUtils';
import { buildSpeedDistanceIndex, getSpeedDistanceAtTimepos } from './previewPlayback';

export const getEmptyChartStatistics = () => ({
  currentEditorBpm: 0,
  currentEditorSpeed: 1,
  currentEditorDistance: 0,
  currentEditorCombo: 0,
  currentEditorScore: 0,
});

export const calculateChartStatistics = ({
  getTimeFromTimepos,
  getTimeposFromTime,
  liveStatsTime,
  notes,
  shouldShowChartStatistics,
  speedChanges,
  timedBpmChanges,
}: {
  getTimeFromTimepos: (timepos: number) => number;
  getTimeposFromTime: (time: number) => number;
  liveStatsTime: number;
  notes: Note[];
  shouldShowChartStatistics: boolean;
  speedChanges: SpeedChange[];
  timedBpmChanges: TimedBpmChange[];
}) => {
  if (!shouldShowChartStatistics) {
    return getEmptyChartStatistics();
  }

  const currentEditorTimepos = getTimeposFromTime(liveStatsTime);
  const currentEditorBpm = getActiveChange(liveStatsTime, timedBpmChanges).bpm;
  const sortedSpeedChanges = [...speedChanges].sort((a, b) => a.timepos - b.timepos);
  const currentEditorSpeed = sortedSpeedChanges.reduce((activeSpeed, change) => (
      change.timepos <= currentEditorTimepos
        ? change.speedChange
        : activeSpeed
    ), 1);
  const currentEditorDistanceIndex = buildSpeedDistanceIndex(sortedSpeedChanges.map(change => ({
    timepos: getTimeFromTimepos(change.timepos),
    speedChange: change.speedChange,
  })));
  const currentEditorDistance = getSpeedDistanceAtTimepos(liveStatsTime, currentEditorDistanceIndex);
  const currentEditorCombo = notes.reduce((combo, note) => (
    note.time <= liveStatsTime ? combo + 1 : combo
  ), 0);
  const currentEditorScore = notes.length > 0
    ? Math.floor((3000000 / notes.length) * currentEditorCombo)
    : 0;

  return {
    currentEditorBpm,
    currentEditorSpeed,
    currentEditorDistance,
    currentEditorCombo,
    currentEditorScore,
  };
};
