import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { translations } from '../lang';

interface PreviewSettingToggleProps {
  label: string;
  isEnabled: boolean;
  ariaLabel: string;
  onToggle: () => void;
}

function PreviewSettingToggle({
  label,
  isEnabled,
  ariaLabel,
  onToggle,
}: PreviewSettingToggleProps) {
  return (
    <div className="rounded-md border border-white/10 bg-neutral-950/60 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-sm font-medium leading-5 text-white">{label}</p>
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

function PreviewSettingSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{title}</div>
      {children}
    </section>
  );
}

export default function EditorPreviewSidebar({
  isLeftPanelCompact,
  isLeftPanelContentVisible,
  toggleLeftPanelCompact,
  isPreviewSpritesEnabled,
  isPreviewHitFxEnabled,
  isPreviewChartSpeedChangesEnabled,
  isPreviewCameraTiltEnabled,
  isPreviewCameraMovementEnabled,
  isPreviewNoteSpeedChangesEnabled,
  isPreviewNoteAppearModeEnabled,
  setIsPreviewSpritesEnabled,
  setIsPreviewHitFxEnabled,
  setIsPreviewChartSpeedChangesEnabled,
  setIsPreviewCameraTiltEnabled,
  setIsPreviewCameraMovementEnabled,
  setIsPreviewNoteSpeedChangesEnabled,
  setIsPreviewNoteAppearModeEnabled,
}: {
  isLeftPanelCompact: boolean;
  isLeftPanelContentVisible: boolean;
  toggleLeftPanelCompact: () => void;
  isPreviewSpritesEnabled: boolean;
  isPreviewHitFxEnabled: boolean;
  isPreviewChartSpeedChangesEnabled: boolean;
  isPreviewCameraTiltEnabled: boolean;
  isPreviewCameraMovementEnabled: boolean;
  isPreviewNoteSpeedChangesEnabled: boolean;
  isPreviewNoteAppearModeEnabled: boolean;
  setIsPreviewSpritesEnabled: Dispatch<SetStateAction<boolean>>;
  setIsPreviewHitFxEnabled: Dispatch<SetStateAction<boolean>>;
  setIsPreviewChartSpeedChangesEnabled: Dispatch<SetStateAction<boolean>>;
  setIsPreviewCameraTiltEnabled: Dispatch<SetStateAction<boolean>>;
  setIsPreviewCameraMovementEnabled: Dispatch<SetStateAction<boolean>>;
  setIsPreviewNoteSpeedChangesEnabled: Dispatch<SetStateAction<boolean>>;
  setIsPreviewNoteAppearModeEnabled: Dispatch<SetStateAction<boolean>>;
}) {
  const text = translations;

  return (
    <aside
      className={`${isLeftPanelCompact ? 'w-12 cursor-pointer hover:bg-neutral-800/30' : 'w-64'} h-full shrink-0 border-r border-neutral-800 bg-neutral-900/30 flex flex-col transition-all duration-300 overflow-hidden`}
      onClick={isLeftPanelCompact ? toggleLeftPanelCompact : undefined}
    >
      <div className="border-b border-neutral-800">
        <button
          onClick={(event) => {
            event.stopPropagation();
            toggleLeftPanelCompact();
          }}
          className={`flex w-full items-center gap-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white ${isLeftPanelContentVisible ? 'justify-start px-4 py-3 text-xs font-medium' : 'justify-center p-3'}`}
        >
          {isLeftPanelCompact ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {isLeftPanelContentVisible && <span>{text.sidebar.collapseWindow}</span>}
        </button>
      </div>
      {isLeftPanelContentVisible && (
      <div className="flex flex-col gap-4 overflow-y-auto p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{text.sidebar.previewMode}</div>
        <PreviewSettingSection title={text.sidebar.previewAppearance}>
          <PreviewSettingToggle
            label={text.sidebar.previewSprites}
            isEnabled={isPreviewSpritesEnabled}
            ariaLabel={text.sidebar.togglePreviewSprites}
            onToggle={() => setIsPreviewSpritesEnabled((current) => !current)}
          />
          <PreviewSettingToggle
            label={text.sidebar.previewHitFx}
            isEnabled={isPreviewHitFxEnabled}
            ariaLabel={text.sidebar.togglePreviewHitFx}
            onToggle={() => setIsPreviewHitFxEnabled((current) => !current)}
          />
        </PreviewSettingSection>
        <PreviewSettingSection title={text.sidebar.previewCamera}>
          <PreviewSettingToggle
            label={text.sidebar.cameraTilt}
            isEnabled={isPreviewCameraTiltEnabled}
            ariaLabel={text.sidebar.togglePreviewCameraTilt}
            onToggle={() => setIsPreviewCameraTiltEnabled((current) => !current)}
          />
          <PreviewSettingToggle
            label={text.sidebar.cameraMovement}
            isEnabled={isPreviewCameraMovementEnabled}
            ariaLabel={text.sidebar.togglePreviewCameraMovement}
            onToggle={() => setIsPreviewCameraMovementEnabled((current) => !current)}
          />
        </PreviewSettingSection>
        <PreviewSettingSection title={text.sidebar.previewChart}>
          <PreviewSettingToggle
            label={text.sidebar.chartSpeedChanges}
            isEnabled={isPreviewChartSpeedChangesEnabled}
            ariaLabel={text.sidebar.togglePreviewChartSpeedChanges}
            onToggle={() => setIsPreviewChartSpeedChangesEnabled((current) => !current)}
          />
          <PreviewSettingToggle
            label={text.sidebar.noteSpeedChanges}
            isEnabled={isPreviewNoteSpeedChangesEnabled}
            ariaLabel={text.sidebar.togglePreviewNoteSpeedChanges}
            onToggle={() => setIsPreviewNoteSpeedChangesEnabled((current) => !current)}
          />
          <PreviewSettingToggle
            label={text.sidebar.noteAppearMode}
            isEnabled={isPreviewNoteAppearModeEnabled}
            ariaLabel={text.sidebar.togglePreviewNoteAppearMode}
            onToggle={() => setIsPreviewNoteAppearModeEnabled((current) => !current)}
          />
        </PreviewSettingSection>
      </div>
      )}
    </aside>
  );
}
