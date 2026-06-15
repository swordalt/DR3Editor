import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { CheckCircle2, ChevronRight, Loader2, XCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type {
  Dr3FpPreviewFailureKind,
  Dr3FpPreviewLogEntry,
  Dr3FpPreviewStage,
  Dr3FpPreviewStatus,
} from '../editor/dr3FpPreviewStatus';
import { EDITOR_KEYBIND_GROUPS } from '../editor/editorKeybinds';
import {
  SELECTION_TYPE_OPTIONS,
  STATISTICS_REFRESH_RATE_OPTIONS,
  type SelectionType,
  type StatisticsRefreshRate,
} from '../editor/editorSettings';
import { SELECTION_TYPE_LABELS } from '../editor/editorViewConstants';
import { translations } from '../lang';
import {
  dialogFooterClassName,
  dialogHeaderClassName,
  dialogSurfaceClassName,
  getDialogMotionProps,
  getOverlayClassName,
  getOverlayMotionProps,
  menuSurfaceClassName,
} from './editorDesign';

interface EditorOverlaysProps {
  isExitWarningOpen: boolean;
  isSettingsOpen: boolean;
  isHelpOpen: boolean;
  isDr3FpPreviewInfoOpen: boolean;
  dr3FpPreviewStatus: Dr3FpPreviewStatus;
  dr3FpPreviewLogs: Dr3FpPreviewLogEntry[];
  isExitWarningEnabled: boolean;
  isBackdropBlurDisabled: boolean;
  isAnimationDisabled: boolean;
  isScrollDirectionInverted: boolean;
  areTimingChangeIndicatorsAdjusted: boolean;
  isEditorJudgementGlowEnabled: boolean;
  isVSyncEnabled: boolean;
  isDr3FpPreviewEnabled: boolean;
  isPreviewPrecomputeEnabled: boolean;
  isPreviewHoldSpritesEnabled: boolean;
  isSelectionTypeMenuOpen: boolean;
  isStatisticsRefreshRateMenuOpen: boolean;
  selectionType: SelectionType;
  statisticsRefreshRate: StatisticsRefreshRate;
  musicVolume: number;
  tapSoundVolume: number;
  flickSoundVolume: number;
  setIsExitWarningOpen: Dispatch<SetStateAction<boolean>>;
  setIsSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setIsHelpOpen: Dispatch<SetStateAction<boolean>>;
  setIsDr3FpPreviewInfoOpen: Dispatch<SetStateAction<boolean>>;
  setIsExitWarningEnabled: Dispatch<SetStateAction<boolean>>;
  setIsBackdropBlurDisabled: Dispatch<SetStateAction<boolean>>;
  setIsAnimationDisabled: Dispatch<SetStateAction<boolean>>;
  setIsScrollDirectionInverted: Dispatch<SetStateAction<boolean>>;
  setAreTimingChangeIndicatorsAdjusted: Dispatch<SetStateAction<boolean>>;
  setIsEditorJudgementGlowEnabled: Dispatch<SetStateAction<boolean>>;
  setIsVSyncEnabled: Dispatch<SetStateAction<boolean>>;
  setIsDr3FpPreviewEnabled: Dispatch<SetStateAction<boolean>>;
  setIsPreviewPrecomputeEnabled: Dispatch<SetStateAction<boolean>>;
  setIsPreviewHoldSpritesEnabled: Dispatch<SetStateAction<boolean>>;
  setIsSelectionTypeMenuOpen: Dispatch<SetStateAction<boolean>>;
  setIsStatisticsRefreshRateMenuOpen: Dispatch<SetStateAction<boolean>>;
  setSelectionType: Dispatch<SetStateAction<SelectionType>>;
  setStatisticsRefreshRate: Dispatch<SetStateAction<StatisticsRefreshRate>>;
  setMusicVolume: Dispatch<SetStateAction<number>>;
  setTapSoundVolume: Dispatch<SetStateAction<number>>;
  setFlickSoundVolume: Dispatch<SetStateAction<number>>;
  onBack: () => void;
}

const DR3FP_PREVIEW_STAGE_LABELS = translations.status.dr3FpStages;

const DR3FP_PREVIEW_STAGE_ORDER: Exclude<Dr3FpPreviewStage, 'idle' | 'failed'>[] = [
  'exporting',
  'launching',
  'receiver',
  'uploading',
  'complete',
];

const DR3FP_PREVIEW_FAILURE_GUIDANCE = translations.status.dr3FpFailureGuidance;

type SettingsSectionId = 'safety' | 'editing' | 'performance' | 'appearance' | 'audio' | 'experimental';
type HotkeyRow =
  | { kind: 'group'; groupTitle: string }
  | { kind: 'binding'; groupTitle: string; keys: readonly string[]; description: string };

interface VirtualizedListProps<T> {
  items: T[];
  estimateSize: number;
  getKey: (item: T, index: number) => string;
  getItemClassName?: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
  overscan?: number;
}

interface VirtualizedListItemProps<T> {
  item: T;
  index: number;
  offset: number;
  className: string;
  renderItem: (item: T, index: number) => ReactNode;
  onSizeChange: (index: number, size: number) => void;
}

function VirtualizedListItem<T>({
  item,
  index,
  offset,
  className,
  renderItem,
  onSizeChange,
}: VirtualizedListItemProps<T>) {
  const itemRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = itemRef.current;
    if (!node) return;

    const measure = () => {
      onSizeChange(index, node.getBoundingClientRect().height);
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);

    return () => observer.disconnect();
  }, [index, onSizeChange]);

  return (
    <div
      ref={itemRef}
      className={`absolute left-0 right-0 pb-5 ${className}`}
      style={{ transform: `translateY(${offset}px)` }}
    >
      {renderItem(item, index)}
    </div>
  );
}

function VirtualizedList<T>({
  items,
  estimateSize,
  getKey,
  getItemClassName,
  renderItem,
  className = '',
  overscan = 2,
}: VirtualizedListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [itemSizes, setItemSizes] = useState(() => new Map<number, number>());
  const containerObserverRef = useRef<ResizeObserver | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const pendingScrollTopRef = useRef(0);

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

  const updateItemSize = useCallback((index: number, size: number) => {
    setItemSizes((currentSizes) => {
      if (currentSizes.get(index) === size) return currentSizes;

      const nextSizes = new Map(currentSizes);
      nextSizes.set(index, size);
      return nextSizes;
    });
  }, []);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    pendingScrollTopRef.current = event.currentTarget.scrollTop;

    if (scrollFrameRef.current !== null) return;

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      setScrollTop(pendingScrollTopRef.current);
    });
  }, []);

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
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
  let lowIndex = 0;
  let highIndex = items.length;
  while (lowIndex < highIndex) {
    const middleIndex = Math.floor((lowIndex + highIndex) / 2);
    if (offsets[middleIndex + 1] < scrollTop) {
      lowIndex = middleIndex + 1;
    } else {
      highIndex = middleIndex;
    }
  }

  const visibleStartIndex = Math.max(0, lowIndex - overscan);
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
      onScroll={handleScroll}
    >
      <div className="relative" style={{ height: totalHeight }}>
        {items.slice(visibleStartIndex, visibleEndIndex).map((item, sliceIndex) => {
          const index = visibleStartIndex + sliceIndex;

          return (
            <VirtualizedListItem
              key={getKey(item, index)}
              item={item}
              index={index}
              offset={offsets[index]}
              className={getItemClassName?.(item, index) ?? ''}
              renderItem={renderItem}
              onSizeChange={updateItemSize}
            />
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
  dr3FpPreviewLogs,
  isExitWarningEnabled,
  isBackdropBlurDisabled,
  isAnimationDisabled,
  isScrollDirectionInverted,
  areTimingChangeIndicatorsAdjusted,
  isEditorJudgementGlowEnabled,
  isVSyncEnabled,
  isDr3FpPreviewEnabled,
  isPreviewPrecomputeEnabled,
  isPreviewHoldSpritesEnabled,
  isSelectionTypeMenuOpen,
  isStatisticsRefreshRateMenuOpen,
  selectionType,
  statisticsRefreshRate,
  musicVolume,
  tapSoundVolume,
  flickSoundVolume,
  setIsExitWarningOpen,
  setIsSettingsOpen,
  setIsHelpOpen,
  setIsDr3FpPreviewInfoOpen,
  setIsExitWarningEnabled,
  setIsBackdropBlurDisabled,
  setIsAnimationDisabled,
  setIsScrollDirectionInverted,
  setAreTimingChangeIndicatorsAdjusted,
  setIsEditorJudgementGlowEnabled,
  setIsVSyncEnabled,
  setIsDr3FpPreviewEnabled,
  setIsPreviewPrecomputeEnabled,
  setIsPreviewHoldSpritesEnabled,
  setIsSelectionTypeMenuOpen,
  setIsStatisticsRefreshRateMenuOpen,
  setSelectionType,
  setStatisticsRefreshRate,
  setMusicVolume,
  setTapSoundVolume,
  setFlickSoundVolume,
  onBack,
}: EditorOverlaysProps) {
  const text = translations;
  const [isDr3FpPreviewLogOpen, setIsDr3FpPreviewLogOpen] = useState(true);
  const closeSettings = () => {
    setIsSettingsOpen(false);
    setIsStatisticsRefreshRateMenuOpen(false);
    setIsSelectionTypeMenuOpen(false);
  };

  const settingsSections = useMemo<SettingsSectionId[]>(() => [
    'safety',
    'editing',
    'performance',
    'appearance',
    'audio',
    'experimental',
  ], []);
  const overlayClassName = getOverlayClassName(isBackdropBlurDisabled, isAnimationDisabled, '');
  const overlayMotionProps = getOverlayMotionProps(isAnimationDisabled);
  const dialogMotionProps = getDialogMotionProps(isAnimationDisabled);
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
    if (section === 'safety') {
      return (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">{text.overlays.safety}</h3>
              <p className="mt-1 text-xs text-neutral-500">{text.overlays.safetyDescription}</p>
            </div>
          </div>

          <SettingsToggle
            label={text.overlays.backToLandingWarning}
            description={text.overlays.backToLandingWarningDescription}
            isEnabled={isExitWarningEnabled}
            ariaLabel={text.overlays.toggleBackToLandingWarning}
            onToggle={() => setIsExitWarningEnabled((current) => !current)}
          />
        </section>
      );
    }

    if (section === 'editing') {
      return (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">{text.overlays.editing}</h3>
              <p className="mt-1 text-xs text-neutral-500">{text.overlays.editingDescription}</p>
            </div>
          </div>

          <SettingsToggle
            label={text.overlays.invertScrollDirection}
            description={text.overlays.invertScrollDirectionDescription}
            isEnabled={isScrollDirectionInverted}
            ariaLabel={text.overlays.toggleInvertScrollDirection}
            onToggle={() => setIsScrollDirectionInverted((current) => !current)}
          />

          <div className="mt-4">
            <SettingsToggle
              label={text.overlays.adjustTimingChangeIndicators}
              description={text.overlays.adjustTimingChangeIndicatorsDescription}
              isEnabled={areTimingChangeIndicatorsAdjusted}
              ariaLabel={text.overlays.toggleAdjustTimingChangeIndicators}
              onToggle={() => setAreTimingChangeIndicatorsAdjusted((current) => !current)}
            />
          </div>

          <div className="mt-4">
            <SettingsToggle
              label={text.overlays.editorJudgementGlow}
              description={text.overlays.editorJudgementGlowDescription}
              isEnabled={isEditorJudgementGlowEnabled}
              ariaLabel={text.overlays.toggleEditorJudgementGlow}
              onToggle={() => setIsEditorJudgementGlowEnabled((current) => !current)}
            />
          </div>

          <div className={`relative mt-4 rounded-2xl border border-white/10 bg-neutral-950/60 p-4 ${isSelectionTypeMenuOpen ? 'z-20' : 'z-0'}`}>
            <div className="mb-3">
              <p className="text-sm font-medium text-white">{text.overlays.selectionType}</p>
              <p className="mt-1 text-xs leading-5 text-neutral-500">
                {text.overlays.selectionTypeDescription}
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
                  className={`absolute left-0 right-0 top-full z-50 mt-2 ${menuSurfaceClassName}`}
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
        </section>
      );
    }

    if (section === 'appearance') {
      return (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">{text.overlays.appearance}</h3>
              <p className="mt-1 text-xs text-neutral-500">{text.overlays.appearanceDescription}</p>
            </div>
          </div>

          <SettingsToggle
            label={text.overlays.disableBlurEffects}
            description={text.overlays.disableBlurEffectsDescription}
            isEnabled={isBackdropBlurDisabled}
            ariaLabel={text.overlays.toggleBlurEffects}
            onToggle={() => setIsBackdropBlurDisabled((current) => !current)}
          />

          <div className="mt-4">
            <SettingsToggle
              label={text.overlays.disableAnimations}
              description={text.overlays.disableAnimationsDescription}
              isEnabled={isAnimationDisabled}
              ariaLabel={text.overlays.toggleAnimations}
              onToggle={() => setIsAnimationDisabled((current) => !current)}
            />
          </div>
        </section>
      );
    }

    if (section === 'audio') {
      return (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">{text.overlays.audio}</h3>
              <p className="mt-1 text-xs text-neutral-500">{text.overlays.audioDescription}</p>
            </div>
          </div>

          <div className="space-y-5">
            <label className="block">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-neutral-300">{text.overlays.musicVolume}</span>
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
                <span className="text-neutral-300">{text.overlays.tapsVolume}</span>
                <span className="font-mono text-xs text-neutral-500">{Math.round(tapSoundVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.01"
                value={tapSoundVolume}
                onChange={(e) => setTapSoundVolume(Number(e.target.value))}
                aria-label={text.overlays.tapsVolume}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-neutral-800 accent-indigo-500"
              />
            </label>

            <label className="block">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-neutral-300">{text.overlays.flicksVolume}</span>
                <span className="font-mono text-xs text-neutral-500">{Math.round(flickSoundVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.01"
                value={flickSoundVolume}
                onChange={(e) => setFlickSoundVolume(Number(e.target.value))}
                aria-label={text.overlays.flicksVolume}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-neutral-800 accent-indigo-500"
              />
            </label>
          </div>
        </section>
      );
    }

    if (section === 'performance') {
      return (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">{text.overlays.performance}</h3>
              <p className="mt-1 text-xs text-neutral-500">{text.overlays.performanceDescription}</p>
            </div>
          </div>

          <SettingsToggle
            label={text.overlays.vSync}
            description={text.overlays.vSyncDescription}
            isEnabled={isVSyncEnabled}
            ariaLabel={text.overlays.toggleVSync}
            onToggle={() => setIsVSyncEnabled((current) => !current)}
          />

          <div className="mt-4">
            <SettingsToggle
              label={text.overlays.previewPrecompute}
              description={text.overlays.previewPrecomputeDescription}
              isEnabled={isPreviewPrecomputeEnabled}
              ariaLabel={text.overlays.togglePreviewPrecompute}
              onToggle={() => setIsPreviewPrecomputeEnabled((current) => !current)}
            />
          </div>

          <div className={`relative mt-4 rounded-2xl border border-white/10 bg-neutral-950/60 p-4 ${isStatisticsRefreshRateMenuOpen ? 'z-20' : 'z-0'}`}>
            <div className="mb-3">
              <p className="text-sm font-medium text-white">{text.overlays.statisticsRefreshRate}</p>
              <p className="mt-1 text-xs leading-5 text-neutral-500">
                {text.overlays.statisticsRefreshRateDescription}
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
                  className={`absolute left-0 right-0 top-full z-50 mt-2 ${menuSurfaceClassName}`}
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

    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">{text.overlays.experimental}</h3>
            <p className="mt-1 text-xs text-neutral-500">{text.overlays.experimentalDescription}</p>
          </div>
        </div>

        <SettingsToggle
          label={text.overlays.useHoldSprites}
          description={text.overlays.useHoldSpritesDescription}
          isEnabled={isPreviewHoldSpritesEnabled}
          ariaLabel={text.overlays.toggleUseHoldSprites}
          onToggle={() => setIsPreviewHoldSpritesEnabled((current) => !current)}
        />

        <div className="mt-4">
          <SettingsToggle
            label={text.overlays.dr3FpPreview}
            description={text.overlays.dr3FpPreviewDescription}
            isEnabled={isDr3FpPreviewEnabled}
            ariaLabel={text.overlays.toggleDr3FpPreview}
            onToggle={() => setIsDr3FpPreviewEnabled((current) => !current)}
          />
        </div>

      </section>
    );
  };

  return (
    <AnimatePresence>
      {isExitWarningOpen && (
        <motion.div
          className={`${overlayClassName} z-[70]`}
          {...overlayMotionProps}
          onMouseDown={() => setIsExitWarningOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="exit-warning-title"
            className={`w-full max-w-md ${dialogSurfaceClassName}`}
            {...dialogMotionProps}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className={dialogHeaderClassName}>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-400/80">{text.overlays.warning}</p>
              <h2 id="exit-warning-title" className="mt-2 text-2xl font-semibold text-white">{text.overlays.leaveEditor}</h2>
            </div>

            <div className="px-6 py-6">
              <p className="text-sm leading-6 text-neutral-300">
                {text.overlays.leaveEditorDescription}
              </p>
            </div>

            <div className={`${dialogFooterClassName} flex gap-3`}>
              <button
                onClick={() => {
                  setIsExitWarningOpen(false);
                  onBack();
                }}
                className="flex-1 rounded-2xl bg-red-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-400"
              >
                {text.overlays.quit}
              </button>
              <button
                onClick={() => setIsExitWarningOpen(false)}
                className="flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-neutral-200 transition-colors hover:bg-white/[0.08]"
              >
                {text.common.cancel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {isDr3FpPreviewInfoOpen && (
        <motion.div
          className={`${overlayClassName} z-[65]`}
          {...overlayMotionProps}
          onMouseDown={() => setIsDr3FpPreviewInfoOpen(false)}
        >
          <motion.div
            className="flex max-h-[85vh] w-full max-w-[70rem] items-stretch justify-center gap-4"
            {...dialogMotionProps}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="dr3fp-preview-info-title"
              className={`min-h-[34rem] w-full max-w-lg ${dialogSurfaceClassName}`}
            >
              <div className={dialogHeaderClassName}>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-300/80">{text.overlays.dr3FpPreview}</p>
                <h2 id="dr3fp-preview-info-title" className="mt-2 text-2xl font-semibold text-white">
                  {dr3FpPreviewStatus.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-neutral-400">
                  {dr3FpPreviewStatus.message}
                </p>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
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
                  <details className="group rounded-2xl border border-red-400/20 bg-red-500/10">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-red-100 transition-colors hover:bg-red-500/10 [&::-webkit-details-marker]:hidden">
                      <span>{text.overlays.whatHappened}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="border-t border-red-400/10 px-4 pb-4 pt-3">
                      <p className="text-sm leading-6 text-red-100/80">
                        {dr3FpPreviewStatus.message}
                      </p>
                      {dr3FpPreviewStatus.detail && (
                        <p className="mt-2 rounded-lg bg-black/20 px-3 py-2 font-mono text-xs text-red-100/70">
                          {dr3FpPreviewStatus.detail}
                        </p>
                      )}
                      <p className="mt-4 text-sm font-semibold text-red-100">{text.overlays.tryThis}</p>
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
                          {text.overlays.dr3FpReleases}
                        </a>
                      )}
                    </div>
                  </details>
                )}

                {dr3FpPreviewStatus.stage === 'complete' && (
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100/80">
                    {text.overlays.switchToDr3Fp}
                  </div>
                )}
              </div>

              <div className={dialogFooterClassName}>
                <button
                  type="button"
                  onClick={() => setIsDr3FpPreviewInfoOpen(false)}
                  className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-neutral-950 transition-colors hover:bg-neutral-200"
                >
                  {dr3FpPreviewStatus.stage === 'failed' ? text.common.close : text.common.done}
                </button>
              </div>
            </section>

            {isDr3FpPreviewLogOpen ? (
              <aside className={`min-h-[34rem] w-full max-w-lg ${dialogSurfaceClassName}`}>
                <div className={`${dialogHeaderClassName} flex items-center justify-between gap-3`}>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">{text.overlays.dr3FpPreview}</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">{text.overlays.previewLog}</h2>
                  </div>
                  <button
                    type="button"
                    aria-label={text.overlays.collapsePreviewLog}
                    onClick={() => setIsDr3FpPreviewLogOpen(false)}
                    className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-neutral-300 transition-colors hover:bg-white/[0.08] hover:text-white"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto px-6 py-6">
                  {dr3FpPreviewLogs.map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex items-start gap-3">
                        <span className="shrink-0 font-mono text-xs text-neutral-500">{entry.time}</span>
                        <div className="min-w-0">
                          <p className="text-sm leading-6 text-neutral-200">{entry.message}</p>
                          {entry.detail && (
                            <p className="mt-2 break-words rounded-lg bg-black/20 px-3 py-2 font-mono text-xs leading-5 text-neutral-400">
                              {entry.detail}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </aside>
            ) : (
              <button
                type="button"
                aria-label={text.overlays.expandPreviewLog}
                onClick={() => setIsDr3FpPreviewLogOpen(true)}
                className="flex min-h-[34rem] w-14 shrink-0 flex-col items-center justify-center gap-3 rounded-3xl border border-white/10 bg-neutral-950/90 text-neutral-300 shadow-2xl shadow-black/50 transition-colors hover:bg-neutral-900 hover:text-white"
              >
                <ChevronRight className="h-4 w-4 rotate-180" />
                <span className="[writing-mode:vertical-rl] text-xs font-semibold uppercase tracking-[0.3em]">{text.overlays.previewLog}</span>
              </button>
            )}
          </motion.div>
        </motion.div>
      )}

      {isSettingsOpen && (
        <motion.div
          className={`${overlayClassName} z-[60]`}
          {...overlayMotionProps}
          onMouseDown={closeSettings}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            className={`max-h-[85vh] min-h-[22rem] w-full max-w-2xl ${dialogSurfaceClassName}`}
            {...dialogMotionProps}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className={dialogHeaderClassName}>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">{text.overlays.editor}</p>
              <h2 id="settings-title" className="mt-2 text-2xl font-semibold text-white">{text.editor.settings}</h2>
            </div>

            <VirtualizedList
              items={settingsSections}
              estimateSize={360}
              getKey={(section) => section}
              getItemClassName={(section) => (
                (section === 'editing' && isSelectionTypeMenuOpen)
                  || (section === 'performance' && isStatisticsRefreshRateMenuOpen)
                  ? 'z-20'
                  : 'z-0'
              )}
              renderItem={(section) => renderSettingsSection(section)}
              className="px-6 py-6"
            />
            <div className={dialogFooterClassName}>
              <button
                onClick={closeSettings}
                className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-neutral-950 transition-colors hover:bg-neutral-200"
              >
                {text.common.close}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {isHelpOpen && (
        <motion.div
          className={`${overlayClassName} z-[60]`}
          {...overlayMotionProps}
          onMouseDown={() => setIsHelpOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="hotkeys-title"
            className={`max-h-[85vh] min-h-[22rem] w-full max-w-2xl ${dialogSurfaceClassName}`}
            {...dialogMotionProps}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className={dialogHeaderClassName}>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">{text.overlays.editor}</p>
              <h2 id="hotkeys-title" className="mt-2 text-2xl font-semibold text-white">{text.editor.hotkeys}</h2>
            </div>

            <VirtualizedList
              items={hotkeyRows}
              estimateSize={86}
              getKey={(row, index) => row.kind === 'group' ? `group-${row.groupTitle}` : `binding-${row.groupTitle}-${row.keys.join('-')}-${index}`}
              renderItem={(row) => renderHotkeyRow(row)}
              className="px-6 py-6"
            />
            <div className={dialogFooterClassName}>
              <button
                onClick={() => setIsHelpOpen(false)}
                className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-neutral-950 transition-colors hover:bg-neutral-200"
              >
                {text.common.close}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

