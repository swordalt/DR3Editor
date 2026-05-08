import React from 'react';
import { Ban, ChevronDown, FilePlus, FileText, Upload, X } from 'lucide-react';

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
}

export default function LandingPage({
  fileInputRef,
  onCreateProject,
  onImportClick,
  examples,
  onExampleSelect,
  onFileChange,
  isExampleLoading = false,
}: LandingPageProps) {
  const [isExampleMenuOpen, setIsExampleMenuOpen] = React.useState(false);
  const [isFormatModalOpen, setIsFormatModalOpen] = React.useState(false);

  const handleExampleSelect = (exampleId: string) => {
    setIsExampleMenuOpen(false);
    onExampleSelect(exampleId);
  };

  const handleOfficialCreate = () => {
    setIsFormatModalOpen(false);
    onCreateProject();
  };

  return (
    <div
      key="landing"
      className="min-h-screen bg-neutral-950 text-neutral-50 flex flex-col items-center justify-center p-6 font-sans selection:bg-indigo-500/30 animate-[fade-in_300ms_ease-out]"
    >
      <div
        className="max-w-2xl w-full flex flex-col items-center text-center space-y-12 animate-[rise-in_500ms_ease-out]"
      >
        <div className="space-y-4">
          <div
            className="inline-flex items-center justify-center p-4 bg-indigo-500/10 rounded-2xl mb-4 animate-[pop-in_500ms_ease-out_200ms_both]"
          >
            <div className="w-16 h-16 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <h1 className="text-5xl font-bold tracking-tight text-white">
            DanceRail3 <span className="text-indigo-400">Editor</span>
          </h1>
          <p className="text-lg text-neutral-400 max-w-md mx-auto">
            A versatile web-based chart making & editing tool for the rhythm game DanceRail3.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-lg">
          <button
            onClick={() => setIsFormatModalOpen(true)}
            className="group relative flex flex-col items-center justify-center p-8 bg-neutral-900 border border-neutral-800 rounded-2xl hover:-translate-y-0.5 hover:scale-[1.02] active:scale-[0.98] hover:border-indigo-500/50 hover:bg-neutral-800/50 transition-[background-color,border-color,transform] overflow-hidden cursor-pointer"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <FilePlus className="w-10 h-10 text-indigo-400 mb-4 group-hover:scale-110 transition-transform duration-300" />
            <span className="text-lg font-semibold text-white">New Project</span>
            <span className="text-sm text-neutral-400 mt-2">Import an audio file and start charting.</span>
          </button>

          <button
            onClick={onImportClick}
            className="group relative flex flex-col items-center justify-center p-8 bg-neutral-900 border border-neutral-800 rounded-2xl hover:-translate-y-0.5 hover:scale-[1.02] active:scale-[0.98] hover:border-emerald-500/50 hover:bg-neutral-800/50 transition-[background-color,border-color,transform] overflow-hidden cursor-pointer"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <Upload className="w-10 h-10 text-emerald-400 mb-4 group-hover:scale-110 transition-transform duration-300" />
            <span className="text-lg font-semibold text-white">Import Project</span>
            <span className="text-sm text-neutral-400 mt-2">Import existing chart data or project.</span>
          </button>

          <div className="relative sm:col-span-2">
            <button
              type="button"
              disabled={isExampleLoading}
              onClick={() => setIsExampleMenuOpen((isOpen) => !isOpen)}
              aria-expanded={isExampleMenuOpen}
              aria-haspopup="menu"
              className="group relative flex h-12 w-full cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 px-5 text-sm font-semibold text-white outline-none transition-[background-color,border-color,transform] hover:scale-[1.01] hover:border-sky-500/50 hover:bg-neutral-800/50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 disabled:active:scale-100"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <span className="relative">{isExampleLoading ? 'Loading...' : 'Example Projects'}</span>
              <ChevronDown className={`relative h-4 w-4 text-sky-400 transition-transform duration-200 ${isExampleMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isExampleMenuOpen && (
              <div
                role="menu"
                className="absolute bottom-14 left-0 right-0 z-20 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 text-left shadow-2xl shadow-black/40 animate-[menu-in_160ms_ease-out]"
              >
                {examples.map((example) => (
                  <button
                    key={example.id}
                    type="button"
                    role="menuitem"
                    onClick={() => handleExampleSelect(example.id)}
                    className="block w-full px-5 py-3 text-sm font-medium text-neutral-200 transition-colors hover:bg-sky-500/10 hover:text-white"
                  >
                    {example.label}
                  </button>
                ))}
              </div>
            )}

            {isExampleMenuOpen && (
              <button
                type="button"
                aria-label="Close example menu"
                tabIndex={-1}
                onClick={() => setIsExampleMenuOpen(false)}
                className="fixed inset-0 z-10 cursor-default bg-transparent"
              />
            )}
          </div>

          <input
            type="file"
            accept=".zip,.txt"
            ref={fileInputRef}
            onChange={onFileChange}
            className="hidden"
          />
        </div>
      </div>

      {isFormatModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md animate-[fade-in_180ms_ease-out]"
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
                  Choose Chart Format
                </h2>
                <button
                  type="button"
                  onClick={() => setIsFormatModalOpen(false)}
                  aria-label="Close chart format dialog"
                  className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid gap-3 p-6">
                <button
                  type="button"
                  onClick={handleOfficialCreate}
                  className="group flex w-full items-center gap-4 rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-4 text-left transition-colors hover:border-indigo-400 hover:bg-indigo-500/15"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300">
                    <FileText className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-white">Official Format</span>
                    <span className="mt-1 block text-sm text-neutral-400">Use the official DanceRail3 chart format.</span>
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
                    <span className="block font-semibold text-neutral-300">DR3Custom Format</span>
                    <span className="mt-1 block text-sm text-neutral-500">Not available yet.</span>
                  </span>
                </button>
              </div>
          </div>
        </div>
      )}
    </div>
  );
}
