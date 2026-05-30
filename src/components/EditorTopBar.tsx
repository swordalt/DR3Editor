import { useState } from 'react';
import type { ChangeEvent, Dispatch, FormEvent, RefObject, SetStateAction } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, Download, Grid2x2, Grid2x2X, HelpCircle, LoaderCircle, MoveHorizontal, Pause, Play, Settings, X } from 'lucide-react';
import { PLAYBACK_SPEED_OPTIONS } from '../editor/editorViewConstants';
import { formatPlaybackSpeed } from '../editor/editorHistory';
import { translations } from '../lang';
import { stripInputWhitespace } from '../utils/inputSanitization';
import type { ProjectData } from '../types/editorTypes';
import type { ExportFormat } from '../types/exportTypes';

type ExportRunResult = 'complete' | 'cancelled' | 'failed';
type UserExportFormat = Extract<ExportFormat, 'raw' | 'dr3-viewer' | 'dr3-fp'>;
type ExportDialogStatus = 'idle' | 'exporting' | 'complete' | 'cancelled' | 'failed';

interface EditorTopBarProps {
  projectData: ProjectData | null;
  tierBadge: {
    label: string;
    tierText: string;
    className: string;
  };
  isXPositionGridEnabled: boolean;
  isOutOfBoundsPlacementEnabled: boolean;
  isPlaying: boolean;
  isPlaybackSpeedMenuOpen: boolean;
  isHelpOpen: boolean;
  isSettingsOpen: boolean;
  isPreviewMode: boolean;
  isDr3FpPreviewEnabled: boolean;
  isExportMenuOpen: boolean;
  isPreviewMenuOpen: boolean;
  isExportDisabled: boolean;
  hasExportIncompatibleTimeSignature: boolean;
  duration: number;
  currentTime: number;
  timelinePositionLabel: string;
  effectiveGridZoom: number;
  pixelsPerBeat: number;
  playbackSpeed: number;
  progressBarRef: RefObject<HTMLInputElement | null>;
  timeDisplayRef: RefObject<HTMLDivElement | null>;
  isDraggingProgress: RefObject<boolean>;
  isProgressBarInteractive: RefObject<boolean>;
  openExitWarning: () => void;
  togglePlay: () => void;
  handleSeekChange: (event: ChangeEvent<HTMLInputElement> | FormEvent<HTMLInputElement>) => void;
  beginProgressSeek: () => void;
  finishProgressSeek: (isStillInteractive: boolean) => Promise<void>;
  setIsXPositionGridEnabled: Dispatch<SetStateAction<boolean>>;
  setIsOutOfBoundsPlacementEnabled: Dispatch<SetStateAction<boolean>>;
  setIsExportMenuOpen: Dispatch<SetStateAction<boolean>>;
  setIsPlaybackSpeedMenuOpen: Dispatch<SetStateAction<boolean>>;
  setIsPreviewMenuOpen: Dispatch<SetStateAction<boolean>>;
  changePlaybackSpeed: (speed: number) => void;
  openHelp: () => void;
  openSettings: () => void;
  togglePreviewMode: () => void;
  previewDr3Fp: () => Promise<void>;
  exportRaw: () => Promise<ExportRunResult>;
  exportDr3Viewer: () => Promise<ExportRunResult>;
  exportDr3Fp: () => Promise<ExportRunResult>;
}

export default function EditorTopBar({
  projectData,
  tierBadge,
  isXPositionGridEnabled,
  isOutOfBoundsPlacementEnabled,
  isPlaying,
  isPlaybackSpeedMenuOpen,
  isHelpOpen,
  isSettingsOpen,
  isPreviewMode,
  isDr3FpPreviewEnabled,
  isExportMenuOpen,
  isPreviewMenuOpen,
  isExportDisabled,
  hasExportIncompatibleTimeSignature,
  duration,
  currentTime,
  timelinePositionLabel,
  effectiveGridZoom,
  pixelsPerBeat,
  playbackSpeed,
  progressBarRef,
  timeDisplayRef,
  isDraggingProgress,
  isProgressBarInteractive,
  openExitWarning,
  togglePlay,
  handleSeekChange,
  beginProgressSeek,
  finishProgressSeek,
  setIsXPositionGridEnabled,
  setIsOutOfBoundsPlacementEnabled,
  setIsExportMenuOpen,
  setIsPlaybackSpeedMenuOpen,
  setIsPreviewMenuOpen,
  changePlaybackSpeed,
  openHelp,
  openSettings,
  togglePreviewMode,
  previewDr3Fp,
  exportRaw,
  exportDr3Viewer,
  exportDr3Fp,
}: EditorTopBarProps) {
  const text = translations;
  const [customPlaybackSpeedInput, setCustomPlaybackSpeedInput] = useState(() => `${playbackSpeed}`);
  const [selectedExportFormat, setSelectedExportFormat] = useState<UserExportFormat>('raw');
  const [exportDialogStatus, setExportDialogStatus] = useState<ExportDialogStatus>('idle');
  const [exportDialogStatusMessage, setExportDialogStatusMessage] = useState('Choose a format, then export.');
  const sanitizedCustomPlaybackSpeedInput = stripInputWhitespace(customPlaybackSpeedInput);
  const parsedCustomPlaybackSpeed = Number(sanitizedCustomPlaybackSpeedInput);
  const isCustomPlaybackSpeedValid = Number.isFinite(parsedCustomPlaybackSpeed) && parsedCustomPlaybackSpeed > 0;
  const outOfBoundsLabel = isOutOfBoundsPlacementEnabled
    ? text.editor.disableOutOfBoundsPlacement
    : text.editor.enableOutOfBoundsPlacement;
  const xPositionGridLabel = isXPositionGridEnabled
    ? text.editor.disableXPositionGrid
    : text.editor.enableXPositionGrid;
  const playbackLabel = isPlaying ? text.editor.pause : text.editor.play;
  const exportOptions: Array<{
    format: UserExportFormat;
    label: string;
    description: string;
  }> = [
    {
      format: 'raw',
      label: text.editor.rawFormat,
      description: 'Chart, audio, and illustration files with their original names.',
    },
    {
      format: 'dr3-viewer',
      label: text.editor.dr3ViewerFormat,
      description: 'ZIP structure for DanceRail3Viewer.',
    },
    {
      format: 'dr3-fp',
      label: text.editor.dr3FpFormat,
      description: 'ZIP structure for DR3FV.',
    },
  ];
  const isExportRunning = exportDialogStatus === 'exporting';
  const hasExportStarted = exportDialogStatus !== 'idle';
  const isSelectedExportFormatDisabled = isExportDisabled
    || (selectedExportFormat !== 'raw' && hasExportIncompatibleTimeSignature);
  const isFormattedExportDisabled = isExportDisabled || hasExportIncompatibleTimeSignature;
  const runSelectedExport = async () => {
    if (isSelectedExportFormatDisabled || isExportRunning) return;

    setExportDialogStatus('exporting');
    setExportDialogStatusMessage('Preparing export...');

    const exportByFormat: Record<UserExportFormat, () => Promise<ExportRunResult>> = {
      raw: exportRaw,
      'dr3-viewer': exportDr3Viewer,
      'dr3-fp': exportDr3Fp,
    };

    const result = await exportByFormat[selectedExportFormat]();
    setExportDialogStatus(result);
    setExportDialogStatusMessage(
      result === 'complete'
        ? 'Export complete.'
        : result === 'cancelled'
          ? 'Export cancelled.'
          : 'Export failed. Check the console for details.',
    );
  };
  const applyCustomPlaybackSpeed = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isCustomPlaybackSpeedValid) return;
    setCustomPlaybackSpeedInput(sanitizedCustomPlaybackSpeedInput);

    const matchingPresetSpeed = PLAYBACK_SPEED_OPTIONS.find(speed => (
      Math.abs(speed - parsedCustomPlaybackSpeed) <= 0.000001
    ));

    changePlaybackSpeed(matchingPresetSpeed ?? parsedCustomPlaybackSpeed);
  };

  return (
    <header className="relative h-16 shrink-0 border-b border-neutral-800 bg-neutral-950/90 px-3 text-neutral-50 shadow-lg shadow-black/20">
      <div className="grid h-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={openExitWarning}
          className="shrink-0 rounded-lg border border-transparent p-2 text-neutral-400 transition-colors hover:border-neutral-700 hover:bg-neutral-900 hover:text-white"
          title={text.editor.backToLanding}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex h-12 min-w-0 max-w-full items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/60 px-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-neutral-100">
              {projectData?.songName || text.editor.untitledProject}
            </div>
            <div className="mt-0.5 min-w-0 truncate text-[11px] font-medium leading-tight text-neutral-400">
              {projectData?.songArtist || text.editor.songArtist}
            </div>
          </div>
          {projectData && (
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border font-mono text-sm font-black leading-none ${tierBadge.className}`}
              title={tierBadge.label}
              aria-label={tierBadge.label}
            >
              {tierBadge.tierText}
            </span>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 w-[clamp(22rem,38vw,38rem)] -translate-x-1/2 -translate-y-1/2">
        {projectData && (
          <>
            <div className="pointer-events-auto absolute right-full top-1/2 mr-3 flex -translate-y-1/2 items-center gap-3">
              {!isPreviewMode && (
                <div className="flex h-12 shrink-0 items-center gap-1 rounded-xl border border-neutral-800 bg-neutral-900/60 px-1">
                  <button
                    type="button"
                    onClick={() => setIsOutOfBoundsPlacementEnabled(prev => !prev)}
                    className={`shrink-0 rounded-lg border p-2 transition-colors ${isOutOfBoundsPlacementEnabled ? 'border-amber-400/30 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30' : 'border-transparent text-neutral-500 hover:border-neutral-700 hover:bg-neutral-900 hover:text-white'}`}
                    title={outOfBoundsLabel}
                    aria-pressed={isOutOfBoundsPlacementEnabled}
                    aria-label={outOfBoundsLabel}
                  >
                    <MoveHorizontal className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsXPositionGridEnabled(prev => !prev)}
                    className={`shrink-0 rounded-lg border p-2 transition-colors ${isXPositionGridEnabled ? 'border-transparent text-neutral-500 hover:border-neutral-700 hover:bg-neutral-900 hover:text-white' : 'border-indigo-400/30 bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'}`}
                    title={xPositionGridLabel}
                    aria-pressed={!isXPositionGridEnabled}
                    aria-label={xPositionGridLabel}
                  >
                    {isXPositionGridEnabled ? <Grid2x2 className="w-4 h-4" /> : <Grid2x2X className="w-4 h-4" />}
                  </button>
                </div>
              )}
              <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsExportMenuOpen(false);
                  setIsPreviewMenuOpen(false);
                  setIsPlaybackSpeedMenuOpen(current => {
                    if (!current) {
                      setCustomPlaybackSpeedInput(`${playbackSpeed}`);
                    }

                    return !current;
                  });
                }}
                className="flex h-12 items-center rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 text-[11px] font-medium uppercase tracking-wider text-neutral-500 transition-colors hover:border-neutral-700 hover:bg-neutral-800 hover:text-white"
                title={text.editor.playbackSpeed}
                aria-haspopup="menu"
                aria-expanded={isPlaybackSpeedMenuOpen}
              >
                Speed <span className="ml-1 font-mono text-xs normal-case tracking-normal text-neutral-300">{formatPlaybackSpeed(playbackSpeed)}</span>
              </button>
              {isPlaybackSpeedMenuOpen && (
                <div
                  className="absolute left-0 top-full z-50 mt-2 w-40 rounded-lg border border-neutral-700 bg-neutral-950 p-1 shadow-2xl shadow-black/40"
                  role="menu"
                >
                  <form onSubmit={applyCustomPlaybackSpeed} className="mb-1 border-b border-neutral-800 p-1 pb-2">
                    <label className="mb-1 block px-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                      Custom
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={customPlaybackSpeedInput}
                        onChange={(event) => setCustomPlaybackSpeedInput(event.target.value)}
                        onBlur={() => setCustomPlaybackSpeedInput(stripInputWhitespace(customPlaybackSpeedInput))}
                        className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 font-mono text-sm text-neutral-200 outline-none transition-colors focus:border-indigo-500"
                        aria-label={text.editor.playbackSpeed}
                      />
                      <button
                        type="submit"
                        disabled={!isCustomPlaybackSpeedValid}
                        className="rounded bg-indigo-500 px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                      >
                        Set
                      </button>
                    </div>
                  </form>
                  {PLAYBACK_SPEED_OPTIONS.map(speed => (
                    <button
                      key={speed}
                      type="button"
                      onClick={() => changePlaybackSpeed(speed)}
                      className={`w-full rounded px-3 py-2 text-right font-mono text-sm transition-colors ${
                        playbackSpeed === speed
                          ? 'bg-indigo-500/20 text-indigo-200'
                          : 'text-neutral-200 hover:bg-neutral-800'
                      }`}
                      role="menuitem"
                    >
                      {formatPlaybackSpeed(speed)}
                    </button>
                  ))}
                </div>
              )}
              </div>
            </div>
            <div className="pointer-events-auto flex h-12 min-w-0 w-full items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/70 px-2 shadow-inner shadow-black/30">
              <button
                onClick={togglePlay}
                className={`shrink-0 rounded-lg p-2 transition-colors ${isPlaying ? 'bg-emerald-500/20 text-emerald-400' : 'text-neutral-400 hover:bg-neutral-800 hover:text-emerald-400'}`}
                title={playbackLabel}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <input
                ref={progressBarRef}
                type="range"
                min={0}
                max={Math.max(duration, currentTime, 0.01)}
                step={0.01}
                defaultValue={0}
                onMouseEnter={() => { isProgressBarInteractive.current = true; }}
                onMouseLeave={() => {
                  if (!isDraggingProgress.current) {
                    isProgressBarInteractive.current = false;
                  }
                }}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  beginProgressSeek();
                }}
                onPointerUp={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                  void finishProgressSeek(event.pointerType !== 'touch');
                }}
                onPointerCancel={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                  void finishProgressSeek(false);
                }}
                onInput={handleSeekChange}
                className="min-w-0 flex-1 h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <div ref={timeDisplayRef} className="w-14 shrink-0 text-right font-mono text-sm text-neutral-400">
                {timelinePositionLabel}
              </div>
            </div>
            <div className="pointer-events-auto absolute left-full top-1/2 ml-3 flex -translate-y-1/2 items-center gap-3">
              <div className="flex h-12 items-center gap-1 rounded-xl border border-neutral-800 bg-neutral-900/60 px-2">
                <div className="rounded-lg px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  {text.editor.zoom} <span className="ml-1 font-mono text-xs normal-case tracking-normal text-neutral-300">{pixelsPerBeat}px</span>
                </div>
                {!isPreviewMode && (
                  <div className="rounded-lg px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                    {text.editor.snap} <span className="ml-1 font-mono text-xs normal-case tracking-normal text-neutral-300">{effectiveGridZoom === 0 ? '0' : `1/${effectiveGridZoom}`}</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex min-w-0 items-center justify-end gap-2">
        <div className="flex min-w-0 flex-1" />

        <div className="flex shrink-0 items-center justify-end gap-2">
          <div className="flex h-12 items-center gap-1 rounded-xl border border-neutral-800 bg-neutral-900/60 px-1">
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                openHelp();
              }}
              className="rounded-lg border border-transparent p-2 text-neutral-400 transition-colors hover:border-neutral-700 hover:bg-neutral-900 hover:text-white"
              title={text.editor.hotkeys}
              aria-label={text.editor.openHotkeysHelp}
              aria-haspopup="dialog"
              aria-expanded={isHelpOpen}
            >
              <HelpCircle className="w-4 h-4" />
            </button>
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                openSettings();
              }}
              className="rounded-lg border border-transparent p-2 text-neutral-400 transition-colors hover:border-neutral-700 hover:bg-neutral-900 hover:text-white"
              title={text.editor.settings}
              aria-haspopup="dialog"
              aria-expanded={isSettingsOpen}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
          <div
            className="relative"
            onMouseEnter={() => {
              setIsExportMenuOpen(false);
              setIsPlaybackSpeedMenuOpen(false);
              setIsPreviewMenuOpen(true);
            }}
            onMouseLeave={() => setIsPreviewMenuOpen(false)}
          >
            <button
              type="button"
              disabled={!projectData}
              onClick={() => {
                setIsPreviewMenuOpen(false);
                togglePreviewMode();
              }}
              className={`relative h-12 shrink-0 whitespace-nowrap rounded-lg border px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500 ${
                isPreviewMode
                  ? 'border-transparent bg-emerald-500 text-white hover:bg-emerald-600'
                  : 'border border-neutral-700 bg-neutral-800 text-neutral-200 hover:bg-neutral-700 hover:text-white'
              }`}
              title={isPreviewMode ? text.editor.returnToEditorMode : text.editor.previewChartPlayback}
              aria-haspopup="menu"
              aria-expanded={isPreviewMenuOpen}
              aria-pressed={isPreviewMode}
            >
              <span className="invisible">Preview Mode</span>
              <span className="absolute inset-0 flex items-center justify-center">
                {isPreviewMode ? 'Preview Mode' : 'Editor Mode'}
              </span>
            </button>
            {isPreviewMenuOpen && isDr3FpPreviewEnabled && (
              <div
                className="absolute right-0 top-full z-50 w-36 pt-2"
                role="menu"
              >
                <div className="rounded-lg border border-neutral-700 bg-neutral-950 p-1 shadow-2xl shadow-black/40">
                  <button
                    type="button"
                    disabled={isFormattedExportDisabled}
                    onClick={() => {
                      if (isFormattedExportDisabled) return;
                      setIsPreviewMenuOpen(false);
                      void previewDr3Fp();
                    }}
                    className="w-full rounded px-3 py-2 text-left text-sm text-neutral-200 transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:text-neutral-500 disabled:hover:bg-transparent"
                    role="menuitem"
                    title={isFormattedExportDisabled ? text.editor.previewDisabled : text.editor.previewDr3Fp}
                  >
                    DR3FP
                  </button>
                </div>
              </div>
            )}
          </div>
        <div className="relative">
          <button
            type="button"
            disabled={isExportDisabled}
            onClick={() => {
              setIsPlaybackSpeedMenuOpen(false);
              setIsPreviewMenuOpen(false);
              setExportDialogStatus('idle');
              setExportDialogStatusMessage('Choose a format, then export.');
              setIsExportMenuOpen(true);
            }}
            className="flex h-12 items-center gap-2 rounded-lg bg-indigo-500 px-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
            title={isExportDisabled ? text.editor.exportDisabled : text.editor.exportLevel}
            aria-haspopup="dialog"
            aria-expanded={isExportMenuOpen}
          >
            <Download className="w-4 h-4" />
            {text.editor.export}
          </button>
          {isExportMenuOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="export-dialog-title"
            >
              <div className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-950 p-5 shadow-2xl shadow-black/50">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h2 id="export-dialog-title" className="text-lg font-semibold text-neutral-50">
                      {text.editor.exportLevel}
                    </h2>
                    <p className="mt-1 text-sm text-neutral-400">
                      Select the package format for this chart.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isExportRunning}
                    onClick={() => setIsExportMenuOpen(false)}
                    className="rounded-lg border border-transparent p-2 text-neutral-400 transition-colors hover:border-neutral-700 hover:bg-neutral-900 hover:text-white disabled:cursor-not-allowed disabled:text-neutral-700"
                    aria-label="Close export dialog"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {hasExportIncompatibleTimeSignature && (
                  <p className="mb-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-200">
                    {text.editor.exportIncompatibleTimeSignature}
                  </p>
                )}

                <div className="space-y-2">
                  {exportOptions.map(option => (
                    <button
                      key={option.format}
                      type="button"
                      disabled={isExportRunning || (option.format !== 'raw' && hasExportIncompatibleTimeSignature)}
                      onClick={() => {
                        setSelectedExportFormat(option.format);
                        setExportDialogStatus('idle');
                        setExportDialogStatusMessage('Choose a format, then export.');
                      }}
                      className={`w-full rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed ${
                        selectedExportFormat === option.format
                          ? 'border-indigo-400/60 bg-indigo-500/15'
                          : 'border-neutral-800 bg-neutral-900/70 hover:border-neutral-700 hover:bg-neutral-900'
                      }`}
                      aria-pressed={selectedExportFormat === option.format}
                    >
                      <span className="block text-sm font-semibold text-neutral-100">{option.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-neutral-400">{option.description}</span>
                    </button>
                  ))}
                </div>

                <div className="mt-5">
                  <button
                    type="button"
                    disabled={isSelectedExportFormatDisabled || isExportRunning}
                    onClick={() => void runSelectedExport()}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                  >
                    {isExportRunning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    {text.editor.export}
                  </button>
                  <div
                    className={`mt-3 flex min-h-10 items-center gap-2 rounded border px-3 py-2 text-sm ${
                      exportDialogStatus === 'complete'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                        : exportDialogStatus === 'failed'
                          ? 'border-red-500/30 bg-red-500/10 text-red-200'
                          : exportDialogStatus === 'cancelled'
                            ? 'border-neutral-700 bg-neutral-900 text-neutral-300'
                            : 'border-neutral-800 bg-neutral-900/70 text-neutral-400'
                    } ${hasExportStarted ? 'visible' : 'invisible'}`}
                    aria-live="polite"
                    aria-hidden={!hasExportStarted}
                  >
                    {exportDialogStatus === 'exporting' && <LoaderCircle className="h-4 w-4 animate-spin" />}
                    {exportDialogStatus === 'complete' && <CheckCircle2 className="h-4 w-4" />}
                    {exportDialogStatus === 'failed' && <AlertCircle className="h-4 w-4" />}
                    {exportDialogStatus !== 'exporting' && exportDialogStatus !== 'complete' && exportDialogStatus !== 'failed' && (
                      <span className="h-2 w-2 rounded-full bg-current opacity-70" />
                    )}
                    {exportDialogStatusMessage}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
      </div>
    </header>
  );
}
