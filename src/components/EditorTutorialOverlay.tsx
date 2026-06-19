import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { formatTranslation, translations } from '../lang';
import type { TutorialDialoguePosition, TutorialStep } from '../editor/tutorial';

const dialoguePositionClassNames: Record<TutorialDialoguePosition, string> = {
  top: 'top-5 left-1/2 -translate-x-1/2',
  topLeft: 'top-5 left-5',
  topRight: 'top-5 right-5',
  bottom: 'bottom-5 left-1/2 -translate-x-1/2',
  bottomLeft: 'bottom-5 left-5',
  bottomRight: 'bottom-5 right-5',
  left: 'left-5 top-1/2 -translate-y-1/2',
  right: 'right-5 top-1/2 -translate-y-1/2',
};

interface EditorTutorialOverlayProps {
  currentStep: TutorialStep;
  currentStepIndex: number;
  stepCount: number;
  isAnimationDisabled: boolean;
  canGoBack: boolean;
  onBack: () => void;
  onSkip: () => void;
  onExit: () => void;
}

export default function EditorTutorialOverlay({
  currentStep,
  currentStepIndex,
  stepCount,
  isAnimationDisabled,
  canGoBack,
  onBack,
  onSkip,
  onExit,
}: EditorTutorialOverlayProps) {
  const text = translations.tutorial;
  const positionClassName = dialoguePositionClassNames[currentStep.dialoguePosition ?? 'bottom'];

  return (
    <section
      className={`fixed ${positionClassName} z-50 w-[min(34rem,calc(100vw-2rem))] rounded-lg border border-white/15 bg-neutral-950/95 p-4 text-neutral-100 shadow-2xl shadow-black/40 ${isAnimationDisabled ? '' : 'animate-[rise-in_180ms_ease-out]'}`}
      aria-live="polite"
    >
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
            {formatTranslation(text.stepProgress, {
              current: currentStepIndex + 1,
              total: stepCount,
            })}
          </div>
          <h2 className="mt-1 text-lg font-semibold text-white">{currentStep.title}</h2>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="rounded-md p-2 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
          aria-label={text.exit}
          title={text.exit}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="text-sm leading-6 text-neutral-300">{currentStep.body}</p>
      <div className="mt-3 rounded-md border border-indigo-400/20 bg-indigo-400/10 px-3 py-2 text-sm text-indigo-100">
        <span className="font-semibold">{text.objective}</span> {currentStep.objective}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={!canGoBack}
          className="inline-flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-semibold text-neutral-200 transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ChevronLeft className="h-4 w-4" />
          {text.back}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-600"
        >
          {text.skip}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
