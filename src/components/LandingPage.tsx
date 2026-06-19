import React from 'react';
import {
  FilePlus,
  Github,
  GraduationCap,
  HeartHandshake,
  Image,
  Monitor,
  Music2,
  Palette,
  Play,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import appLogoUrl from '../assets/dr3editor_logo.png';
import { changelogEntries } from '../data/changelog';
import { translations } from '../lang';

interface ExampleOption {
  id: string;
  label: string;
}

interface LandingPageProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onCreateProject: () => void;
  onStartTutorial: () => void;
  onImportClick: () => void;
  examples: readonly ExampleOption[];
  onExampleSelect: (exampleId: string) => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isExampleLoading?: boolean;
  isBackdropBlurDisabled: boolean;
  isAnimationDisabled: boolean;
}

const STANDARD_HD_WIDTH = 1280;
const STANDARD_HD_HEIGHT = 720;
const WIDESCREEN_ASPECT_RATIO = 16 / 9;
type InfoTab = 'about' | 'source' | 'changelog';

const shouldWarnForDesktopDisplay = () => {
  const displayWidth = window.screen?.width || window.innerWidth;
  const displayHeight = window.screen?.height || window.innerHeight;
  const displayAspectRatio = displayWidth / displayHeight;
  const isBelowStandardHd = displayWidth < STANDARD_HD_WIDTH || displayHeight < STANDARD_HD_HEIGHT;

  return isBelowStandardHd && displayAspectRatio < WIDESCREEN_ASPECT_RATIO;
};

export default function LandingPage({
  fileInputRef,
  onCreateProject,
  onStartTutorial,
  onImportClick,
  examples,
  onExampleSelect,
  onFileChange,
  isExampleLoading = false,
  isBackdropBlurDisabled,
  isAnimationDisabled,
}: LandingPageProps) {
  const [activeInfoTab, setActiveInfoTab] = React.useState<InfoTab>('about');
  const [isViewportNoticeDismissed, setIsViewportNoticeDismissed] = React.useState(false);
  const [shouldShowViewportNotice, setShouldShowViewportNotice] = React.useState(false);
  const text = translations;

  React.useEffect(() => {
    const mobileViewportQuery = window.matchMedia('(hover: none) and (pointer: coarse)');
    const updateViewportNotice = () => {
      setShouldShowViewportNotice(mobileViewportQuery.matches || shouldWarnForDesktopDisplay());
    };

    updateViewportNotice();
    mobileViewportQuery.addEventListener('change', updateViewportNotice);
    window.addEventListener('resize', updateViewportNotice);

    return () => {
      mobileViewportQuery.removeEventListener('change', updateViewportNotice);
      window.removeEventListener('resize', updateViewportNotice);
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
            {text.app.name}
          </h1>
        </header>

        <div className="grid items-stretch gap-10 pb-2 pt-16 lg:grid-cols-[minmax(0,0.94fr)_minmax(420px,1.06fr)] lg:gap-14">
          <section className="flex w-full flex-col animate-[rise-in_500ms_ease-out]">
            <section className="rounded-xl border border-white/10 bg-neutral-950/75 p-4 shadow-2xl shadow-black/20">
              <div className="mb-3">
                <h2 className="text-sm font-bold text-white">{text.landing.actions}</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  onClick={onCreateProject}
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
                  onClick={onStartTutorial}
                  className="group flex min-h-16 cursor-pointer items-center gap-4 rounded-xl border border-white/10 bg-neutral-950/50 px-5 py-4 text-left transition-[background-color,border-color,transform] hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.1] active:translate-y-0 sm:col-span-2"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-neutral-200 transition-transform group-hover:scale-105">
                    <GraduationCap className="h-5 w-5" />
                  </span>
                <span className="min-w-0">
                  <span className="block text-base font-bold text-white">{text.landing.tutorial}</span>
                </span>
              </button>
              </div>
            </section>

            <section className="mt-5 rounded-xl border border-white/10 bg-neutral-950/75 p-4 shadow-2xl shadow-black/20">
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
                    <span className="hidden shrink-0 text-xs font-medium text-neutral-500 sm:block">{text.landing.load}</span>
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

          <section className="relative min-h-[420px] min-w-0 animate-[rise-in_650ms_ease-out] lg:min-h-0">
            <div className="absolute inset-0 flex w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-950/75 p-4 shadow-2xl shadow-black/20">
              <div className="mb-3 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setActiveInfoTab('about')}
                  className={`text-sm font-bold transition-colors ${activeInfoTab === 'about' ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
                >
                  {text.landing.about}
                </button>
                <span className="h-4 w-px bg-white/15" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => setActiveInfoTab('source')}
                  className={`text-sm font-bold transition-colors ${activeInfoTab === 'source' ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
                >
                  {text.landing.source}
                </button>
                <span className="h-4 w-px bg-white/15" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => setActiveInfoTab('changelog')}
                  className={`text-sm font-bold transition-colors ${activeInfoTab === 'changelog' ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
                >
                  {text.landing.changelog}
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">
                {activeInfoTab === 'about' ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="flex max-w-md flex-col items-center gap-5 text-center">
                      <div className="flex h-52 w-52 items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-xl shadow-black/25">
                        <img
                          src={appLogoUrl}
                          alt={`${text.app.name} logo`}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <p className="text-sm leading-6 text-neutral-300">
                        {text.app.description}
                      </p>
                    </div>
                  </div>
                ) : activeInfoTab === 'source' ? (
                  <div className="flex h-full flex-col gap-5 overflow-y-auto pr-2">
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
                        <span className="block text-base font-bold text-white">{text.landing.viewSourceCode}</span>
                        <span className="mt-1 block truncate text-sm font-medium text-neutral-400">{text.landing.repositoryLabel}</span>
                      </span>
                    </a>

                    <div className="h-px bg-white/10" aria-hidden="true" />

                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <HeartHandshake className="h-4 w-4 text-neutral-400" />
                        <h2 className="text-sm font-bold text-white">{text.landing.attribution}</h2>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg border border-white/10 bg-neutral-950/40 p-3">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-neutral-500">
                            <Music2 className="h-3.5 w-3.5" />
                            {text.landing.assets}
                          </div>
                          <p className="mt-2 text-sm leading-5 text-neutral-300">
                            {text.landing.assetsAttributionPrefix} <strong className="font-semibold text-neutral-100">DanceRail3Viewer</strong> {text.landing.assetsAttributionSuffix}
                          </p>
                        </div>

                        <div className="rounded-lg border border-white/10 bg-neutral-950/40 p-3">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-neutral-500">
                            <Image className="h-3.5 w-3.5" />
                            {text.landing.examplesAndLogo}
                          </div>
                          <p className="mt-2 text-sm leading-5 text-neutral-300">
                            {text.landing.examplesAndLogoAttributionPrefix} <strong className="font-semibold text-neutral-100">DanceRail3</strong> {text.landing.examplesAndLogoAttributionSuffix}
                          </p>
                        </div>

                        <div className="rounded-lg border border-white/10 bg-neutral-950/40 p-3">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-neutral-500">
                            <Sparkles className="h-3.5 w-3.5" />
                            {text.landing.easings}
                          </div>
                          <p className="mt-2 text-sm leading-5 text-neutral-300">
                            {text.landing.easingsAttributionPrefix} <strong className="font-semibold text-neutral-100">easings.net</strong> {text.landing.easingsAttributionSuffix}
                          </p>
                        </div>

                        <div className="rounded-lg border border-white/10 bg-neutral-950/40 p-3">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-neutral-500">
                            <Palette className="h-3.5 w-3.5" />
                            {text.landing.inspiration}
                          </div>
                          <p className="mt-2 text-sm leading-5 text-neutral-300">
                            {text.landing.inspirationAttributionPrefix} <strong className="font-semibold text-neutral-100">DanceRail3Maker</strong> {text.landing.inspirationAttributionMiddle} <strong className="font-semibold text-neutral-100">PhiEdit</strong> {text.landing.inspirationAttributionSuffix}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full overflow-y-auto pr-2">
                    <div className="space-y-4">
                      {changelogEntries.map((entry) => (
                        <article
                          key={`${entry.version}-${entry.date}`}
                          className="rounded-xl border border-white/10 bg-neutral-950/40 p-4"
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <h2 className="text-base font-bold text-white">{entry.version}</h2>
                            <span className="shrink-0 text-xs font-semibold text-neutral-500">{entry.date}</span>
                          </div>
                          <ul className="mt-3 space-y-2 text-sm leading-6 text-neutral-300">
                            {entry.changes.map((change) => (
                              <li key={change} className="flex gap-2">
                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-500" aria-hidden="true" />
                                <span>{change}</span>
                              </li>
                            ))}
                          </ul>
                        </article>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>

      {shouldShowViewportNotice && !isViewportNoticeDismissed && (
        <div
          className={`fixed inset-0 z-[70] flex items-center justify-center p-4 animate-[fade-in_180ms_ease-out] ${isBackdropBlurDisabled ? 'bg-black/75' : 'bg-black/55 backdrop-blur-md'} ${isAnimationDisabled ? 'app-animations-disabled' : ''}`}
          onMouseDown={() => setIsViewportNoticeDismissed(true)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="viewport-notice-title"
            className="w-full max-w-sm rounded-3xl border border-white/10 bg-neutral-950/90 p-5 text-left shadow-2xl shadow-black/50 animate-[dialog-in_220ms_ease-out]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/10 text-neutral-200">
                <Monitor className="h-5 w-5" />
              </span>
              <button
                type="button"
                onClick={() => setIsViewportNoticeDismissed(true)}
                aria-label={text.landing.dismissDisplayNotice}
                className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <h2 id="viewport-notice-title" className="text-lg font-bold text-white">
              {text.landing.notice}
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-300">
              {text.landing.displayNotice}
            </p>
            <button
              type="button"
              onClick={() => setIsViewportNoticeDismissed(true)}
              className="mt-5 w-full rounded-lg border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/25 hover:bg-white/15"
            >
              {text.landing.acknowledge}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
