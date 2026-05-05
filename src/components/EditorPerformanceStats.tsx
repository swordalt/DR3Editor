export default function EditorPerformanceStats({
  fps,
  renderedObjects,
  onMouseEnter,
  onMouseLeave,
}: {
  fps: number;
  renderedObjects: number;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  return (
    <div
      className="group fixed bottom-4 right-4 z-40 select-none"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      tabIndex={0}
      aria-label={`Performance statistics: ${fps} FPS, ${renderedObjects} rendered objects`}
    >
      <div className="pointer-events-none absolute bottom-full right-0 mb-2 min-w-40 translate-y-1 rounded-xl border border-neutral-700 bg-neutral-950/95 px-3 py-2 text-right font-mono text-xs text-neutral-300 opacity-0 shadow-2xl shadow-black/40 backdrop-blur transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100">
        Rendered objects <span className="ml-2 text-white">{renderedObjects}</span>
      </div>
      <div className="rounded-xl border border-neutral-700 bg-neutral-950/90 px-3 py-2 font-mono text-sm text-neutral-300 shadow-2xl shadow-black/40 backdrop-blur">
        FPS <span className="ml-2 inline-block min-w-8 text-right text-white">{fps}</span>
      </div>
    </div>
  );
}
