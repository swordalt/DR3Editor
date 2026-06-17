import { NOTE_TYPES } from '../constants/editorConstants';
import { formatNoteLane } from '../editor/editorHistory';
import { formatTranslation, translations } from '../lang';
import { stripInputWhitespace } from '../utils/inputSanitization';

export default function EditorLeftPersistentControls(props: any) {
  const {
    canUseSelectedAsParent,
    copiedNotesCount,
    currentId,
    currentParentInput,
    currentParentNote,
    handleClearCopiedNotes,
    isLeftPanelContentVisible,
    selectedSingleNote,
    setCurrentParentInput,
  } = props;
  const text = translations;
  const trimmedCurrentParentInput = currentParentInput.trim();
  const isAutoParent = trimmedCurrentParentInput === '';
  const currentParentStatusText = currentParentNote
    ? formatTranslation(text.sidebar.currentParentNoteSummary, {
      id: currentParentNote.id,
      xPosition: formatNoteLane(currentParentNote.lane),
      type: NOTE_TYPES[currentParentNote.type]?.name || currentParentNote.type,
    })
    : isAutoParent
      ? `${text.sidebar.auto}: #${currentId}`
      : text.sidebar.noNoteExistsWithThatId;
  const currentParentStatusClassName = currentParentNote
    ? 'text-neutral-200'
    : isAutoParent
      ? 'text-indigo-300'
      : 'text-amber-300';

  if (!isLeftPanelContentVisible) {
    return null;
  }

  return (
    <div className="shrink-0 border-t border-neutral-800 p-4">
      <div className="mb-3 rounded-lg border border-neutral-800 bg-neutral-950/40 p-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{text.sidebar.currentParent}</div>
          <div className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${isAutoParent ? 'bg-indigo-500/15 text-indigo-300' : 'bg-amber-500/15 text-amber-300'}`}>
            {isAutoParent ? text.sidebar.auto : text.sidebar.currentParentModeManual}
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-1.5">
          <input
            type="number"
            min="0"
            value={currentParentInput}
            placeholder={text.sidebar.auto}
            aria-label={text.sidebar.currentParentIdLabel}
            className="min-w-0 rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm outline-none focus:border-indigo-500"
            onChange={(event) => setCurrentParentInput(event.target.value)}
            onBlur={() => setCurrentParentInput(stripInputWhitespace(currentParentInput))}
          />
          <button
            type="button"
            onClick={() => setCurrentParentInput('')}
            className={`rounded px-2 py-1.5 text-xs font-medium transition-colors ${isAutoParent ? 'bg-indigo-500/20 text-indigo-200' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}`}
          >
            {text.sidebar.auto}
          </button>
          <button
            type="button"
            onClick={() => {
              if (selectedSingleNote) {
                setCurrentParentInput(selectedSingleNote.id.toString());
              }
            }}
            disabled={!canUseSelectedAsParent}
            className="rounded bg-neutral-800 px-2 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-600"
          >
            {text.sidebar.useSelected}
          </button>
        </div>

        <div className={`mt-2 truncate text-xs ${currentParentStatusClassName}`} title={currentParentStatusText}>
          {currentParentStatusText}
        </div>
      </div>

      <button
        type="button"
        onClick={handleClearCopiedNotes}
        disabled={copiedNotesCount === 0}
        className="w-full rounded-lg bg-neutral-800 px-3 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white disabled:bg-neutral-900 disabled:text-neutral-600"
      >
        {text.sidebar.clearClipboard}
      </button>
    </div>
  );
}
