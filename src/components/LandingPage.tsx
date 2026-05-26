import React from 'react';
import {
  Ban,
  FilePlus,
  FileText,
  FolderOpen,
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
  const text = translations;

  const handleOfficialCreate = () => {
    setIsFormatModalOpen(false);
    onCreateProject();
  };

  return (
    <div
      key="landing"
      className={`relative h-screen min-h-screen overflow-x-hidden overflow-y-auto bg-[#090a0c] text-neutral-50 font-sans selection:bg-neutral-500/30 animate-[fade-in_300ms_ease-out] ${isAnimationDisabled ? 'app-animations-disabled' : ''}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(255,255,255,0.08),transparent_30%),radial-gradient(circle_at_85%_18%,rgba(255,255,255,0.06),transparent_28%),linear-gradient(180deg,rgba(9,10,12,0)_0%,#090a0c_88%)]" />
      <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:48px_48px]" />

      <main className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-5 sm:px-8 lg:px-10">
        <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[minmax(0,0.94fr)_minmax(420px,1.06fr)] lg:gap-14">
          <section className="max-w-2xl animate-[rise-in_500ms_ease-out]">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl">
              {text.app.namePrefix}
              <span className="block text-neutral-300">{text.app.nameSuffix}</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-neutral-300 sm:text-lg">
              {text.app.description}
            </p>

            <div className="mt-9 grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => setIsFormatModalOpen(true)}
                className="group flex min-h-24 cursor-pointer items-center gap-4 rounded-xl border border-white/20 bg-neutral-100 px-5 py-4 text-left text-neutral-950 shadow-2xl shadow-black/30 transition-[background-color,border-color,transform] hover:-translate-y-0.5 hover:bg-white active:translate-y-0"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-neutral-950 text-neutral-100 transition-transform group-hover:scale-105">
                  <FilePlus className="h-6 w-6" />
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-bold">{text.landing.newProject}</span>
                  <span className="mt-1 block text-sm font-medium text-neutral-800">{text.landing.newProjectDescription}</span>
                </span>
              </button>

              <button
                onClick={onImportClick}
                className="group flex min-h-24 cursor-pointer items-center gap-4 rounded-xl border border-white/10 bg-white/[0.06] px-5 py-4 text-left shadow-2xl shadow-black/20 transition-[background-color,border-color,transform] hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.1] active:translate-y-0"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/10 text-neutral-200 transition-transform group-hover:scale-105">
                  <Upload className="h-6 w-6" />
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-bold text-white">{text.landing.importProject}</span>
                  <span className="mt-1 block text-sm font-medium text-neutral-400">{text.landing.importProjectDescription}</span>
                </span>
              </button>
            </div>

            <section className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-black/20">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-white">{text.landing.exampleProjects}</h2>
                  <p className="mt-0.5 text-xs text-neutral-500">Open a finished chart and explore the editor.</p>
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

          <section className="animate-[rise-in_650ms_ease-out]">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/65 shadow-2xl shadow-black/40">
              <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-rose-400" />
                  <span className="h-3 w-3 rounded-full bg-amber-300" />
                  <span className="h-3 w-3 rounded-full bg-emerald-400" />
                </div>
                <div className="text-xs font-semibold text-neutral-500">Preview workspace</div>
              </div>

              <div className="grid min-h-[420px] grid-cols-[88px_minmax(0,1fr)] sm:grid-cols-[132px_minmax(0,1fr)]">
                <aside className="border-r border-white/10 bg-neutral-950/70 p-3">
                  {[
                    ['Info', 'bg-neutral-200'],
                    ['BPM', 'bg-neutral-400'],
                    ['Speed', 'bg-neutral-500'],
                    ['Curve', 'bg-neutral-300'],
                  ].map(([label, color]) => (
                    <div key={label} className="mb-2 rounded-lg border border-white/10 bg-white/[0.04] p-2">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${color}`} />
                        <span className="text-xs font-semibold text-neutral-300">{label}</span>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-neutral-800" />
                    </div>
                  ))}
                </aside>

                <div className="relative overflow-hidden bg-[#10131a]">
                  <div className="absolute inset-x-0 top-0 z-10 flex h-12 items-center justify-between border-b border-white/10 bg-neutral-950/80 px-4">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-neutral-300" />
                      <span className="text-xs font-semibold text-neutral-300">Untitled chart</span>
                    </div>
                    <div className="rounded-md bg-neutral-200 px-2.5 py-1 text-xs font-bold text-neutral-950">180 BPM</div>
                  </div>

                  <div className="absolute inset-0 top-12 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:100%_52px,56px_100%]" />
                  <div className="absolute left-1/2 top-12 h-full w-px bg-white/30" />
                  <div className="absolute inset-x-8 bottom-20 h-1 rounded-full bg-white/20" />
                  <div className="absolute bottom-20 left-8 right-8 h-10 rounded-xl border border-white/20 bg-white/10" />

                  {[
                    'left-[21%] top-[22%] w-16 bg-neutral-200',
                    'left-[57%] top-[30%] w-12 bg-neutral-400',
                    'left-[35%] top-[43%] w-24 bg-neutral-300',
                    'left-[68%] top-[55%] w-14 bg-neutral-500',
                    'left-[16%] top-[67%] w-20 bg-neutral-200',
                  ].map((classes, index) => (
                    <div
                      key={index}
                      className={`absolute h-4 rounded-full shadow-lg shadow-black/30 ${classes}`}
                    />
                  ))}
                </div>
              </div>
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
    </div>
  );
}
