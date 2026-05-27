import { NOTE_TYPES } from '../constants/editorConstants';
import { formatNoteLane } from '../editor/editorHistory';
import { translations } from '../lang';

export default function EditorLeftPersistentControls(props: any) {
  const {
    canUseSelectedAsParent,
    copiedNotesCount,
    currentId,
    currentParentInput,
    currentParentNote,
    handleClearCopiedNotes,
    isLeftPanelContentVisible,
    noteWidth,
    selectedNoteType,
    selectedSingleNote,
    setCurrentParentInput,
  } = props;
  const text = translations;

  if (!isLeftPanelContentVisible) {
    return null;
  }

  return (
    <div className="max-h-[45%] shrink-0 overflow-y-auto border-t border-neutral-800 p-4">
      <button
        type="button"
        onClick={handleClearCopiedNotes}
        disabled={copiedNotesCount === 0}
        className="mb-4 w-full rounded-lg bg-neutral-800 px-3 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white disabled:bg-neutral-900 disabled:text-neutral-600"
      >
        {text.sidebar.clearClipboard}
      </button>

      <div className="mb-4 border-t border-neutral-800 pt-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">{text.sidebar.currentParent}</div>
        <input
          type="number"
          min="0"
          value={currentParentInput}
          placeholder={text.sidebar.auto}
          className="w-full rounded border border-neutral-700 bg-neutral-800 p-2 text-sm outline-none focus:border-indigo-500"
          onChange={(e) => setCurrentParentInput(e.target.value)}
        />
        <div className="mt-2 text-xs text-neutral-400">
          {currentParentNote
            ? `ID ${currentParentNote.id} | XPos ${formatNoteLane(currentParentNote.lane)} | Type ${NOTE_TYPES[currentParentNote.type]?.name || currentParentNote.type}`
            : currentParentInput.trim() === ''
              ? 'Auto-select current ID when placing.'
              : 'No note exists with that ID.'}
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
          Current ID: {currentId}
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
            <span className="truncate text-sm font-medium text-neutral-300">{NOTE_TYPES[selectedNoteType]?.name || 'Unknown'}</span>
            <span className="text-xs text-neutral-400">Width: {noteWidth} / 16</span>
          </div>
        </div>
      </div>
    </div>
  );
}
