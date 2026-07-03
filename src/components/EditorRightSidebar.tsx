import { useMemo, useState } from 'react';
import { AlignCenterHorizontal, ChevronDown, ChevronLeft, ChevronRight, FlipHorizontal, X } from 'lucide-react';
import CommitInput from './CommitInput';
import { AVAILABLE_NOTE_TYPES, NOTE_TYPES, UNKNOWN_NOTE_TYPE, isOfficialNoteSpeedLockedType } from '../constants/editorConstants';
import { APPEAR_MODE_OPTIONS } from '../editor/editorViewConstants';
import { formatHistoryNumber } from '../editor/editorHistory';
import { formatTranslation, translations } from '../lang';
import type { Note } from '../types/editorTypes';
import { menuItemClassName, menuSurfaceClassName } from './editorDesign';

interface PropertySelectOption<TValue extends string> {
  id: TValue;
  label: string;
}

interface PropertySelectProps<TValue extends string> {
  id: string;
  value: TValue;
  options: Array<PropertySelectOption<TValue>>;
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
  onChange: (value: TValue) => void;
}

function PropertySelect<TValue extends string>({
  id,
  value,
  options,
  openMenuId,
  setOpenMenuId,
  onChange,
}: PropertySelectProps<TValue>) {
  const selectedOption = options.find(option => option.id === value) ?? options[0];
  const isOpen = openMenuId === id;

  return (
    <div className={`relative ${isOpen ? 'z-30' : 'z-0'}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setOpenMenuId(isOpen ? null : id)}
        className="flex min-h-9 w-full items-center justify-between gap-2 rounded border border-neutral-700 bg-neutral-800 px-2.5 py-2 text-left text-sm text-neutral-100 outline-none transition-colors hover:border-neutral-600 hover:bg-neutral-700 focus:border-indigo-500"
      >
        <span className="min-w-0 truncate">{selectedOption?.label ?? value}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div role="listbox" className={`absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-y-auto ${menuSurfaceClassName}`}>
          {options.map(option => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={option.id === value}
              onClick={() => {
                onChange(option.id);
                setOpenMenuId(null);
              }}
              className={`${menuItemClassName} ${option.id === value ? 'bg-indigo-500/15 text-indigo-100' : ''}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
    noteWidth,
    selectedNoteType,
    tutorialFocusTargets = [],
  } = props;
  const text = translations;
  const [openPropertyMenuId, setOpenPropertyMenuId] = useState<string | null>(null);
  const noteTypeOptions = useMemo<Array<PropertySelectOption<string>>>(() => (
    AVAILABLE_NOTE_TYPES.map(type => ({
      id: String(type),
      label: `${type} - ${NOTE_TYPES[type]?.name || UNKNOWN_NOTE_TYPE.name}`,
    }))
  ), []);
  const appearModeOptions = useMemo<Array<PropertySelectOption<string>>>(() => (
    APPEAR_MODE_OPTIONS.map(appearMode => ({
      id: appearMode,
      label: appearMode,
    }))
  ), []);
  const isOnlySelectedNoteTypeIndicatorFocused = tutorialFocusTargets.includes('selectedNoteTypeIndicator')
    && !tutorialFocusTargets.includes('rightSidebar');
  const tutorialMutedClassName = isOnlySelectedNoteTypeIndicatorFocused
    ? 'opacity-30 pointer-events-none select-none transition-opacity'
    : '';
  const tutorialFocusedIndicatorClassName = isOnlySelectedNoteTypeIndicatorFocused
    ? 'relative z-30 rounded-lg border border-indigo-400/40 bg-neutral-950/80 p-3 shadow-lg shadow-indigo-950/30 transition-opacity'
    : '';
  const isSelectedNoteSpeedLocked = Boolean(
    isOfficialChartFormat
    && selectedSingleNote
    && isOfficialNoteSpeedLockedType(selectedSingleNote.type),
  );

  return (        <aside
          className={`${isRightPanelCompact ? 'w-12 cursor-pointer hover:bg-neutral-800/30' : 'w-64'} h-full shrink-0 border-l border-neutral-800 bg-neutral-900/30 flex flex-col transition-all duration-300 overflow-hidden`}
          onClick={isRightPanelCompact ? toggleRightPanelCompact : undefined}
        >
          <div className="border-b border-neutral-800">
            <button
              onClick={(event) => {
                event.stopPropagation();
                toggleRightPanelCompact();
              }}
              className={`flex w-full items-center gap-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white ${isRightPanelContentVisible ? 'justify-end px-4 py-3 text-xs font-medium' : 'justify-center p-3'}`}
            >
              {isRightPanelContentVisible && <span>{text.sidebar.collapseWindow}</span>}
              {isRightPanelCompact ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
          {isRightPanelContentVisible && (
            <>
            <div className={`min-h-0 flex-1 p-4 flex flex-col gap-4 overflow-y-auto ${tutorialMutedClassName}`}>
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
                    <PropertySelect
                      id="note-type"
                      value={String(selectedSingleNote.type)}
                      options={noteTypeOptions}
                      openMenuId={openPropertyMenuId}
                      setOpenMenuId={setOpenPropertyMenuId}
                      onChange={(value) => updateSelectedNote({ type: Number(value) })}
                    />
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
                    <PropertySelect
                      id="appear-mode"
                      value={selectedSingleNote.appearMode ?? 'none'}
                      options={appearModeOptions}
                      openMenuId={openPropertyMenuId}
                      setOpenMenuId={setOpenPropertyMenuId}
                      onChange={(nextAppearMode) => {
                        updateSelectedNote({
                          appearMode: nextAppearMode === 'none'
                            ? undefined
                            : nextAppearMode as Note['appearMode'],
                        });
                      }}
                    />
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
                      <span>{formatTranslation(text.sidebar.deselectSelected, { count: selectedNoteIds.length })}</span>
                    </button>

                    <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
                      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">{text.sidebar.multiselectFunctions}</div>
                      <div className="flex flex-col gap-2">
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
              <div className={`max-h-[45%] shrink-0 overflow-y-auto border-t border-neutral-800 p-4 ${isOnlySelectedNoteTypeIndicatorFocused ? 'relative z-30' : ''}`}>
                <div className={tutorialFocusedIndicatorClassName}>
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
