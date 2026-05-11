import { ChevronLeft, ChevronRight, Copy, FlipHorizontal, Trash2, X } from 'lucide-react';
import CommitInput from './CommitInput';
import { AVAILABLE_NOTE_TYPES, NOTE_TYPES, UNKNOWN_NOTE_TYPE } from '../constants/editorConstants';
import { APPEAR_MODE_OPTIONS } from '../editor/editorViewConstants';
import { formatHistoryNumber } from '../editor/editorHistory';
import type { Note } from '../types/editorTypes';

export default function EditorRightSidebar(props: any) {
  const {
    isRightPanelCompact,
    isRightPanelContentVisible,
    isPreviewMode,
    toggleRightPanelCompact,
    selectedSingleNote,
    setSelectedNoteIds,
    notePropertyInputClass,
    updateSelectedNote,
    selectedNoteTimepos,
    getTimeFromTimepos,
    canEditSelectedNoteParent,
    selectedParentNote,
    jumpToNoteTime,
    selectedNoteIds,
    handleCopySelectedNotes,
    handleDeleteSelectedNotes,
    handleMirrorSelectedNotes,
    notes,
    bpmChanges,
    speedChanges,
    currentEditorBpm,
    currentEditorSpeed,
    currentEditorDistance,
    currentEditorCombo,
    currentEditorScore,
  } = props;

  return (        <aside className={`${isRightPanelCompact ? 'w-12' : 'w-64'} shrink-0 border-l border-neutral-800 bg-neutral-900/30 flex flex-col transition-all duration-300 overflow-hidden`}>
          <div className={`p-2 border-b border-neutral-800 flex ${isRightPanelContentVisible ? 'justify-start' : 'justify-center'}`}>
            <button
              onClick={toggleRightPanelCompact}
              className={`flex items-center gap-2 rounded text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors ${isRightPanelContentVisible ? 'px-2 py-1 text-xs font-medium' : 'p-1'}`}
            >
              {isRightPanelCompact ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              {isRightPanelContentVisible && <span>Collapse Window</span>}
            </button>
          </div>
          {isRightPanelContentVisible && (
            <div className="p-4 flex flex-col gap-4 overflow-y-auto">
              <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Properties</div>
              {isPreviewMode ? (
                <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
                  <div className="text-sm font-medium text-neutral-200">Preview Statistics</div>
                  <div className="mt-3 flex flex-col divide-y divide-neutral-800 text-sm">
                    <div className="flex items-center justify-between py-2 first:pt-0">
                      <span className="text-neutral-400">Current Distance</span>
                      <span className="font-mono text-neutral-100">{currentEditorDistance.toFixed(3)}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 last:pb-0">
                      <span className="text-neutral-400">Current Score</span>
                      <span className="font-mono text-neutral-100">{currentEditorScore}</span>
                    </div>
                  </div>
                </div>
              ) : selectedSingleNote ? (
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedNoteIds([])}
                    className="flex w-full items-center justify-center gap-2 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Deselect All</span>
                  </button>

                  <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-8 w-8 rounded border border-neutral-700"
                        style={{ backgroundColor: NOTE_TYPES[selectedSingleNote.type]?.color || UNKNOWN_NOTE_TYPE.color }}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-neutral-200">
                          {NOTE_TYPES[selectedSingleNote.type]?.name || UNKNOWN_NOTE_TYPE.name}
                        </div>
                        <div className="text-xs text-neutral-500">ID {selectedSingleNote.id}</div>
                      </div>
                    </div>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-400">Type</span>
                    <select
                      value={selectedSingleNote.type}
                      className={notePropertyInputClass}
                      onChange={(e) => updateSelectedNote({ type: Number(e.target.value) })}
                    >
                      {AVAILABLE_NOTE_TYPES.map(type => (
                        <option key={type} value={type}>
                          {type} - {NOTE_TYPES[type]?.name || UNKNOWN_NOTE_TYPE.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-400">Timepos (measure/decimal)</span>
                    <CommitInput
                      type="number"
                      step="0.001"
                      min="0"
                      value={Number(selectedNoteTimepos.toFixed(3))}
                      className={notePropertyInputClass}
                      onCommit={(value) => updateSelectedNote({ time: getTimeFromTimepos(Math.max(0, Number(value) || 0)) })}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-400">XPos</span>
                    <CommitInput
                      type="number"
                      step="0.01"
                      value={selectedSingleNote.lane}
                      className={notePropertyInputClass}
                      onCommit={(value) => {
                        const lane = Number(value);
                        if (!Number.isFinite(lane)) return;
                        updateSelectedNote({ lane });
                      }}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-400">Width</span>
                    <CommitInput
                      type="number"
                      min="0"
                      max="16"
                      step="0.01"
                      value={selectedSingleNote.width}
                      className={notePropertyInputClass}
                      onCommit={(value) => {
                        const parsedWidth = Number(value);
                        const width = Number.isFinite(parsedWidth) ? Math.max(0, Math.min(16, parsedWidth)) : selectedSingleNote.width;
                        updateSelectedNote({ width });
                      }}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-400">Parent ID</span>
                    <div className="flex gap-2">
                      <CommitInput
                        type="number"
                        min="0"
                        value={selectedSingleNote.parentId ?? ''}
                        placeholder="None"
                        className={notePropertyInputClass}
                        disabled={!canEditSelectedNoteParent}
                        onCommit={(value) => {
                          const trimmedValue = value.trim();
                          updateSelectedNote({ parentId: trimmedValue === '' ? null : Math.max(0, Number(trimmedValue) || 0) });
                        }}
                      />
                      <button
                        type="button"
                        disabled={!canEditSelectedNoteParent || !selectedParentNote}
                        onClick={() => {
                          if (selectedParentNote) {
                            jumpToNoteTime(selectedParentNote.time);
                          }
                        }}
                        className="shrink-0 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-600"
                      >
                        Jump To
                      </button>
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-400">Speed</span>
                    <CommitInput
                      type="text"
                      value={selectedSingleNote.speed ?? ''}
                      placeholder="Default"
                      className={notePropertyInputClass}
                      onCommit={(value) => {
                        const normalizedValue = value.replace(/\s+/g, '');
                        updateSelectedNote({ speed: normalizedValue === '' ? undefined : normalizedValue });
                      }}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-400">AppearMode</span>
                    <select
                      value={selectedSingleNote.appearMode ?? 'none'}
                      className={notePropertyInputClass}
                      onChange={(e) => {
                        const nextAppearMode = e.target.value;
                        updateSelectedNote({
                          appearMode: nextAppearMode === 'none'
                            ? undefined
                            : nextAppearMode as Note['appearMode'],
                        });
                      }}
                    >
                      {APPEAR_MODE_OPTIONS.map((appearMode) => (
                        <option key={appearMode} value={appearMode}>
                          {appearMode}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : (
                selectedNoteIds.length > 1 ? (
                  <div className="flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedNoteIds([])}
                      className="flex w-full items-center justify-center gap-2 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>Deselect All</span>
                    </button>

                    <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
                      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Multiselect Functions</div>
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={handleCopySelectedNotes}
                          className="flex w-full items-center justify-center gap-2 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteSelectedNotes}
                          className="flex w-full items-center justify-center gap-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-200 transition-colors hover:bg-red-500/20 hover:text-white"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleMirrorSelectedNotes}
                          className="flex w-full items-center justify-center gap-2 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
                        >
                          <FlipHorizontal className="h-3.5 w-3.5" />
                          <span>Mirror</span>
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 flex items-center justify-center text-sm text-neutral-600 border border-dashed border-neutral-800 rounded-lg p-4 text-center">
                      {`${selectedNoteIds.length} notes selected`}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
                    <div className="text-sm font-medium text-neutral-200">Chart Summary</div>
                    <div className="mt-3 flex flex-col divide-y divide-neutral-800 text-sm">
                      <div className="flex items-center justify-between py-2 first:pt-0">
                        <span className="text-neutral-400">Total Notes</span>
                        <span className="font-mono text-neutral-100">{notes.length}</span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-neutral-400">BPM Changes</span>
                        <span className="font-mono text-neutral-100">{bpmChanges.length}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 last:pb-0">
                        <span className="text-neutral-400">Speed Changes</span>
                        <span className="font-mono text-neutral-100">{speedChanges.length}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-neutral-800 py-2 pt-4">
                        <span className="text-neutral-400">Current BPM</span>
                        <span className="font-mono text-neutral-100">{formatHistoryNumber(currentEditorBpm)}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 last:pb-0">
                        <span className="text-neutral-400">Current Speed</span>
                        <span className="font-mono text-neutral-100">{formatHistoryNumber(currentEditorSpeed)}x</span>
                      </div>
                      <div className="flex items-center justify-between py-2 last:pb-0">
                        <span className="text-neutral-400">Current Distance</span>
                        <span className="font-mono text-neutral-100">{currentEditorDistance.toFixed(3)}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-neutral-800 py-2 pt-4">
                        <span className="text-neutral-400">Current Combo</span>
                        <span className="font-mono text-neutral-100">{currentEditorCombo}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 last:pb-0">
                        <span className="text-neutral-400">Current Score</span>
                        <span className="font-mono text-neutral-100">{currentEditorScore}</span>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </aside>
  );
}
