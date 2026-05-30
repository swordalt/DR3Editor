import { translations } from '../lang';

export default function EditorLeftPersistentControls(props: any) {
  const {
    copiedNotesCount,
    handleClearCopiedNotes,
    isLeftPanelContentVisible,
  } = props;
  const text = translations;

  if (!isLeftPanelContentVisible) {
    return null;
  }

  return (
    <div className="shrink-0 border-t border-neutral-800 p-4">
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
