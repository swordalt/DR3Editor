import { Fragment } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
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
  isExitWarningEnabled: boolean;
  isScrollDirectionInverted: boolean;
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
  setIsExitWarningEnabled: Dispatch<SetStateAction<boolean>>;
  setIsScrollDirectionInverted: Dispatch<SetStateAction<boolean>>;
  setIsSelectionTypeMenuOpen: Dispatch<SetStateAction<boolean>>;
  setIsStatisticsRefreshRateMenuOpen: Dispatch<SetStateAction<boolean>>;
  setSelectionType: Dispatch<SetStateAction<SelectionType>>;
  setStatisticsRefreshRate: Dispatch<SetStateAction<StatisticsRefreshRate>>;
  setMusicVolume: Dispatch<SetStateAction<number>>;
  setTapSoundVolume: Dispatch<SetStateAction<number>>;
  setFlickSoundVolume: Dispatch<SetStateAction<number>>;
  onBack: () => void;
}

export default function EditorOverlays({
  isExitWarningOpen,
  isSettingsOpen,
  isHelpOpen,
  isExitWarningEnabled,
  isScrollDirectionInverted,
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
  setIsExitWarningEnabled,
  setIsScrollDirectionInverted,
  setIsSelectionTypeMenuOpen,
  setIsStatisticsRefreshRateMenuOpen,
  setSelectionType,
  setStatisticsRefreshRate,
  setMusicVolume,
  setTapSoundVolume,
  setFlickSoundVolume,
  onBack,
}: EditorOverlaysProps) {
  const closeSettings = () => {
    setIsSettingsOpen(false);
    setIsStatisticsRefreshRateMenuOpen(false);
    setIsSelectionTypeMenuOpen(false);
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

            <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-6">
              <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Editor</h3>
                    <p className="mt-1 text-xs text-neutral-500">Control editor behavior and navigation safeguards.</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-neutral-950/60 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-white">Back to Landing warning</p>
                      <p className="mt-1 text-xs leading-5 text-neutral-500">
                        Show a confirmation popup before leaving the editor and discarding unexported work.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isExitWarningEnabled}
                      aria-label="Toggle Back to Landing warning"
                      onClick={() => setIsExitWarningEnabled((current) => !current)}
                      className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border transition-colors ${
                        isExitWarningEnabled
                          ? 'border-emerald-300/40 bg-emerald-500/90'
                          : 'border-white/10 bg-neutral-800'
                      }`}
                    >
                      <span className="sr-only">Back to Landing warning</span>
                      <span
                        className={`absolute left-1 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform ${
                          isExitWarningEnabled ? 'translate-x-7' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-neutral-950/60 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-white">Invert Scroll Direction</p>
                      <p className="mt-1 text-xs leading-5 text-neutral-500">
                        Reverse mouse wheel scrolling when moving through the editor canvas.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isScrollDirectionInverted}
                      aria-label="Toggle inverted canvas scroll direction"
                      onClick={() => setIsScrollDirectionInverted((current) => !current)}
                      className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border transition-colors ${
                        isScrollDirectionInverted
                          ? 'border-emerald-300/40 bg-emerald-500/90'
                          : 'border-white/10 bg-neutral-800'
                      }`}
                    >
                      <span className="sr-only">Invert Scroll Direction</span>
                      <span
                        className={`absolute left-1 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform ${
                          isScrollDirectionInverted ? 'translate-x-7' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
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
            </div>

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

            <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-6">
              {EDITOR_KEYBIND_GROUPS.map(group => (
                <section key={group.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <h3 className="mb-4 text-sm font-semibold text-white">{group.title}</h3>
                  <div className="space-y-3">
                    {group.bindings.map(binding => (
                      <div
                        key={`${group.title}-${binding.keys.join('-')}`}
                        className="grid gap-3 rounded-2xl border border-white/10 bg-neutral-950/60 p-4 sm:grid-cols-[13rem_minmax(0,1fr)]"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          {binding.keys.map((key, index) => (
                            <Fragment key={key}>
                              {index > 0 && <span className="text-xs text-neutral-600">+</span>}
                              <kbd className="rounded-lg border border-white/10 bg-neutral-900 px-2 py-1 font-mono text-xs font-semibold text-neutral-200 shadow-inner shadow-black/30">
                                {key}
                              </kbd>
                            </Fragment>
                          ))}
                        </div>
                        <p className="text-sm leading-6 text-neutral-300">{binding.description}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>

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
