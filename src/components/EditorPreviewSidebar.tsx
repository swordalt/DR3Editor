import type { Dispatch, SetStateAction } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { translations } from '../lang';

interface PreviewSettingToggleProps {
  label: string;
  description: string;
  isEnabled: boolean;
  ariaLabel: string;
  onToggle: () => void;
}

function PreviewSettingToggle({
  label,
  description,
  isEnabled,
  ariaLabel,
  onToggle,
}: PreviewSettingToggleProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-neutral-950/60 p-4">
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

export default function EditorPreviewSidebar({
  isLeftPanelCompact,
  isLeftPanelContentVisible,
  toggleLeftPanelCompact,
  isPreviewCameraTiltEnabled,
  isPreviewCameraMovementEnabled,
  isPreviewNoteSpeedChangesEnabled,
  isPreviewNoteAppearModeEnabled,
  setIsPreviewCameraTiltEnabled,
  setIsPreviewCameraMovementEnabled,
  setIsPreviewNoteSpeedChangesEnabled,
  setIsPreviewNoteAppearModeEnabled,
}: {
  isLeftPanelCompact: boolean;
  isLeftPanelContentVisible: boolean;
  toggleLeftPanelCompact: () => void;
  isPreviewCameraTiltEnabled: boolean;
  isPreviewCameraMovementEnabled: boolean;
  isPreviewNoteSpeedChangesEnabled: boolean;
  isPreviewNoteAppearModeEnabled: boolean;
  setIsPreviewCameraTiltEnabled: Dispatch<SetStateAction<boolean>>;
  setIsPreviewCameraMovementEnabled: Dispatch<SetStateAction<boolean>>;
  setIsPreviewNoteSpeedChangesEnabled: Dispatch<SetStateAction<boolean>>;
  setIsPreviewNoteAppearModeEnabled: Dispatch<SetStateAction<boolean>>;
}) {
  const text = translations;

  return (
    <aside className={`${isLeftPanelCompact ? 'w-12' : 'w-64'} shrink-0 border-r border-neutral-800 bg-neutral-900/30 flex flex-col transition-all duration-300 overflow-hidden`}>
      <div className={`p-2 border-b border-neutral-800 flex ${isLeftPanelContentVisible ? 'justify-start' : 'justify-center'}`}>
        <button
          onClick={toggleLeftPanelCompact}
          className={`flex items-center gap-2 rounded text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors ${isLeftPanelContentVisible ? 'px-2 py-1 text-xs font-medium' : 'p-1'}`}
        >
          {isLeftPanelCompact ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {isLeftPanelContentVisible && <span>{text.sidebar.collapseWindow}</span>}
        </button>
      </div>
      {isLeftPanelContentVisible && (
      <div className="flex flex-col gap-4 overflow-y-auto p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{text.sidebar.previewMode}</div>
        <PreviewSettingToggle
          label={text.sidebar.cameraTilt}
          description={text.sidebar.cameraTiltDescription}
          isEnabled={isPreviewCameraTiltEnabled}
          ariaLabel={text.sidebar.togglePreviewCameraTilt}
          onToggle={() => setIsPreviewCameraTiltEnabled((current) => !current)}
        />
        <PreviewSettingToggle
          label={text.sidebar.cameraMovement}
          description={text.sidebar.cameraMovementDescription}
          isEnabled={isPreviewCameraMovementEnabled}
          ariaLabel={text.sidebar.togglePreviewCameraMovement}
          onToggle={() => setIsPreviewCameraMovementEnabled((current) => !current)}
        />
        <PreviewSettingToggle
          label={text.sidebar.noteSpeedChanges}
          description={text.sidebar.noteSpeedChangesDescription}
          isEnabled={isPreviewNoteSpeedChangesEnabled}
          ariaLabel={text.sidebar.togglePreviewNoteSpeedChanges}
          onToggle={() => setIsPreviewNoteSpeedChangesEnabled((current) => !current)}
        />
        <PreviewSettingToggle
          label={text.sidebar.noteAppearMode}
          description={text.sidebar.noteAppearModeDescription}
          isEnabled={isPreviewNoteAppearModeEnabled}
          ariaLabel={text.sidebar.togglePreviewNoteAppearMode}
          onToggle={() => setIsPreviewNoteAppearModeEnabled((current) => !current)}
        />
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100">
          {text.sidebar.previewAccuracyNotice}
        </div>
      </div>
      )}
    </aside>
  );
}
