import { Fragment, useCallback, useMemo, useRef, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { CheckCircle2, ChevronRight, Loader2, XCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { Dr3FpPreviewFailureKind, Dr3FpPreviewStage, Dr3FpPreviewStatus } from '../editor/dr3FpPreviewStatus';
import { EDITOR_KEYBIND_GROUPS } from '../editor/editorKeybinds';
import {
  SELECTION_TYPE_OPTIONS,
  STATISTICS_REFRESH_RATE_OPTIONS,
  type SelectionType,
  type StatisticsRefreshRate,
} from '../editor/editorSettings';
import { SELECTION_TYPE_LABELS } from '../editor/editorViewConstants';

interface EditorOverlaysProps {
  isExitWarningOpen: boolean;
  isSettingsOpen: boolean;
  isHelpOpen: boolean;
  isDr3FpPreviewInfoOpen: boolean;
  dr3FpPreviewStatus: Dr3FpPreviewStatus;
  isExitWarningEnabled: boolean;
  isScrollDirectionInverted: boolean;
  isSelectionTypeMenuOpen: boolean;
  isStatisticsRefreshRateMenuOpen: boolean;
  selectionType: SelectionType;
  statisticsRefreshRate: StatisticsRefreshRate;
  musicVolume: number;
  tapSoundVolume: number;
  flickSoundVolume: number;
  isPreviewCameraTiltEnabled: boolean;
  isPreviewCameraMovementEnabled: boolean;
  isPreviewNoteSpeedChangesEnabled: boolean;
  isPreviewNoteAppearModeEnabled: boolean;
  setIsExitWarningOpen: Dispatch<SetStateAction<boolean>>;
  setIsSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setIsHelpOpen: Dispatch<SetStateAction<boolean>>;
  setIsDr3FpPreviewInfoOpen: Dispatch<SetStateAction<boolean>>;
  setIsExitWarningEnabled: Dispatch<SetStateAction<boolean>>;
  setIsScrollDirectionInverted: Dispatch<SetStateAction<boolean>>;
  setIsSelectionTypeMenuOpen: Dispatch<SetStateAction<boolean>>;
  setIsStatisticsRefreshRateMenuOpen: Dispatch<SetStateAction<boolean>>;
  setSelectionType: Dispatch<SetStateAction<SelectionType>>;
  setStatisticsRefreshRate: Dispatch<SetStateAction<StatisticsRefreshRate>>;
  setMusicVolume: Dispatch<SetStateAction<number>>;
  setTapSoundVolume: Dispatch<SetStateAction<number>>;
  setFlickSoundVolume: Dispatch<SetStateAction<number>>;
  setIsPreviewCameraTiltEnabled: Dispatch<SetStateAction<boolean>>;
  setIsPreviewCameraMovementEnabled: Dispatch<SetStateAction<boolean>>;
  setIsPreviewNoteSpeedChangesEnabled: Dispatch<SetStateAction<boolean>>;
  setIsPreviewNoteAppearModeEnabled: Dispatch<SetStateAction<boolean>>;
  onBack: () => void;
}

const DR3FP_PREVIEW_STAGE_LABELS: Record<Exclude<Dr3FpPreviewStage, 'idle' | 'failed'>, string> = {
  exporting: 'Build',
  launching: 'Launch',
  receiver: 'Receiver',
  uploading: 'Upload',
  complete: 'Done',
};

const DR3FP_PREVIEW_STAGE_ORDER: Exclude<Dr3FpPreviewStage, 'idle' | 'failed'>[] = [
  'exporting',
  'launching',
  'receiver',
  'uploading',
  'complete',
];

const DR3FP_PREVIEW_FAILURE_GUIDANCE: Record<Dr3FpPreviewFailureKind, string[]> = {
  export: [
    'Check that the chart metadata and audio are still available, then try preview again.',
  ],
  launch: [
    'Install or extract DR3FanmadePlayer, then open DR3FP once so Windows registers the dr3fp:// preview link.',
    'If the browser asks whether it can open DR3FP, allow it.',
  ],
  receiver: [
    'Leave DR3FP open and try preview again after it finishes starting.',
    'If requests to 127.0.0.1:27373 are blocked, allow this editor page in privacy, ad blocking, or local-network browser settings.',
  ],
  upload: [
    'Keep DR3FP open while the chart transfers, then try preview again.',
    'If this repeats, update DR3FP to a build that supports preview receiver version 1.',
  ],
};

type SettingsSectionId = 'editor' | 'preview' | 'audio';
type HotkeyRow =
  | { kind: 'group'; groupTitle: string }
  | { kind: 'binding'; groupTitle: string; keys: readonly string[]; description: string };

interface VirtualizedListProps<T> {
  items: T[];
  estimateSize: number;
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
  overscan?: number;
}

function VirtualizedList<T>({
  items,
  estimateSize,
  getKey,
  renderItem,
  className = '',
  overscan = 2,
}: VirtualizedListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [itemSizes, setItemSizes] = useState(() => new Map<number, number>());
  const containerObserverRef = useRef<ResizeObserver | null>(null);
  const itemObserverRef = useRef<ResizeObserver | null>(null);
  const itemNodesRef = useRef(new Map<Element, number>());

  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    containerObserverRef.current?.disconnect();
    containerObserverRef.current = null;

    if (!node) return;

    setViewportHeight(node.clientHeight);
    const observer = new ResizeObserver(([entry]) => {
      setViewportHeight(entry.contentRect.height);
    });
    observer.observe(node);
    containerObserverRef.current = observer;
  }, []);

  const setItemRef = useCallback((index: number, node: HTMLDivElement | null) => {
    if (!itemObserverRef.current) {
      itemObserverRef.current = new ResizeObserver((entries) => {
        setItemSizes((currentSizes) => {
          let didChange = false;
          const nextSizes = new Map(currentSizes);

          entries.forEach((entry) => {
            const itemIndex = itemNodesRef.current.get(entry.target);
            if (itemIndex === undefined) return;

            const measuredHeight = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
            if (nextSizes.get(itemIndex) !== measuredHeight) {
              nextSizes.set(itemIndex, measuredHeight);
              didChange = true;
            }
          });

          return didChange ? nextSizes : currentSizes;
        });
      });
    }

    itemNodesRef.current.forEach((itemIndex, element) => {
      if (itemIndex === index) {
        itemObserverRef.current?.unobserve(element);
        itemNodesRef.current.delete(element);
      }
    });

    if (node) {
      itemNodesRef.current.set(node, index);
      itemObserverRef.current.observe(node);
    }
  }, []);

  const offsets = useMemo(() => {
    const nextOffsets = new Array<number>(items.length + 1);
    nextOffsets[0] = 0;

    for (let index = 0; index < items.length; index += 1) {
      nextOffsets[index + 1] = nextOffsets[index] + (itemSizes.get(index) ?? estimateSize);
    }

    return nextOffsets;
  }, [estimateSize, itemSizes, items.length]);

  const totalHeight = offsets[items.length] ?? 0;
  const firstVisibleIndex = offsets.findIndex((offset, index) => (
    index < items.length && offset + (itemSizes.get(index) ?? estimateSize) >= scrollTop
  ));
  const visibleStartIndex = Math.max(0, (firstVisibleIndex === -1 ? 0 : firstVisibleIndex) - overscan);
  let visibleEndIndex = visibleStartIndex;
  while (
    visibleEndIndex < items.length
    && offsets[visibleEndIndex] <= scrollTop + viewportHeight + overscan * estimateSize
  ) {
    visibleEndIndex += 1;
  }
  visibleEndIndex = Math.min(items.length, visibleEndIndex + overscan);

  return (
    <div
      ref={setContainerRef}
      className={`flex-1 overflow-y-auto ${className}`}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div className="relative" style={{ height: totalHeight }}>
        {items.slice(visibleStartIndex, visibleEndIndex).map((item, sliceIndex) => {
          const index = visibleStartIndex + sliceIndex;

          return (
            <div
              key={getKey(item, index)}
              ref={(node) => setItemRef(index, node)}
              className="absolute left-0 right-0 pb-5"
              style={{ transform: `translateY(${offsets[index]}px)` }}
            >
              {renderItem(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface SettingsToggleProps {
  label: string;
  description: string;
  isEnabled: boolean;
  ariaLabel: string;
  onToggle: () => void;
}

function SettingsToggle({
  label,
  description,
  isEnabled,
  ariaLabel,
  onToggle,
}: SettingsToggleProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-neutral-950/60 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-white">{label}</p>
          <p className="mt-1 text-xs leading-5 text-neutral-500">
            {description}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isEnabled}
          aria-label={ariaLabel}
          onClick={onToggle}
          className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border transition-colors ${
            isEnabled
              ? 'border-emerald-300/40 bg-emerald-500/90'
              : 'border-white/10 bg-neutral-800'
          }`}
        >
          <span className="sr-only">{label}</span>
          <span
            className={`absolute left-1 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform ${
              isEnabled ? 'translate-x-7' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </div>
  );
}

export default function EditorOverlays({
  isExitWarningOpen,
  isSettingsOpen,
  isHelpOpen,
  isDr3FpPreviewInfoOpen,
  dr3FpPreviewStatus,
  isExitWarningEnabled,
  isScrollDirectionInverted,
  isSelectionTypeMenuOpen,
  isStatisticsRefreshRateMenuOpen,
  selectionType,
  statisticsRefreshRate,
  musicVolume,
  tapSoundVolume,
  flickSoundVolume,
  isPreviewCameraTiltEnabled,
  isPreviewCameraMovementEnabled,
  isPreviewNoteSpeedChangesEnabled,
  isPreviewNoteAppearModeEnabled,
  setIsExitWarningOpen,
  setIsSettingsOpen,
  setIsHelpOpen,
  setIsDr3FpPreviewInfoOpen,
  setIsExitWarningEnabled,
  setIsScrollDirectionInverted,
  setIsSelectionTypeMenuOpen,
  setIsStatisticsRefreshRateMenuOpen,
  setSelectionType,
  setStatisticsRefreshRate,
  setMusicVolume,
  setTapSoundVolume,
  setFlickSoundVolume,
  setIsPreviewCameraTiltEnabled,
  setIsPreviewCameraMovementEnabled,
  setIsPreviewNoteSpeedChangesEnabled,
  setIsPreviewNoteAppearModeEnabled,
  onBack,
}: EditorOverlaysProps) {
  const closeSettings = () => {
    setIsSettingsOpen(false);
    setIsStatisticsRefreshRateMenuOpen(false);
    setIsSelectionTypeMenuOpen(false);
  };

  const settingsSections = useMemo<SettingsSectionId[]>(() => ['editor', 'preview', 'audio'], []);
  const hotkeyRows = useMemo<HotkeyRow[]>(() => (
    EDITOR_KEYBIND_GROUPS.flatMap(group => [
      { kind: 'group' as const, groupTitle: group.title },
      ...group.bindings.map(binding => ({
        kind: 'binding' as const,
        groupTitle: group.title,
        keys: binding.keys,
        description: binding.description,
      })),
    ])
  ), []);

  const renderHotkeyRow = (row: HotkeyRow) => {
    if (row.kind === 'group') {
      return (
        <h3 className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white">
          {row.groupTitle}
        </h3>
      );
    }

    return (
      <div className="grid gap-3 rounded-2xl border border-white/10 bg-neutral-950/60 p-4 sm:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="flex flex-wrap items-center gap-2">
          {row.keys.map((key, index) => (
            <Fragment key={`${row.groupTitle}-${key}-${index}`}>
              {index > 0 && <span className="text-xs text-neutral-600">+</span>}
              <kbd className="rounded-lg border border-white/10 bg-neutral-900 px-2 py-1 font-mono text-xs font-semibold text-neutral-200 shadow-inner shadow-black/30">
                {key}
              </kbd>
            </Fragment>
          ))}
        </div>
        <p className="text-sm leading-6 text-neutral-300">{row.description}</p>
      </div>
    );
  };

  const renderSettingsSection = (section: SettingsSectionId) => {
    if (section === 'editor') {
      return (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Editor</h3>
              <p className="mt-1 text-xs text-neutral-500">Control editor behavior and navigation safeguards.</p>
            </div>
          </div>

          <SettingsToggle
            label="Back to Landing warning"
            description="Show a confirmation popup before leaving the editor and discarding unexported work."
            isEnabled={isExitWarningEnabled}
            ariaLabel="Toggle Back to Landing warning"
            onToggle={() => setIsExitWarningEnabled((current) => !current)}
          />

          <div className="mt-4">
            <SettingsToggle
              label="Invert Scroll Direction"
              description="Reverse mouse wheel scrolling when moving through the editor canvas."
              isEnabled={isScrollDirectionInverted}
              ariaLabel="Toggle inverted canvas scroll direction"
              onToggle={() => setIsScrollDirectionInverted((current) => !current)}
            />
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-neutral-950/60 p-4">
            <div className="mb-3">
              <p className="text-sm font-medium text-white">Selection Type</p>
              <p className="mt-1 text-xs leading-5 text-neutral-500">
                Choose how middle-drag selection boxes collect notes.
              </p>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsStatisticsRefreshRateMenuOpen(false);
                  setIsSelectionTypeMenuOpen(current => !current);
                }}
                className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-left text-sm text-neutral-200 outline-none transition-colors hover:bg-neutral-800 focus:border-indigo-500"
                aria-haspopup="menu"
                aria-expanded={isSelectionTypeMenuOpen}
              >
                <span>{SELECTION_TYPE_LABELS[selectionType]}</span>
                <ChevronRight className={`h-4 w-4 text-neutral-500 transition-transform ${isSelectionTypeMenuOpen ? 'rotate-90' : ''}`} />
              </button>
              {isSelectionTypeMenuOpen && (
                <div
                  className="absolute left-0 right-0 top-full z-50 mt-2 rounded-lg border border-neutral-700 bg-neutral-950 p-1 shadow-2xl shadow-black/40"
                  role="menu"
                >
                  {SELECTION_TYPE_OPTIONS.map((nextSelectionType) => (
                    <button
                      key={nextSelectionType}
                      type="button"
                      onClick={() => {
                        setSelectionType(nextSelectionType);
                        setIsSelectionTypeMenuOpen(false);
                      }}
                      className={`w-full rounded px-3 py-2 text-left text-sm transition-colors ${
                        selectionType === nextSelectionType
                          ? 'bg-indigo-500/20 text-indigo-200'
                          : 'text-neutral-200 hover:bg-neutral-800'
                      }`}
                      role="menuitem"
                    >
                      {SELECTION_TYPE_LABELS[nextSelectionType]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-neutral-950/60 p-4">
            <div className="mb-3">
              <p className="text-sm font-medium text-white">Statistics Refresh Rate</p>
              <p className="mt-1 text-xs leading-5 text-neutral-500">
                Limit how often live statistics update in the properties window.
              </p>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsSelectionTypeMenuOpen(false);
                  setIsStatisticsRefreshRateMenuOpen(current => !current);
                }}
                className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-left font-mono text-sm text-neutral-200 outline-none transition-colors hover:bg-neutral-800 focus:border-indigo-500"
                aria-haspopup="menu"
                aria-expanded={isStatisticsRefreshRateMenuOpen}
              >
                <span>{statisticsRefreshRate}</span>
                <ChevronRight className={`h-4 w-4 text-neutral-500 transition-transform ${isStatisticsRefreshRateMenuOpen ? 'rotate-90' : ''}`} />
              </button>
              {isStatisticsRefreshRateMenuOpen && (
                <div
                  className="absolute left-0 right-0 top-full z-50 mt-2 rounded-lg border border-neutral-700 bg-neutral-950 p-1 shadow-2xl shadow-black/40"
                  role="menu"
                >
                  {STATISTICS_REFRESH_RATE_OPTIONS.map((refreshRate) => (
                    <button
                      key={refreshRate}
                      type="button"
                      onClick={() => {
                        setStatisticsRefreshRate(refreshRate);
                        setIsStatisticsRefreshRateMenuOpen(false);
                      }}
                      className={`w-full rounded px-3 py-2 text-left font-mono text-sm transition-colors ${
                        statisticsRefreshRate === refreshRate
                          ? 'bg-indigo-500/20 text-indigo-200'
                          : 'text-neutral-200 hover:bg-neutral-800'
                      }`}
                      role="menuitem"
                    >
                      {refreshRate}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      );
    }

    if (section === 'preview') {
      return (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Preview Mode</h3>
              <p className="mt-1 text-xs text-neutral-500">Choose which chart effects are simulated during preview playback.</p>
            </div>
          </div>

          <div className="space-y-4">
            <SettingsToggle
              label="Camera Tilt"
              description="Rotate the preview camera while active hold connectors pass through the judgement line."
              isEnabled={isPreviewCameraTiltEnabled}
              ariaLabel="Toggle preview camera tilt"
              onToggle={() => setIsPreviewCameraTiltEnabled((current) => !current)}
            />
            <SettingsToggle
              label="Camera Movement"
              description="Move the preview camera horizontally along pink hold paths."
              isEnabled={isPreviewCameraMovementEnabled}
              ariaLabel="Toggle preview camera movement"
              onToggle={() => setIsPreviewCameraMovementEnabled((current) => !current)}
            />
            <SettingsToggle
              label="Note Speed Changes"
              description="Apply per-note speed multipliers and speed curves in preview mode."
              isEnabled={isPreviewNoteSpeedChangesEnabled}
              ariaLabel="Toggle preview note speed changes"
              onToggle={() => setIsPreviewNoteSpeedChangesEnabled((current) => !current)}
            />
            <SettingsToggle
              label="Note Appear Mode"
              description="Apply note appear modes such as side entry, fly-down, and proximity visibility."
              isEnabled={isPreviewNoteAppearModeEnabled}
              ariaLabel="Toggle preview note appear mode"
              onToggle={() => setIsPreviewNoteAppearModeEnabled((current) => !current)}
            />
          </div>
        </section>
      );
    }

    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Audio</h3>
            <p className="mt-1 text-xs text-neutral-500">Balance music playback and editor hit sounds.</p>
          </div>
        </div>

        <div className="space-y-5">
          <label className="block">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-neutral-300">Music volume</span>
              <span className="font-mono text-xs text-neutral-500">{Math.round(musicVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.01"
              value={musicVolume}
              onChange={(e) => setMusicVolume(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-neutral-800 accent-indigo-500"
            />
          </label>

          <label className="block">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-neutral-300">Taps volume</span>
              <span className="font-mono text-xs text-neutral-500">{Math.round(tapSoundVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.01"
              value={tapSoundVolume}
              onChange={(e) => setTapSoundVolume(Number(e.target.value))}
              aria-label="Taps volume"
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-neutral-800 accent-indigo-500"
            />
          </label>

          <label className="block">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-neutral-300">Flicks volume</span>
              <span className="font-mono text-xs text-neutral-500">{Math.round(flickSoundVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.01"
              value={flickSoundVolume}
              onChange={(e) => setFlickSoundVolume(Number(e.target.value))}
              aria-label="Flicks volume"
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-neutral-800 accent-indigo-500"
            />
          </label>
        </div>
      </section>
    );
  };

  return (
    <AnimatePresence>
      {isExitWarningOpen && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={() => setIsExitWarningOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="exit-warning-title"
            className="flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/10 bg-neutral-950/90 shadow-2xl shadow-black/50"
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-white/10 bg-gradient-to-br from-neutral-900 to-neutral-950 px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-400/80">Warning</p>
              <h2 id="exit-warning-title" className="mt-2 text-2xl font-semibold text-white">Leave the editor?</h2>
            </div>

            <div className="px-6 py-6">
              <p className="text-sm leading-6 text-neutral-300">
                All unsaved or unexported work will be lost if you go back to the landing page.
              </p>
            </div>

            <div className="flex gap-3 border-t border-white/10 p-4">
              <button
                onClick={() => {
                  setIsExitWarningOpen(false);
                  onBack();
                }}
                className="flex-1 rounded-2xl bg-red-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-400"
              >
                Quit
              </button>
              <button
                onClick={() => setIsExitWarningOpen(false)}
                className="flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-neutral-200 transition-colors hover:bg-white/[0.08]"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {isDr3FpPreviewInfoOpen && (
        <motion.div
          className="fixed inset-0 z-[65] flex items-center justify-center bg-black/55 p-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={() => setIsDr3FpPreviewInfoOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dr3fp-preview-info-title"
            className="flex w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-neutral-950/90 shadow-2xl shadow-black/50"
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-white/10 bg-gradient-to-br from-neutral-900 to-neutral-950 px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-300/80">DR3FP Preview</p>
              <h2 id="dr3fp-preview-info-title" className="mt-2 text-2xl font-semibold text-white">
                {dr3FpPreviewStatus.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-neutral-400">
                {dr3FpPreviewStatus.message}
              </p>
            </div>

            <div className="space-y-5 px-6 py-6">
              <div className="space-y-2">
                {DR3FP_PREVIEW_STAGE_ORDER.map((stage, index) => {
                  const currentIndex = DR3FP_PREVIEW_STAGE_ORDER.indexOf(
                    dr3FpPreviewStatus.stage === 'failed'
                      ? (
                        dr3FpPreviewStatus.failureKind === 'export'
                          ? 'exporting'
                          : dr3FpPreviewStatus.failureKind === 'launch'
                            ? 'launching'
                            : dr3FpPreviewStatus.failureKind === 'receiver'
                              ? 'receiver'
                              : 'uploading'
                      )
                      : dr3FpPreviewStatus.stage === 'idle'
                        ? 'exporting'
                        : dr3FpPreviewStatus.stage,
                  );
                  const isActive = dr3FpPreviewStatus.stage !== 'complete'
                    && dr3FpPreviewStatus.stage !== 'failed'
                    && stage === dr3FpPreviewStatus.stage;
                  const isComplete = dr3FpPreviewStatus.stage === 'complete' || index < currentIndex;
                  const isFailed = dr3FpPreviewStatus.stage === 'failed' && index === currentIndex;

                  return (
                    <div
                      key={stage}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${
                        isFailed
                          ? 'border-red-400/30 bg-red-500/10 text-red-100'
                          : isActive
                            ? 'border-indigo-400/30 bg-indigo-500/10 text-indigo-100'
                            : isComplete
                              ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'
                              : 'border-white/10 bg-white/[0.03] text-neutral-500'
                      }`}
                    >
                      {isFailed ? (
                        <XCircle className="h-4 w-4 shrink-0" />
                      ) : isActive ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      ) : isComplete ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                      ) : (
                        <span className="h-4 w-4 shrink-0 rounded-full border border-current opacity-50" />
                      )}
                      <span className="font-medium">{DR3FP_PREVIEW_STAGE_LABELS[stage]}</span>
                    </div>
                  );
                })}
              </div>

              {dr3FpPreviewStatus.stage === 'failed' && dr3FpPreviewStatus.failureKind && (
                <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4">
                  <p className="text-sm font-semibold text-red-100">What happened</p>
                  <p className="mt-2 text-sm leading-6 text-red-100/80">
                    {dr3FpPreviewStatus.message}
                  </p>
                  {dr3FpPreviewStatus.detail && (
                    <p className="mt-2 rounded-lg bg-black/20 px-3 py-2 font-mono text-xs text-red-100/70">
                      {dr3FpPreviewStatus.detail}
                    </p>
                  )}
                  <p className="mt-4 text-sm font-semibold text-red-100">Try this</p>
                  <ul className="mt-2 space-y-2 text-sm leading-6 text-red-100/80">
                    {DR3FP_PREVIEW_FAILURE_GUIDANCE[dr3FpPreviewStatus.failureKind].map(item => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-200/80" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  {dr3FpPreviewStatus.failureKind === 'launch' && (
                    <a
                      href="https://github.com/swordalt/DanceRail3FanmadePlayer/releases"
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex text-sm font-medium text-red-100 underline decoration-red-100/40 underline-offset-4 transition-colors hover:text-white"
                    >
                      DanceRail3FanmadePlayer releases
                    </a>
                  )}
                </div>
              )}

              {dr3FpPreviewStatus.stage === 'complete' && (
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100/80">
                  Switch to DR3FP to play the preview.
                </div>
              )}
            </div>

            <div className="border-t border-white/10 p-4">
              <button
                type="button"
                onClick={() => setIsDr3FpPreviewInfoOpen(false)}
                className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-neutral-950 transition-colors hover:bg-neutral-200"
              >
                {dr3FpPreviewStatus.stage === 'failed' ? 'Close' : 'Done'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {isSettingsOpen && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={closeSettings}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            className="flex max-h-[85vh] min-h-[22rem] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-neutral-950/90 shadow-2xl shadow-black/50"
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-white/10 bg-gradient-to-br from-neutral-900 to-neutral-950 px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">Editor</p>
              <h2 id="settings-title" className="mt-2 text-2xl font-semibold text-white">Settings</h2>
            </div>

            <VirtualizedList
              items={settingsSections}
              estimateSize={360}
              getKey={(section) => section}
              renderItem={(section) => renderSettingsSection(section)}
              className="px-6 py-6"
            />
            <div className="border-t border-white/10 p-4">
              <button
                onClick={closeSettings}
                className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-neutral-950 transition-colors hover:bg-neutral-200"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {isHelpOpen && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={() => setIsHelpOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="hotkeys-title"
            className="flex max-h-[85vh] min-h-[22rem] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-neutral-950/90 shadow-2xl shadow-black/50"
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-white/10 bg-gradient-to-br from-neutral-900 to-neutral-950 px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">Editor</p>
              <h2 id="hotkeys-title" className="mt-2 text-2xl font-semibold text-white">Hotkeys</h2>
            </div>

            <VirtualizedList
              items={hotkeyRows}
              estimateSize={86}
              getKey={(row, index) => row.kind === 'group' ? `group-${row.groupTitle}` : `binding-${row.groupTitle}-${row.keys.join('-')}-${index}`}
              renderItem={(row) => renderHotkeyRow(row)}
              className="px-6 py-6"
            />
            <div className="border-t border-white/10 p-4">
              <button
                onClick={() => setIsHelpOpen(false)}
                className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-neutral-950 transition-colors hover:bg-neutral-200"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

