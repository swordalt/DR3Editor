import type { SelectionType } from './editorSettings';
import type { CurveEasingFamily, CurveEasingId, CurveEasingType } from './editorLocalTypes';
import { translations } from '../lang';

export const HIT_SOUND_LOOKAHEAD_SECONDS = 0.12;
export const HIT_SOUND_JUMP_TOLERANCE_SECONDS = 0.25;
export const PAUSED_TIMELINE_RENDER_DURATION_MS = 120;
export const AUDIO_CLOCK_HANDOFF_DELAY_MS = 200;
export const AUDIO_CLOCK_SYNC_TOLERANCE_SECONDS = 0.05;
export const AUDIO_SEEK_TIMEOUT_MS = 10000;
export const PERFORMANCE_STATS_UPDATE_INTERVAL_MS = 500;
export const PLAYBACK_SPEED_OPTIONS = [1, 0.75, 0.5, 0.25, 1.25, 1.5, 1.75, 2] as const;
export const PINK_HOLD_CENTER_TYPE = 23;
export const PINK_HOLD_END_TYPE = 24;
export const APPEAR_MODE_P_NSC = '0.5:0;0.438:0.25;0.374:0.375;0.312:0.4687;0.25:0.5;0.188:0.4687;0.124:0.375;0.062:0.25;0:0';
export const APPEAR_MODE_ENTRY_DISTANCE = 4;
export const APPEAR_MODE_SIDE_ENTRY_MULTIPLIER = 1.75;
export const APPEAR_MODE_H_START_SCALE = 3;
export const APPEAR_MODE_H_FLY_DOWN_PIXELS = 180;
export const APPEAR_MODE_H_ENTRY_PROGRESS_EXPONENT = 1.25;
export const APPEAR_MODE_P_RENDER_DISTANCE = 0.5;
export const PREVIEW_CONNECTOR_TILT_DIVISOR = 4;
export const PREVIEW_CONNECTOR_TILT_EASING_MS = 120;
export const PREVIEW_CONNECTOR_TILT_ACTIVE_EASE_SPEED = 10;
export const PREVIEW_CONNECTOR_TILT_RETURN_EASE_SPEED = 20;
export const SELECTION_TYPE_LABELS: Record<SelectionType, string> = {
  window: translations.options.selectionTypes.window,
  crossing: translations.options.selectionTypes.crossing,
};
export const SIDE_PANEL_TRANSITION_MS = 300;
export const LANE_COUNT = 8;
export const X_POSITION_COUNT = LANE_COUNT * 2;
export const SNAP_EPSILON = 0.000001;

export const EASING_PI = Math.PI;
export const EASING_BACK_C1 = 1.70158;
export const EASING_BACK_C2 = EASING_BACK_C1 * 1.525;
export const EASING_BACK_C3 = EASING_BACK_C1 + 1;
export const EASING_ELASTIC_C4 = (2 * EASING_PI) / 3;
export const EASING_ELASTIC_C5 = (2 * EASING_PI) / 4.5;

export const CURVE_EASING_FAMILY_OPTIONS: Array<{
  id: CurveEasingFamily;
  label: string;
}> = [
  { id: 'linear', label: translations.options.easingFamilies.linear },
  { id: 'sine', label: translations.options.easingFamilies.sine },
  { id: 'quad', label: translations.options.easingFamilies.quad },
  { id: 'cubic', label: translations.options.easingFamilies.cubic },
  { id: 'quart', label: translations.options.easingFamilies.quart },
  { id: 'quint', label: translations.options.easingFamilies.quint },
  { id: 'expo', label: translations.options.easingFamilies.expo },
  { id: 'circ', label: translations.options.easingFamilies.circ },
  { id: 'back', label: translations.options.easingFamilies.back },
  { id: 'elastic', label: translations.options.easingFamilies.elastic },
];

export const CURVE_EASING_TYPE_OPTIONS: Array<{
  id: CurveEasingType;
  label: string;
}> = [
  { id: 'in', label: translations.options.easingTypes.in },
  { id: 'out', label: translations.options.easingTypes.out },
  { id: 'inOut', label: translations.options.easingTypes.inOut },
];

export const CURVE_EASING_OPTIONS: Array<{
  id: CurveEasingId;
  label: string;
  ease: (progress: number) => number;
}> = [
  { id: 'linear', label: translations.options.easings.linear, ease: (x) => x },
  { id: 'easeInSine', label: translations.options.easings.easeInSine, ease: (x) => 1 - Math.cos((x * EASING_PI) / 2) },
  { id: 'easeOutSine', label: translations.options.easings.easeOutSine, ease: (x) => Math.sin((x * EASING_PI) / 2) },
  { id: 'easeInOutSine', label: translations.options.easings.easeInOutSine, ease: (x) => -(Math.cos(EASING_PI * x) - 1) / 2 },
  { id: 'easeInQuad', label: translations.options.easings.easeInQuad, ease: (x) => x * x },
  { id: 'easeOutQuad', label: translations.options.easings.easeOutQuad, ease: (x) => 1 - (1 - x) * (1 - x) },
  { id: 'easeInOutQuad', label: translations.options.easings.easeInOutQuad, ease: (x) => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2 },
  { id: 'easeInCubic', label: translations.options.easings.easeInCubic, ease: (x) => x * x * x },
  { id: 'easeOutCubic', label: translations.options.easings.easeOutCubic, ease: (x) => 1 - Math.pow(1 - x, 3) },
  { id: 'easeInOutCubic', label: translations.options.easings.easeInOutCubic, ease: (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2 },
  { id: 'easeInQuart', label: translations.options.easings.easeInQuart, ease: (x) => x * x * x * x },
  { id: 'easeOutQuart', label: translations.options.easings.easeOutQuart, ease: (x) => 1 - Math.pow(1 - x, 4) },
  { id: 'easeInOutQuart', label: translations.options.easings.easeInOutQuart, ease: (x) => x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2 },
  { id: 'easeInQuint', label: translations.options.easings.easeInQuint, ease: (x) => x * x * x * x * x },
  { id: 'easeOutQuint', label: translations.options.easings.easeOutQuint, ease: (x) => 1 - Math.pow(1 - x, 5) },
  { id: 'easeInOutQuint', label: translations.options.easings.easeInOutQuint, ease: (x) => x < 0.5 ? 16 * x * x * x * x * x : 1 - Math.pow(-2 * x + 2, 5) / 2 },
  { id: 'easeInExpo', label: translations.options.easings.easeInExpo, ease: (x) => x === 0 ? 0 : Math.pow(2, 10 * x - 10) },
  { id: 'easeOutExpo', label: translations.options.easings.easeOutExpo, ease: (x) => x === 1 ? 1 : 1 - Math.pow(2, -10 * x) },
  { id: 'easeInOutExpo', label: translations.options.easings.easeInOutExpo, ease: (x) => x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2 },
  { id: 'easeInCirc', label: translations.options.easings.easeInCirc, ease: (x) => 1 - Math.sqrt(1 - Math.pow(x, 2)) },
  { id: 'easeOutCirc', label: translations.options.easings.easeOutCirc, ease: (x) => Math.sqrt(1 - Math.pow(x - 1, 2)) },
  { id: 'easeInOutCirc', label: translations.options.easings.easeInOutCirc, ease: (x) => x < 0.5 ? (1 - Math.sqrt(1 - Math.pow(2 * x, 2))) / 2 : (Math.sqrt(1 - Math.pow(-2 * x + 2, 2)) + 1) / 2 },
  { id: 'easeInBack', label: translations.options.easings.easeInBack, ease: (x) => EASING_BACK_C3 * x * x * x - EASING_BACK_C1 * x * x },
  { id: 'easeOutBack', label: translations.options.easings.easeOutBack, ease: (x) => 1 + EASING_BACK_C3 * Math.pow(x - 1, 3) + EASING_BACK_C1 * Math.pow(x - 1, 2) },
  { id: 'easeInOutBack', label: translations.options.easings.easeInOutBack, ease: (x) => x < 0.5 ? (Math.pow(2 * x, 2) * ((EASING_BACK_C2 + 1) * 2 * x - EASING_BACK_C2)) / 2 : (Math.pow(2 * x - 2, 2) * ((EASING_BACK_C2 + 1) * (x * 2 - 2) + EASING_BACK_C2) + 2) / 2 },
  { id: 'easeInElastic', label: translations.options.easings.easeInElastic, ease: (x) => x === 0 ? 0 : x === 1 ? 1 : -Math.pow(2, 10 * x - 10) * Math.sin((x * 10 - 10.75) * EASING_ELASTIC_C4) },
  { id: 'easeOutElastic', label: translations.options.easings.easeOutElastic, ease: (x) => x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * EASING_ELASTIC_C4) + 1 },
  { id: 'easeInOutElastic', label: translations.options.easings.easeInOutElastic, ease: (x) => x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? -(Math.pow(2, 20 * x - 10) * Math.sin((20 * x - 11.125) * EASING_ELASTIC_C5)) / 2 : (Math.pow(2, -20 * x + 10) * Math.sin((20 * x - 11.125) * EASING_ELASTIC_C5)) / 2 + 1 },
];

export const CURVE_EASINGS_BY_ID = new Map(CURVE_EASING_OPTIONS.map((option) => [option.id, option]));

export const getCurveEasingId = (family: CurveEasingFamily, type: CurveEasingType): CurveEasingId => {
  if (family === 'linear') {
    return 'linear';
  }

  const direction = type === 'inOut'
    ? 'InOut'
    : type === 'in'
      ? 'In'
      : 'Out';
  const familyName = family.charAt(0).toUpperCase() + family.slice(1);

  return `ease${direction}${familyName}` as CurveEasingId;
};

export const APPEAR_MODE_OPTIONS = ['none', 'L', 'R', 'H', 'P', 'N'] as const;
