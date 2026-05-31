import { AlignCenterHorizontal, ChevronLeft, ChevronRight, Copy, FlipHorizontal, Trash2, X } from 'lucide-react';
import CommitInput from './CommitInput';
import { AVAILABLE_NOTE_TYPES, NOTE_TYPES, UNKNOWN_NOTE_TYPE, isOfficialNoteSpeedLockedType } from '../constants/editorConstants';
import { APPEAR_MODE_OPTIONS } from '../editor/editorViewConstants';
import { formatHistoryNumber, formatNoteLane } from '../editor/editorHistory';
import { formatTranslation, translations } from '../lang';
import { stripInputWhitespace } from '../utils/inputSanitization';
import type { Note } from '../types/editorTypes';

export default function EditorRightSidebar(props: any) {
  const {
    isRightPanelCompact,
    isRightPanelContentVisible,
    isPreviewMode,
    isOfficialChartFormat,
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
    handleCenterSelectedNotes,
    notes,
    bpmChanges,
    speedChanges,
    currentEditorBpm,
    currentEditorSpeed,
    currentEditorDistance,
    currentEditorCombo,
    currentEditorScore,
    canUseSelectedAsParent,
    currentId,
    currentParentInput,
    currentParentNote,
    noteWidth,
    selectedNoteType,
    setCurrentParentInput,
  } = props;
  const text = translations;
  const isSelectedNoteSpeedLocked = Boolean(
    isOfficialChartFormat
    && selectedSingleNote
    && isOfficialNoteSpeedLockedType(selectedSingleNote.type),
  );

  return (        <aside
          className={`${isRightPanelCompact ? 'w-12 cursor-pointer hover:bg-neutral-800/30' : 'w-64'} shrink-0 border-l border-neutral-800 bg-neutral-900/30 flex flex-col transition-all duration-300 overflow-hidden`}
          onClick={isRightPanelCompact ? toggleRightPanelCompact : undefined}
        >
          <div className="border-b border-neutral-800">
            <button
              onClick={(event) => {
                event.stopPropagation();
                toggleRightPanelCompact();
              }}
              className={`flex w-full items-center gap-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white ${isRightPanelContentVisible ? 'justify-start px-4 py-3 text-xs font-medium' : 'justify-center p-3'}`}
            >
              {isRightPanelCompact ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              {isRightPanelContentVisible && <span>{text.sidebar.collapseWindow}</span>}
            </button>
          </div>
          {isRightPanelContentVisible && (
            <>
            <div className="min-h-0 flex-1 p-4 flex flex-col gap-4 overflow-y-auto">
              <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">{text.sidebar.properties}</div>
              {isPreviewMode ? (
                <div className="flex flex-col gap-4">
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
                    <div className="text-sm font-medium text-neutral-200">{text.sidebar.previewStatistics}</div>
                    <div className="mt-3 flex flex-col divide-y divide-neutral-800 text-sm">
                      <div className="flex items-center justify-between py-2 first:pt-0">
                        <span className="text-neutral-400">{text.sidebar.currentDistance}</span>
                        <span className="font-mono text-neutral-100">{currentEditorDistance.toFixed(3)}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 last:pb-0">
                        <span className="text-neutral-400">{text.sidebar.currentScore}</span>
                        <span className="font-mono text-neutral-100">{currentEditorScore}</span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100">
                    {text.sidebar.previewAccuracyNotice}
                  </div>
                  <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100">
                    {text.sidebar.previewSpritePerformanceNotice}
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
                    <span>{text.sidebar.deselectAll}</span>
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
                        <div className="text-xs text-neutral-500">{text.sidebar.id} {selectedSingleNote.id}</div>
                      </div>
                    </div>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-400">{text.sidebar.type}</span>
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
                    <span className="mb-1 block text-xs text-neutral-400">{text.sidebar.timeposMeasureDecimal}</span>
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
                    <span className="mb-1 block text-xs text-neutral-400">{text.sidebar.xPosition}</span>
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
                    <span className="mb-1 block text-xs text-neutral-400">{text.sidebar.width}</span>
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
                    <span className="mb-1 block text-xs text-neutral-400">{text.sidebar.parentId}</span>
                    <div className="flex gap-2">
                      <CommitInput
                        type="number"
                        min="0"
                        value={selectedSingleNote.parentId ?? ''}
                        placeholder={text.common.none}
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
                        {text.sidebar.jumpTo}
                      </button>
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-400">{text.sidebar.speed}</span>
                    <CommitInput
                      type="text"
                      value={selectedSingleNote.speed ?? ''}
                      placeholder={text.common.default}
                      className={notePropertyInputClass}
                      disabled={isSelectedNoteSpeedLocked}
                      onCommit={(value) => {
                        if (isSelectedNoteSpeedLocked) {
                          return;
                        }
                        const normalizedValue = value.replace(/\s+/g, '');
                        updateSelectedNote({ speed: normalizedValue === '' ? undefined : normalizedValue });
                      }}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-400">{text.sidebar.appearMode}</span>
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
                      <span>{text.sidebar.deselectAll}</span>
                    </button>

                    <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
                      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">{text.sidebar.multiselectFunctions}</div>
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={handleCopySelectedNotes}
                          className="flex w-full items-center justify-center gap-2 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          <span>{text.sidebar.copy}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteSelectedNotes}
                          className="flex w-full items-center justify-center gap-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-200 transition-colors hover:bg-red-500/20 hover:text-white"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>{text.sidebar.delete}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleMirrorSelectedNotes}
                          className="flex w-full items-center justify-center gap-2 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
                        >
                          <FlipHorizontal className="h-3.5 w-3.5" />
                          <span>{text.sidebar.mirror}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleCenterSelectedNotes}
                          className="flex w-full items-center justify-center gap-2 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
                        >
                          <AlignCenterHorizontal className="h-3.5 w-3.5" />
                          <span>{text.sidebar.center}</span>
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 flex items-center justify-center text-sm text-neutral-600 border border-dashed border-neutral-800 rounded-lg p-4 text-center">
                      {formatTranslation(text.sidebar.notesSelected, { count: selectedNoteIds.length })}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
                    <div className="text-sm font-medium text-neutral-200">{text.sidebar.chartSummary}</div>
                    <div className="mt-3 flex flex-col divide-y divide-neutral-800 text-sm">
                      <div className="flex items-center justify-between py-2 first:pt-0">
                        <span className="text-neutral-400">{text.sidebar.totalNotes}</span>
                        <span className="font-mono text-neutral-100">{notes.length}</span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-neutral-400">{text.sidebar.bpmChanges}</span>
                        <span className="font-mono text-neutral-100">{bpmChanges.length}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 last:pb-0">
                        <span className="text-neutral-400">{text.sidebar.speedChanges}</span>
                        <span className="font-mono text-neutral-100">{speedChanges.length}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-neutral-800 py-2 pt-4">
                        <span className="text-neutral-400">{text.sidebar.currentBpm}</span>
                        <span className="font-mono text-neutral-100">{formatHistoryNumber(currentEditorBpm)}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 last:pb-0">
                        <span className="text-neutral-400">{text.sidebar.currentSpeed}</span>
                        <span className="font-mono text-neutral-100">{formatHistoryNumber(currentEditorSpeed)}x</span>
                      </div>
                      <div className="flex items-center justify-between py-2 last:pb-0">
                        <span className="text-neutral-400">{text.sidebar.currentDistance}</span>
                        <span className="font-mono text-neutral-100">{currentEditorDistance.toFixed(3)}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-neutral-800 py-2 pt-4">
                        <span className="text-neutral-400">{text.sidebar.currentCombo}</span>
                        <span className="font-mono text-neutral-100">{currentEditorCombo}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 last:pb-0">
                        <span className="text-neutral-400">{text.sidebar.currentScore}</span>
                        <span className="font-mono text-neutral-100">{currentEditorScore}</span>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
            {!isPreviewMode && (
              <div className="max-h-[45%] shrink-0 overflow-y-auto border-t border-neutral-800 p-4">
                <div className="mb-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">{text.sidebar.currentParent}</div>
                  <input
                    type="number"
                    min="0"
                    value={currentParentInput}
                    placeholder={text.sidebar.auto}
                    className="w-full rounded border border-neutral-700 bg-neutral-800 p-2 text-sm outline-none focus:border-indigo-500"
                    onChange={(e) => setCurrentParentInput(e.target.value)}
                    onBlur={() => setCurrentParentInput(stripInputWhitespace(currentParentInput))}
                  />
                  <div className="mt-2 text-xs text-neutral-400">
                    {currentParentNote
                      ? `ID ${currentParentNote.id} | XPos ${formatNoteLane(currentParentNote.lane)} | Type ${NOTE_TYPES[currentParentNote.type]?.name || currentParentNote.type}`
                      : currentParentInput.trim() === ''
                        ? text.sidebar.autoSelectCurrentIdWhenPlacing
                        : text.sidebar.noNoteExistsWithThatId}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => setCurrentParentInput('')}
                      className="flex-1 rounded bg-neutral-800 px-2 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-700"
                    >
                      {text.sidebar.auto}
                    </button>
                    <button
                      onClick={() => {
                        if (selectedSingleNote) {
                          setCurrentParentInput(selectedSingleNote.id.toString());
                        }
                      }}
                      disabled={!canUseSelectedAsParent}
                      className="flex-1 rounded bg-neutral-800 px-2 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-600"
                    >
                      {text.sidebar.useSelected}
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-neutral-500">
                    {text.sidebar.currentId}: {currentId}
                  </div>
                </div>

                <div className="border-t border-neutral-800 pt-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">{text.sidebar.selectedNote}</div>
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded border border-neutral-700 shadow-sm"
                      style={{ backgroundColor: NOTE_TYPES[selectedNoteType]?.color || '#3b82f6' }}
                    />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium text-neutral-300">{NOTE_TYPES[selectedNoteType]?.name || text.sidebar.unknown} ({selectedNoteType})</span>
                      <span className="text-xs text-neutral-400">{formatTranslation(text.sidebar.widthValue, { width: noteWidth })}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            </>
          )}
        </aside>
  );
}
