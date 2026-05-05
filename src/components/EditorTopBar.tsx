import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from 'react';
import { ArrowLeft, ChevronDown, Download, Grid2x2, Grid2x2X, HelpCircle, MoveHorizontal, Pause, Play, Settings } from 'lucide-react';
import { PLAYBACK_SPEED_OPTIONS } from '../editor/editorViewConstants';
import { formatPlaybackSpeed } from '../editor/editorHistory';
import type { BpmChange, ProjectData } from '../types/editorTypes';
import { convertBpmChangesToTime, formatTime } from '../utils/editorUtils';

interface EditorTopBarProps {
  projectData: ProjectData | null;
  tierBadge: {
    label: string;
    className: string;
  };
  isXPositionGridEnabled: boolean;
  isOutOfBoundsPlacementEnabled: boolean;
  isPlaying: boolean;
  isPlaybackSpeedMenuOpen: boolean;
  isHelpOpen: boolean;
  isSettingsOpen: boolean;
  isPreviewMode: boolean;
  isExportMenuOpen: boolean;
  isPreviewMenuOpen: boolean;
  isExportDisabled: boolean;
  hasExportIncompatibleTimeSignature: boolean;
  duration: number;
  currentTime: number;
  effectiveGridZoom: number;
  pixelsPerBeat: number;
  playbackSpeed: number;
  bpmChanges: BpmChange[];
  progressBarRef: RefObject<HTMLInputElement | null>;
  timeDisplayRef: RefObject<HTMLDivElement | null>;
  isDraggingProgress: RefObject<boolean>;
  openExitWarning: () => void;
  togglePlay: () => void;
  handleSeekChange: (event: ChangeEvent<HTMLInputElement>) => void;
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
  exportDr3Viewer: () => Promise<void>;
  exportDr3Fp: () => Promise<void>;
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
  isExportMenuOpen,
  isPreviewMenuOpen,
  isExportDisabled,
  hasExportIncompatibleTimeSignature,
  duration,
  currentTime,
  effectiveGridZoom,
  pixelsPerBeat,
  playbackSpeed,
  bpmChanges,
  progressBarRef,
  timeDisplayRef,
  isDraggingProgress,
  openExitWarning,
  togglePlay,
  handleSeekChange,
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
  exportDr3Viewer,
  exportDr3Fp,
}: EditorTopBarProps) {
  return (
    <header className="h-14 border-b border-neutral-800 bg-neutral-900/50 flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-4 w-1/3">
        <button
          onClick={openExitWarning}
          className="p-2 hover:bg-neutral-800 rounded-lg transition-colors text-neutral-400 hover:text-white"
          title="Back to Landing"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="h-4 w-px bg-neutral-800" />
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="min-w-0 truncate text-sm font-medium">{projectData?.songName || 'Untitled Project'}</h1>
          {projectData && (
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tierBadge.className}`}>
              {tierBadge.label}
            </span>
          )}
          <span className="shrink-0 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2 py-0.5 text-[11px] font-semibold text-indigo-200">
            {projectData?.chartFormat ?? 'Official'}
          </span>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 max-w-xl gap-3">
        {projectData && (
          <>
            <button
              type="button"
              onClick={() => setIsOutOfBoundsPlacementEnabled(prev => !prev)}
              className={`shrink-0 p-2 rounded-lg transition-colors ${isOutOfBoundsPlacementEnabled ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30' : 'hover:bg-neutral-800 text-neutral-400 hover:text-white'}`}
              title={isOutOfBoundsPlacementEnabled ? 'Disable out-of-bounds note placement' : 'Enable out-of-bounds note placement'}
              aria-pressed={isOutOfBoundsPlacementEnabled}
              aria-label={isOutOfBoundsPlacementEnabled ? 'Disable out-of-bounds note placement' : 'Enable out-of-bounds note placement'}
            >
              <MoveHorizontal className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsXPositionGridEnabled(prev => !prev)}
              className={`shrink-0 p-2 rounded-lg transition-colors ${isXPositionGridEnabled ? 'hover:bg-neutral-800 text-neutral-400 hover:text-white' : 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'}`}
              title={isXPositionGridEnabled ? 'Disable x-position grid' : 'Enable x-position grid'}
              aria-pressed={!isXPositionGridEnabled}
              aria-label={isXPositionGridEnabled ? 'Disable x-position grid' : 'Enable x-position grid'}
            >
              {isXPositionGridEnabled ? <Grid2x2 className="w-4 h-4" /> : <Grid2x2X className="w-4 h-4" />}
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-950/40 px-2 py-1.5">
              <button
                onClick={togglePlay}
                className={`shrink-0 p-2 rounded-lg transition-colors ${isPlaying ? 'bg-emerald-500/20 text-emerald-400' : 'hover:bg-neutral-800 text-neutral-400 hover:text-emerald-400'}`}
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <input
                ref={progressBarRef}
                type="range"
                min={0}
                max={duration || 100}
                step={0.01}
                defaultValue={0}
                onMouseDown={() => { isDraggingProgress.current = true; }}
                onMouseUp={() => { isDraggingProgress.current = false; }}
                onTouchStart={() => { isDraggingProgress.current = true; }}
                onTouchEnd={() => { isDraggingProgress.current = false; }}
                onChange={handleSeekChange}
                className="min-w-0 flex-1 h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <div ref={timeDisplayRef} className="shrink-0 text-sm font-mono text-neutral-400">
                {formatTime(currentTime, convertBpmChangesToTime(bpmChanges), effectiveGridZoom)}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 w-1/3 justify-end">
        {projectData && (
          <>
            {!isPreviewMode && (
              <div className="text-sm font-mono text-neutral-400 w-20 text-left">
                Snap <span className="inline-block w-8 text-center">{effectiveGridZoom === 0 ? '0' : `1/${effectiveGridZoom}`}</span>
              </div>
            )}
            <div className="text-sm font-mono text-neutral-400 w-24 text-left">
              Zoom <span className="inline-block w-10 text-center">{pixelsPerBeat}px</span>
            </div>
          </>
        )}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setIsExportMenuOpen(false);
              setIsPreviewMenuOpen(false);
              setIsPlaybackSpeedMenuOpen(current => !current);
            }}
            className="min-w-14 rounded-lg px-2 py-1.5 font-mono text-sm text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
            title="Playback speed"
            aria-haspopup="menu"
            aria-expanded={isPlaybackSpeedMenuOpen}
          >
            {formatPlaybackSpeed(playbackSpeed)}
          </button>
          {isPlaybackSpeedMenuOpen && (
            <div
              className="absolute right-0 top-full z-50 mt-2 w-24 rounded-lg border border-neutral-700 bg-neutral-950 p-1 shadow-2xl shadow-black/40"
              role="menu"
            >
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
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            openHelp();
          }}
          className="p-2 hover:bg-neutral-800 rounded-lg transition-colors text-neutral-400 hover:text-white"
          title="Hotkeys"
          aria-label="Open hotkeys help"
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
          className="p-2 hover:bg-neutral-800 rounded-lg transition-colors text-neutral-400 hover:text-white"
          title="Settings"
          aria-haspopup="dialog"
          aria-expanded={isSettingsOpen}
        >
          <Settings className="w-4 h-4" />
        </button>
        {isPreviewMode ? (
          <button
            type="button"
            disabled={!projectData}
            onClick={togglePreviewMode}
            className="ml-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
            title="Return to editor mode"
            aria-pressed={isPreviewMode}
          >
            Return
          </button>
        ) : (
          <div className="relative ml-2">
            <button
              type="button"
              disabled={!projectData}
              onClick={() => {
                setIsExportMenuOpen(false);
                setIsPlaybackSpeedMenuOpen(false);
                setIsPreviewMenuOpen(current => !current);
              }}
              className="flex items-center gap-2 rounded-lg bg-neutral-800 px-3 py-1.5 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-700 hover:text-white disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
              title="Preview chart playback"
              aria-haspopup="menu"
              aria-expanded={isPreviewMenuOpen}
            >
              Preview
              <ChevronDown className="h-4 w-4" />
            </button>
            {isPreviewMenuOpen && (
              <div
                className="absolute right-0 top-full z-50 mt-2 w-36 rounded-lg border border-neutral-700 bg-neutral-950 p-1 shadow-2xl shadow-black/40"
                role="menu"
              >
                <button
                  type="button"
                  onClick={() => {
                    setIsPreviewMenuOpen(false);
                    togglePreviewMode();
                  }}
                  className="w-full rounded px-3 py-2 text-left text-sm text-neutral-200 transition-colors hover:bg-neutral-800"
                  role="menuitem"
                >
                  Editor
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPreviewMenuOpen(false);
                    void previewDr3Fp();
                  }}
                  className="w-full rounded px-3 py-2 text-left text-sm text-neutral-200 transition-colors hover:bg-neutral-800"
                  role="menuitem"
                >
                  DR3FP
                </button>
              </div>
            )}
          </div>
        )}
        <div className="relative ml-2">
          <button
            type="button"
            disabled={isExportDisabled}
            onClick={() => {
              setIsPlaybackSpeedMenuOpen(false);
              setIsPreviewMenuOpen(false);
              setIsExportMenuOpen(current => !current);
            }}
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors text-sm font-medium disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
            title={isExportDisabled ? 'Song ID, difficulty, and audio are required before export.' : 'Export Level'}
            aria-haspopup="menu"
            aria-expanded={isExportMenuOpen}
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          {isExportMenuOpen && (
            <div
              className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-neutral-700 bg-neutral-950 p-2 shadow-2xl shadow-black/40"
              role="menu"
            >
              {hasExportIncompatibleTimeSignature && (
                <p className="mb-2 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-200">
                  Export is incompatible with DR3Viewer and DR3FP formats due to unique time signatures.
                </p>
              )}
              <button
                type="button"
                disabled={isExportDisabled}
                onClick={() => {
                  setIsExportMenuOpen(false);
                  void exportDr3Viewer();
                }}
                className="w-full rounded px-3 py-2 text-left text-sm text-neutral-200 transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:text-neutral-500 disabled:hover:bg-transparent"
                role="menuitem"
              >
                DR3Viewer format
              </button>
              <button
                type="button"
                disabled={isExportDisabled}
                onClick={() => {
                  setIsExportMenuOpen(false);
                  void exportDr3Fp();
                }}
                className="w-full rounded px-3 py-2 text-left text-sm text-neutral-200 transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:text-neutral-500 disabled:hover:bg-transparent"
                role="menuitem"
              >
                DR3FP format
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
