import { ArrowLeft } from 'lucide-react';
import {
  CURVE_EASING_FAMILY_OPTIONS,
  CURVE_EASING_TYPE_OPTIONS,
} from '../editor/editorViewConstants';
import { translations } from '../lang';
import { stripInputWhitespace } from '../utils/inputSanitization';
import type { CurveEasingFamily, CurveEasingType } from '../editor/editorLocalTypes';

export default function EditorLeftCurveSpeedPanel(props: any) {
  const {
    isLeftPanelContentVisible,
    activeLeftPanel,
    setActiveLeftPanel,
    notePropertyInputClass,
    speedCurveStartIdInput,
    setSpeedCurveStartIdInput,
    speedCurveEndIdInput,
    setSpeedCurveEndIdInput,
    speedCurveStartChange,
    speedCurveEndChange,
    speedCurveDensityInput,
    setSpeedCurveDensityInput,
    hasValidSpeedCurveDensity,
    parsedSpeedCurveDensity,
    speedCurveEasingFamily,
    setSpeedCurveEasingFamily,
    speedCurveEasingType,
    setSpeedCurveEasingType,
    handleGenerateSpeedCurveChanges,
    canGenerateSpeedCurveChanges,
    speedCurveMessage,
    setSpeedCurveMessage,
  } = props;
  const text = translations;

  return (
    <>
      {isLeftPanelContentVisible && activeLeftPanel === 'curveSpeedChanges' && (
        <div className="p-4 flex flex-col h-full overflow-hidden min-h-0">
          <div className="flex items-center gap-2 mb-4 shrink-0">
            <button onClick={() => setActiveLeftPanel('main')} className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">{text.sidebar.curveSpeedChanges}</div>
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1 pb-4">
            <div className="grid grid-cols-2 gap-2">
              <label className="block min-w-0">
                <span className="mb-1 block text-xs text-neutral-400">{text.sidebar.startId}</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={speedCurveStartIdInput}
                  className={`${notePropertyInputClass} min-w-0`}
                  onChange={(e) => {
                    setSpeedCurveStartIdInput(e.target.value);
                    setSpeedCurveMessage('');
                  }}
                  onBlur={() => setSpeedCurveStartIdInput(stripInputWhitespace(speedCurveStartIdInput))}
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-xs text-neutral-400">{text.sidebar.endId}</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={speedCurveEndIdInput}
                  className={`${notePropertyInputClass} min-w-0`}
                  onChange={(e) => {
                    setSpeedCurveEndIdInput(e.target.value);
                    setSpeedCurveMessage('');
                  }}
                  onBlur={() => setSpeedCurveEndIdInput(stripInputWhitespace(speedCurveEndIdInput))}
                />
              </label>
            </div>
            <div className="text-xs leading-5 text-neutral-500">
              {speedCurveStartChange && speedCurveEndChange
                ? `${speedCurveStartChange.speedChange}x at ${speedCurveStartChange.timepos} -> ${speedCurveEndChange.speedChange}x at ${speedCurveEndChange.timepos}`
                : 'Use the row IDs from the speed change list.'}
            </div>

            <label className="block">
              <span className="mb-1 block text-xs text-neutral-400">{text.sidebar.density}</span>
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-sm text-neutral-400">1/</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={speedCurveDensityInput}
                  className={`${notePropertyInputClass} min-w-0 flex-1`}
                  onChange={(e) => {
                    setSpeedCurveDensityInput(e.target.value);
                    setSpeedCurveMessage('');
                  }}
                  onBlur={() => setSpeedCurveDensityInput(stripInputWhitespace(speedCurveDensityInput))}
                />
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                {speedCurveDensityInput.trim() === ''
                  ? 'Enter a denominator.'
                  : hasValidSpeedCurveDensity
                    ? `Snap density 1/${parsedSpeedCurveDensity}.`
                    : 'Density denominator must be a positive whole number.'}
              </div>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block min-w-0">
                <span className="mb-1 block text-xs text-neutral-400">{text.sidebar.easing}</span>
                <select
                  value={speedCurveEasingFamily}
                  className={`${notePropertyInputClass} min-w-0`}
                  onChange={(e) => {
                    setSpeedCurveEasingFamily(e.target.value as CurveEasingFamily);
                    setSpeedCurveMessage('');
                  }}
                >
                  {CURVE_EASING_FAMILY_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block min-w-0">
                <span className="mb-1 block text-xs text-neutral-400">{text.sidebar.type}</span>
                <select
                  value={speedCurveEasingType}
                  className={`${notePropertyInputClass} min-w-0`}
                  disabled={speedCurveEasingFamily === 'linear'}
                  onChange={(e) => {
                    setSpeedCurveEasingType(e.target.value as CurveEasingType);
                    setSpeedCurveMessage('');
                  }}
                >
                  {CURVE_EASING_TYPE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="button"
              onClick={handleGenerateSpeedCurveChanges}
              disabled={!canGenerateSpeedCurveChanges}
              className="mt-1 w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
            >
              {text.sidebar.generateSpeedCurveChanges}
            </button>

            <p className="text-xs leading-5 text-neutral-500">
              Adds intermediate speed changes on the selected snap grid, interpolating speed with the selected easing.
            </p>

            {speedCurveMessage && (
              <div className="rounded border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs leading-5 text-neutral-400">
                {speedCurveMessage}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
