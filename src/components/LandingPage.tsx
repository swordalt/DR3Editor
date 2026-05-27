import React from 'react';
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  FilePlus,
  FileText,
  Github,
  GraduationCap,
  Image as ImageIcon,
  Monitor,
  Play,
  Upload,
  X,
} from 'lucide-react';
import { translations } from '../lang';

interface ExampleOption {
  id: string;
  label: string;
}

interface LandingPageProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onCreateProject: () => void;
  onImportClick: () => void;
  examples: readonly ExampleOption[];
  onExampleSelect: (exampleId: string) => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isExampleLoading?: boolean;
  isBackdropBlurDisabled: boolean;
  isAnimationDisabled: boolean;
}

export default function LandingPage({
  fileInputRef,
  onCreateProject,
  onImportClick,
  examples,
  onExampleSelect,
  onFileChange,
  isExampleLoading = false,
  isBackdropBlurDisabled,
  isAnimationDisabled,
}: LandingPageProps) {
  const [isFormatModalOpen, setIsFormatModalOpen] = React.useState(false);
  const [activePreviewIndex, setActivePreviewIndex] = React.useState(0);
  const [activeInfoTab, setActiveInfoTab] = React.useState<'about' | 'source'>('about');
  const [isViewportNoticeDismissed, setIsViewportNoticeDismissed] = React.useState(false);
  const [shouldShowViewportNotice, setShouldShowViewportNotice] = React.useState(false);
  const text = translations;
  const previewSlides = [
    {
      title: 'Editor overview',
      caption: 'Main charting workspace screenshot placeholder.',
    },
    {
      title: 'Timing tools',
      caption: 'BPM and speed editing screenshot placeholder.',
    },
    {
      title: 'Preview mode',
      caption: 'Playback preview screenshot placeholder.',
    },
  ];
  const activePreview = previewSlides[activePreviewIndex];

  const handleOfficialCreate = () => {
    setIsFormatModalOpen(false);
    onCreateProject();
  };

  const showPreviousPreview = () => {
    setActivePreviewIndex((currentIndex) => (
      currentIndex === 0 ? previewSlides.length - 1 : currentIndex - 1
    ));
  };

  const showNextPreview = () => {
    setActivePreviewIndex((currentIndex) => (
      currentIndex === previewSlides.length - 1 ? 0 : currentIndex + 1
    ));
  };

  React.useEffect(() => {
    const viewportNoticeQuery = window.matchMedia('(orientation: portrait), (max-width: 767px)');
    const updateViewportNotice = () => {
      setShouldShowViewportNotice(viewportNoticeQuery.matches);
    };

    updateViewportNotice();
    viewportNoticeQuery.addEventListener('change', updateViewportNotice);

    return () => {
      viewportNoticeQuery.removeEventListener('change', updateViewportNotice);
    };
  }, []);

  return (
    <div
      key="landing"
      className={`relative h-screen min-h-screen overflow-x-hidden overflow-y-auto bg-[#090a0c] text-neutral-50 font-sans selection:bg-neutral-500/30 animate-[fade-in_300ms_ease-out] ${isAnimationDisabled ? 'app-animations-disabled' : ''}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(255,255,255,0.08),transparent_30%),radial-gradient(circle_at_85%_18%,rgba(255,255,255,0.06),transparent_28%),linear-gradient(180deg,rgba(9,10,12,0)_0%,#090a0c_88%)]" />
      <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,.65)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.65)_1px,transparent_1px)] [background-size:48px_48px] [filter:drop-shadow(0_0_5px_rgba(255,255,255,0.32))]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.1),transparent_34%),radial-gradient(circle_at_50%_82%,rgba(255,255,255,0.045),transparent_38%)]" />

      <main className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col justify-center px-5 py-8 sm:px-8 lg:px-10">
        <header className="text-center animate-[rise-in_500ms_ease-out]">
          <h1 className="text-5xl font-bold tracking-tight text-white sm:text-7xl lg:text-8xl">
            {text.app.namePrefix}
            <span className="text-neutral-300"> {text.app.nameSuffix}</span>
          </h1>
        </header>

        <div className="grid items-stretch gap-10 pb-2 pt-16 lg:grid-cols-[minmax(0,0.94fr)_minmax(420px,1.06fr)] lg:gap-14">
          <section className="flex w-full flex-col animate-[rise-in_500ms_ease-out]">
            <section className="rounded-xl border border-white/10 bg-white/[0.075] p-4 shadow-2xl shadow-black/20">
              <div className="mb-3">
                <h2 className="text-sm font-bold text-white">Actions</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  onClick={() => setIsFormatModalOpen(true)}
                  className="group flex min-h-24 cursor-pointer items-center gap-4 rounded-xl border border-white/10 bg-neutral-950/50 px-5 py-4 text-left transition-[background-color,border-color,transform] hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.1] active:translate-y-0"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/10 text-neutral-200 transition-transform group-hover:scale-105">
                    <FilePlus className="h-6 w-6" />
                  </span>
                <span className="min-w-0">
                  <span className="block text-base font-bold text-white">{text.landing.newProject}</span>
                </span>
              </button>

                <button
                  onClick={onImportClick}
                  className="group flex min-h-24 cursor-pointer items-center gap-4 rounded-xl border border-white/10 bg-neutral-950/50 px-5 py-4 text-left transition-[background-color,border-color,transform] hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.1] active:translate-y-0"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/10 text-neutral-200 transition-transform group-hover:scale-105">
                    <Upload className="h-6 w-6" />
                  </span>
                <span className="min-w-0">
                  <span className="block text-base font-bold text-white">{text.landing.importProject}</span>
                </span>
              </button>

                <button
                  type="button"
                  className="group flex min-h-16 cursor-pointer items-center gap-4 rounded-xl border border-white/10 bg-neutral-950/50 px-5 py-4 text-left transition-[background-color,border-color,transform] hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.1] active:translate-y-0 sm:col-span-2"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-neutral-200 transition-transform group-hover:scale-105">
                    <GraduationCap className="h-5 w-5" />
                  </span>
                <span className="min-w-0">
                  <span className="block text-base font-bold text-white">Tutorial</span>
                </span>
              </button>
              </div>
            </section>

            <section className="mt-5 rounded-xl border border-white/10 bg-white/[0.075] p-4 shadow-2xl shadow-black/20">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-white">{text.landing.exampleProjects}</h2>
                </div>
                {isExampleLoading && (
                  <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-neutral-200">
                    {text.landing.loading}
                  </span>
                )}
              </div>
              <div className="grid gap-2">
                {examples.map((example) => (
                  <button
                    key={example.id}
                    type="button"
                    disabled={isExampleLoading}
                    onClick={() => onExampleSelect(example.id)}
                    className="group flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-transparent bg-neutral-950/50 px-3 py-2.5 text-left transition-colors hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-neutral-300">
                        <Play className="h-4 w-4 fill-current" />
                      </span>
                      <span className="truncate text-sm font-semibold text-neutral-200 group-hover:text-white">{example.label}</span>
                    </span>
                    <span className="hidden shrink-0 text-xs font-medium text-neutral-500 sm:block">Load</span>
                  </button>
                ))}
              </div>
            </section>

            <input
              type="file"
              accept=".zip,.txt"
              ref={fileInputRef}
              onChange={onFileChange}
              className="hidden"
            />
          </section>

          <section className="flex animate-[rise-in_650ms_ease-out]">
            <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.075] p-4 shadow-2xl shadow-black/20">
              <div className="mb-3 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setActiveInfoTab('about')}
                  className={`text-sm font-bold transition-colors ${activeInfoTab === 'about' ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
                >
                  About
                </button>
                <span className="h-4 w-px bg-white/15" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => setActiveInfoTab('source')}
                  className={`text-sm font-bold transition-colors ${activeInfoTab === 'source' ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
                >
                  Source
                </button>
              </div>

              {activeInfoTab === 'about' ? (
                <>
                  <p className="mb-4 text-sm leading-6 text-neutral-300">
                    {text.app.description}
                  </p>

                  <div className="relative min-h-[260px] flex-1 overflow-hidden lg:min-h-0">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="max-w-sm px-6 text-center">
                        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-neutral-300">
                          <ImageIcon className="h-7 w-7" />
                        </div>
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">WIP screenshot</div>
                        <h2 className="mt-3 text-2xl font-bold text-white">{activePreview.title}</h2>
                        <p className="mt-2 text-sm leading-6 text-neutral-400">{activePreview.caption}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={showPreviousPreview}
                      aria-label="Previous editor image"
                      className="absolute left-0 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg border border-white/10 bg-neutral-950/40 text-neutral-300 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={showNextPreview}
                      aria-label="Next editor image"
                      className="absolute right-0 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg border border-white/10 bg-neutral-950/40 text-neutral-300 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>

                    <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-2">
                      {previewSlides.map((slide, index) => (
                        <button
                          key={slide.title}
                          type="button"
                          onClick={() => setActivePreviewIndex(index)}
                          aria-label={`Show ${slide.title}`}
                          className={`h-2.5 rounded-full transition-[background-color,width] ${activePreviewIndex === index ? 'w-8 bg-neutral-200' : 'w-2.5 bg-neutral-600 hover:bg-neutral-400'}`}
                        />
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex min-h-[260px] flex-1 flex-col gap-5 lg:min-h-0">
                  <a
                    href="https://github.com/swordalt/dancerail3-editor"
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center gap-4 rounded-xl border border-white/10 bg-neutral-950/50 px-5 py-4 text-left transition-colors hover:border-white/25 hover:bg-white/[0.1]"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/10 text-neutral-200 transition-transform group-hover:scale-105">
                      <Github className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-base font-bold text-white">View Source Code</span>
                      <span className="mt-1 block truncate text-sm font-medium text-neutral-400">GitHub: swordalt/dancerail3-editor</span>
                    </span>
                  </a>

                  <div className="space-y-3 text-sm leading-6 text-neutral-300">
                    <p>
                      DanceRail3 Editor is a fan-made open-source web editor for creating and editing DanceRail3 charts.
                    </p>
                    <p>
                      Hitsounds and note sprites are from '<b>DanceRail3Viewer</b> by lucarioex'. Example projects are from '<b>DanceRail3</b> by SoraGame'. Easings are from '<b>easings.net</b> by Andrey Sitnik and Ivan Solovev'. Design and functionality inspired by both '<b>DanceRail3Maker</b> by lucarioex' as well as '<b>PhiEdit</b> by cmdysj'.
                    </p>
                    <p>
                      Not affiliated with DanceRail3, SoraGame, or official entities in any way, shape, or form.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {isFormatModalOpen && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 animate-[fade-in_180ms_ease-out] ${isBackdropBlurDisabled ? 'bg-black/75' : 'bg-black/60 backdrop-blur-md'} ${isAnimationDisabled ? 'app-animations-disabled' : ''}`}
          onMouseDown={() => setIsFormatModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="chart-format-title"
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 text-left shadow-2xl shadow-black/50 animate-[dialog-in_220ms_ease-out]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-5">
              <h2 id="chart-format-title" className="text-xl font-bold text-white">
                {text.landing.chooseChartFormat}
              </h2>
              <button
                type="button"
                onClick={() => setIsFormatModalOpen(false)}
                aria-label={text.landing.closeChartFormatDialog}
                className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-3 p-6">
              <button
                type="button"
                onClick={handleOfficialCreate}
                className="group flex w-full items-center gap-4 rounded-xl border border-white/20 bg-white/10 p-4 text-left transition-colors hover:border-white/35 hover:bg-white/15"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/10 text-neutral-200">
                  <FileText className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-white">{text.landing.officialFormat}</span>
                  <span className="mt-1 block text-sm text-neutral-400">{text.landing.officialFormatDescription}</span>
                </span>
              </button>

              <button
                type="button"
                disabled
                aria-disabled="true"
                className="flex w-full cursor-not-allowed items-center gap-4 rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 text-left opacity-55"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-neutral-500">
                  <Ban className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-neutral-300">{text.landing.customFormat}</span>
                  <span className="mt-1 block text-sm text-neutral-500">{text.landing.notAvailableYet}</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {shouldShowViewportNotice && !isViewportNoticeDismissed && (
        <div
          className={`fixed inset-0 z-[70] flex items-center justify-center p-4 animate-[fade-in_180ms_ease-out] ${isBackdropBlurDisabled ? 'bg-black/75' : 'bg-black/60 backdrop-blur-md'} ${isAnimationDisabled ? 'app-animations-disabled' : ''}`}
          onMouseDown={() => setIsViewportNoticeDismissed(true)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="viewport-notice-title"
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900 p-5 text-left shadow-2xl shadow-black/50 animate-[dialog-in_220ms_ease-out]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/10 text-neutral-200">
                <Monitor className="h-5 w-5" />
              </span>
              <button
                type="button"
                onClick={() => setIsViewportNoticeDismissed(true)}
                aria-label="Dismiss display notice"
                className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <h2 id="viewport-notice-title" className="text-lg font-bold text-white">
              Widescreen display recommended
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-300">
              This editor is best used with a horizontal widescreen display, 16:9 or wider. It is not suitable for mobile or portrait-oriented screens.
            </p>
            <button
              type="button"
              onClick={() => setIsViewportNoticeDismissed(true)}
              className="mt-5 w-full rounded-lg border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/25 hover:bg-white/15"
            >
              Continue anyway
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
