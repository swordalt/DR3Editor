import { useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { PREVIEW_MODE_FORMAT_OPTIONS, type PreviewModeFormat } from '../editor/editorSettings';
import { translations } from '../lang';

const PREVIEW_MODE_FORMAT_LABELS: Record<PreviewModeFormat, string> = {
  default: translations.overlays.previewModeFormatDefault,
  official: translations.overlays.previewModeFormatOfficial,
  dr3custom: translations.overlays.previewModeFormatDr3Custom,
};

interface PreviewSettingToggleProps {
  label: string;
  isEnabled: boolean;
  ariaLabel: string;
  onToggle: () => void;
  isDisabled?: boolean;
}

function PreviewSettingToggle({
  label,
  isEnabled,
  ariaLabel,
  onToggle,
  isDisabled = false,
}: PreviewSettingToggleProps) {
  return (
    <div className={`rounded-md border border-white/10 bg-neutral-950/60 px-3 py-2.5 ${isDisabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-sm font-medium leading-5 text-white">{label}</p>
        <button
          type="button"
          role="switch"
          aria-checked={isEnabled}
          aria-label={ariaLabel}
          disabled={isDisabled}
          onClick={onToggle}
          className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border transition-colors ${
            isEnabled
              ? 'border-emerald-300/40 bg-emerald-500/90'
              : 'border-white/10 bg-neutral-800'
          } disabled:cursor-not-allowed`}
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
  isPreviewHoldSpritesEnabled,
  isPreviewChartSpeedChangesEnabled,
  isPreviewCameraTiltEnabled,
  isPreviewCameraMovementEnabled,
  isPreviewNoteSpeedChangesEnabled,
  isPreviewNoteAppearModeEnabled,
  previewModeFormat,
  setIsPreviewSpritesEnabled,
  setIsPreviewHoldSpritesEnabled,
  setIsPreviewChartSpeedChangesEnabled,
  setIsPreviewCameraTiltEnabled,
  setIsPreviewCameraMovementEnabled,
  setIsPreviewNoteSpeedChangesEnabled,
  setIsPreviewNoteAppearModeEnabled,
  setPreviewModeFormat,
}: {
  isLeftPanelCompact: boolean;
  isLeftPanelContentVisible: boolean;
  toggleLeftPanelCompact: () => void;
  isPreviewSpritesEnabled: boolean;
  isPreviewHoldSpritesEnabled: boolean;
  isPreviewChartSpeedChangesEnabled: boolean;
  isPreviewCameraTiltEnabled: boolean;
  isPreviewCameraMovementEnabled: boolean;
  isPreviewNoteSpeedChangesEnabled: boolean;
  isPreviewNoteAppearModeEnabled: boolean;
  previewModeFormat: PreviewModeFormat;
  setIsPreviewSpritesEnabled: Dispatch<SetStateAction<boolean>>;
  setIsPreviewHoldSpritesEnabled: Dispatch<SetStateAction<boolean>>;
  setIsPreviewChartSpeedChangesEnabled: Dispatch<SetStateAction<boolean>>;
  setIsPreviewCameraTiltEnabled: Dispatch<SetStateAction<boolean>>;
  setIsPreviewCameraMovementEnabled: Dispatch<SetStateAction<boolean>>;
  setIsPreviewNoteSpeedChangesEnabled: Dispatch<SetStateAction<boolean>>;
  setIsPreviewNoteAppearModeEnabled: Dispatch<SetStateAction<boolean>>;
  setPreviewModeFormat: Dispatch<SetStateAction<PreviewModeFormat>>;
}) {
  const text = translations;
  const [isPreviewModeFormatMenuOpen, setIsPreviewModeFormatMenuOpen] = useState(false);

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
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100">
          {text.sidebar.previewAccuracyNotice}
        </div>
        <div className={`relative rounded-md border border-white/10 bg-neutral-950/60 px-3 py-2.5 ${isPreviewModeFormatMenuOpen ? 'z-20' : 'z-0'}`}>
          <div className="mb-2">
            <p className="text-sm font-medium leading-5 text-white">{text.overlays.previewModeFormat}</p>
            <p className="mt-1 text-xs leading-5 text-neutral-500">
              {text.overlays.previewModeFormatDescription}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsPreviewModeFormatMenuOpen((current) => !current)}
            className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-left text-sm text-neutral-200 outline-none transition-colors hover:bg-neutral-800 focus:border-indigo-500"
            aria-haspopup="menu"
            aria-expanded={isPreviewModeFormatMenuOpen}
          >
            <span>{PREVIEW_MODE_FORMAT_LABELS[previewModeFormat]}</span>
            <ChevronRight className={`h-4 w-4 text-neutral-500 transition-transform ${isPreviewModeFormatMenuOpen ? 'rotate-90' : ''}`} />
          </button>
          {isPreviewModeFormatMenuOpen && (
            <div
              className="absolute left-3 right-3 top-full z-50 mt-2 rounded-lg border border-neutral-700 bg-neutral-950 p-1 shadow-2xl shadow-black/40"
              role="menu"
            >
              {PREVIEW_MODE_FORMAT_OPTIONS.map((format) => {
                const isDisabled = format === 'dr3custom';
                const isSelected = previewModeFormat === format;

                return (
                  <button
                    key={format}
                    type="button"
                    onClick={() => {
                      if (isDisabled) return;
                      setPreviewModeFormat(format);
                      setIsPreviewModeFormatMenuOpen(false);
                    }}
                    disabled={isDisabled}
                    className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm transition-colors ${
                      isSelected
                        ? 'bg-indigo-500/20 text-indigo-200'
                        : isDisabled
                          ? 'cursor-not-allowed text-neutral-600'
                          : 'text-neutral-200 hover:bg-neutral-800'
                    }`}
                    role="menuitem"
                  >
                    <span>{PREVIEW_MODE_FORMAT_LABELS[format]}</span>
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <PreviewSettingSection title={text.sidebar.previewAppearance}>
          <PreviewSettingToggle
            label={text.sidebar.previewSprites}
            isEnabled={isPreviewSpritesEnabled}
            ariaLabel={text.sidebar.togglePreviewSprites}
            onToggle={() => setIsPreviewSpritesEnabled((current) => !current)}
          />
          <PreviewSettingToggle
            label={text.sidebar.previewHoldSprites}
            isEnabled={isPreviewHoldSpritesEnabled}
            ariaLabel={text.sidebar.togglePreviewHoldSprites}
            isDisabled={!isPreviewSpritesEnabled}
            onToggle={() => setIsPreviewHoldSpritesEnabled((current) => !current)}
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
