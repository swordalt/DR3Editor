import { formatTranslation, translations } from '../lang';

export default function EditorPerformanceStats({
  fps,
  renderedObjects,
  isBackdropBlurDisabled,
  onMouseEnter,
  onMouseLeave,
}: {
  fps: number;
  renderedObjects: number;
  isBackdropBlurDisabled: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const text = translations;
  const panelClassName = isBackdropBlurDisabled
    ? 'border-neutral-700 bg-neutral-950 shadow-2xl shadow-black/40'
    : 'border-neutral-700 bg-neutral-950/90 shadow-2xl shadow-black/40 backdrop-blur';
  const detailClassName = isBackdropBlurDisabled
    ? 'border-neutral-700 bg-neutral-950 shadow-2xl shadow-black/40'
    : 'border-neutral-700 bg-neutral-950/95 shadow-2xl shadow-black/40 backdrop-blur';

  return (
    <div
      className="group fixed bottom-4 left-1/2 z-40 -translate-x-1/2 select-none"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      tabIndex={0}
      aria-label={formatTranslation(text.performance.statisticsLabel, { fps, renderedObjects })}
    >
      <div className={`pointer-events-none absolute bottom-full left-1/2 mb-2 min-w-40 -translate-x-1/2 translate-y-1 rounded-xl border px-3 py-2 text-center font-mono text-xs text-neutral-300 opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 ${detailClassName}`}>
        {text.performance.renderedObjects} <span className="ml-2 text-white">{renderedObjects}</span>
      </div>
      <div className={`rounded-xl border px-3 py-2 font-mono text-sm text-neutral-300 ${panelClassName}`}>
        {text.performance.fps} <span className="ml-2 inline-block min-w-8 text-right text-white">{fps}</span>
      </div>
    </div>
  );
}
