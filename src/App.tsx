import React, { Suspense, lazy, useRef, useState } from 'react';
import LandingPage from './components/LandingPage';
import { loadEditorSettings } from './editor/editorSettings';
import { translations } from './lang';
import type { BpmChange, Note, ProjectData, SpeedChange, ViewState } from './types/editorTypes';

const Editor = lazy(() => import('./Editor'));

const DEFAULT_BPM_CHANGES: BpmChange[] = [{ timepos: 0, bpm: 180, timeSignature: '4/4' }];
const DEFAULT_SPEED_CHANGES: SpeedChange[] = [{ timepos: 0, speedChange: 1 }];
const EXAMPLES = [
  {
    id: 'poppy',
    label: 'Poppy - Tier11 [Official]',
    projectUrl: 'https://raw.githubusercontent.com/swordalt/dancerail3-editor/refs/heads/example-projects/poppy.zip',
    fileName: 'poppy.zip',
    difficulty: '11',
  },
  {
    id: 'galaxycollapse',
    label: 'Galaxy Collapse - Tier20 [Official]',
    projectUrl: 'https://raw.githubusercontent.com/swordalt/dancerail3-editor/refs/heads/example-projects/galaxycollapse.zip',
    fileName: 'galaxycollapse.zip',
    difficulty: '20',
  },
  {
    id: 'hellowind',
    label: "Ghost-O'-Note - Tier15 [Official]",
    projectUrl: 'https://raw.githubusercontent.com/swordalt/dancerail3-editor/refs/heads/example-projects/hellowind.zip',
    fileName: 'hellowind.zip',
    difficulty: '15',
  },
  {
    id: 'raidboss',
    label: 'カタストロフィック・ラヴ - Tier17 [Official]',
    projectUrl: 'https://raw.githubusercontent.com/swordalt/dancerail3-editor/refs/heads/example-projects/raidboss.zip',
    fileName: 'raidboss.zip',
    difficulty: '17',
  },
] as const;
const AUDIO_EXTENSIONS = new Set(['aac', 'flac', 'm4a', 'mp3', 'ogg', 'wav', 'webm']);
const IMAGE_EXTENSIONS = new Set(['avif', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp']);
const text = translations;

const getFileExtension = (fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension && extension !== fileName.toLowerCase() ? extension : '';
};

const getFileBaseName = (fileName: string) => {
  const normalizedName = fileName.split('/').pop() || fileName;
  const extension = getFileExtension(normalizedName);
  return extension ? normalizedName.slice(0, -(extension.length + 1)) : normalizedName;
};

const getZipBaseName = (fileName: string) => (
  fileName.toLowerCase().endsWith('.zip') ? fileName.slice(0, -4) : getFileBaseName(fileName)
);

const getMimeType = (extension: string) => {
  const mimeTypes: Record<string, string> = {
    aac: 'audio/aac',
    avif: 'image/avif',
    flac: 'audio/flac',
    gif: 'image/gif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    m4a: 'audio/mp4',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    png: 'image/png',
    svg: 'image/svg+xml',
    wav: 'audio/wav',
    webm: 'audio/webm',
    webp: 'image/webp',
  };

  return mimeTypes[extension] || 'application/octet-stream';
};

const sortByName = <T extends { name: string }>(files: T[]) => (
  [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
);

interface ZipImportEntry {
  id: string;
  entry: {
    async: (type: 'text' | 'blob') => Promise<string | Blob>;
  };
  name: string;
  extension: string;
}

interface ZipImportDialogState {
  sourceFile: File;
  difficulty?: string;
  chartFiles: ZipImportEntry[];
  audioFiles: ZipImportEntry[];
  imageFiles: ZipImportEntry[];
  infoFile: ZipImportEntry | null;
  selectedChartId: string;
  selectedAudioId: string;
  selectedImageId: string;
  messages: string[];
  canImport: boolean;
}

const getDefaultBpmChanges = (): BpmChange[] => DEFAULT_BPM_CHANGES.map(change => ({ ...change }));
const getDefaultSpeedChanges = (): SpeedChange[] => DEFAULT_SPEED_CHANGES.map(change => ({ ...change }));

export default function App() {
  const editorSettings = loadEditorSettings();
  const isBackdropBlurDisabled = editorSettings.isBackdropBlurDisabled;
  const isAnimationDisabled = editorSettings.isAnimationDisabled;
  const [view, setView] = useState<ViewState>({ page: 'landing' });
  const [notes, setNotes] = useState<Note[]>([]);
  const [bpmChanges, setBpmChanges] = useState<BpmChange[]>(DEFAULT_BPM_CHANGES);
  const [speedChanges, setSpeedChanges] = useState<SpeedChange[]>(DEFAULT_SPEED_CHANGES);
  const [offset, setOffset] = useState<string | number>(0);
  const [initialProjectData, setInitialProjectData] = useState<ProjectData | null>(null);
  const [initialChartFileName, setInitialChartFileName] = useState<string | null>(null);
  const [zipImportDialog, setZipImportDialog] = useState<ZipImportDialogState | null>(null);
  const [isExampleLoading, setIsExampleLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetEditorState = () => {
    setNotes([]);
    setBpmChanges(getDefaultBpmChanges());
    setSpeedChanges(getDefaultSpeedChanges());
    setOffset(0);
    setInitialProjectData(null);
    setInitialChartFileName(null);
  };

  const handleImportClick = () => {
    resetEditorState();
    fileInputRef.current?.click();
  };

  const handleLevelImport = async (text: string) => {
    const { parseLevelText } = await import('./utils/levelFormat');
    const parsedLevel = parseLevelText(text);

    setNotes(parsedLevel.notes);
    setBpmChanges(parsedLevel.bpmChanges.length > 0 ? parsedLevel.bpmChanges : getDefaultBpmChanges());
    setSpeedChanges(parsedLevel.speedChanges.length > 0 ? parsedLevel.speedChanges : getDefaultSpeedChanges());
    setOffset(parsedLevel.offset);

    return parsedLevel;
  };

  const getZipImportEntries = async (file: File) => {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(file);
    const zipFiles = Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .map((entry) => ({
        id: entry.name,
        entry: entry as ZipImportEntry['entry'],
        name: entry.name.split('/').pop() || entry.name,
        extension: getFileExtension(entry.name),
      }));
    const textFiles = sortByName(zipFiles.filter(({ extension }) => extension === 'txt'));
    const audioFiles = sortByName(zipFiles.filter(({ extension }) => AUDIO_EXTENSIONS.has(extension)));
    const imageFiles = sortByName(zipFiles.filter(({ extension }) => IMAGE_EXTENSIONS.has(extension)));
    const infoFile = textFiles.find(({ name }) => name.toLowerCase() === 'info.txt') ?? null;

    return {
      chartFiles: textFiles.filter(({ name }) => name.toLowerCase() !== 'info.txt'),
      audioFiles,
      imageFiles,
      infoFile,
    };
  };

  const importResolvedZip = async ({
    sourceFile,
    difficulty,
    chartFile,
    audioFileEntry,
    imageFileEntry,
    infoFile,
  }: {
    sourceFile: File;
    difficulty?: string;
    chartFile: ZipImportEntry;
    audioFileEntry: ZipImportEntry | null;
    imageFileEntry: ZipImportEntry | null;
    infoFile: ZipImportEntry | null;
  }) => {
    const chartText = await chartFile.entry.async('text') as string;
    const parsedLevel = await handleLevelImport(chartText);
    setInitialChartFileName(chartFile.name);
    const nextBpmChanges = parsedLevel.bpmChanges.length > 0 ? parsedLevel.bpmChanges : getDefaultBpmChanges();
    const firstBpm = nextBpmChanges[0]?.bpm || 120;
    const zipBaseName = getZipBaseName(sourceFile.name);
    const chartBaseName = getFileBaseName(chartFile.name);
    const chartNameParts = chartBaseName.split('.');
    const inferredDifficulty = chartNameParts.length > 1
      ? chartNameParts[chartNameParts.length - 1]
      : chartBaseName;

    if (audioFileEntry) {
      const [audioBlob, imageBlob, infoText] = await Promise.all([
        audioFileEntry.entry.async('blob') as Promise<Blob>,
        imageFileEntry ? imageFileEntry.entry.async('blob') as Promise<Blob> : Promise.resolve(null),
        infoFile ? infoFile.entry.async('text') as Promise<string> : Promise.resolve(''),
      ]);
      const audioFile = new File(
        [audioBlob],
        audioFileEntry.name,
        { type: getMimeType(audioFileEntry.extension) },
      );
      const imageFile = imageFileEntry && imageBlob
        ? new File(
            [imageBlob],
            imageFileEntry.name,
            { type: getMimeType(imageFileEntry.extension) },
          )
        : null;
      const [infoTitle = '', infoArtist = '', infoBpm = ''] = infoText
        .split(/\r?\n/)
        .map((line) => line.trim());
      const audioBaseName = getFileBaseName(audioFileEntry.name);
      const songId = audioBaseName.toLowerCase() === 'base' ? zipBaseName : audioBaseName;
      const bpm = parseFloat(infoBpm) || firstBpm;

      setInitialProjectData({
        chartFormat: 'Official',
        songId,
        songName: infoTitle || songId,
        songArtist: infoArtist,
        songBpm: bpm.toString(),
        difficulty: difficulty || inferredDifficulty || '0',
        songFile: audioFile,
        songIllustration: imageFile,
        bpm,
        audioUrl: URL.createObjectURL(audioFile),
      });
    } else {
      setInitialProjectData(null);
    }

    setView({ page: 'editor', mode: 'import' });
  };

  const handleZipImport = async (file: File, options: { difficulty?: string; showImportNotice?: boolean } = {}) => {
    const { difficulty, showImportNotice = true } = options;

    try {
      const { chartFiles, audioFiles, imageFiles, infoFile } = await getZipImportEntries(file);
      const missingMessages = [
        ...(chartFiles.length === 0 ? [text.importDialog.missingChartFile] : []),
        ...(audioFiles.length === 0 ? [text.importDialog.missingAudioFile] : []),
      ];
      const needsSelection = chartFiles.length > 1 || audioFiles.length > 1 || imageFiles.length > 1;

      if (showImportNotice && (missingMessages.length > 0 || needsSelection)) {
        setZipImportDialog({
          sourceFile: file,
          difficulty,
          chartFiles,
          audioFiles,
          imageFiles,
          infoFile,
          selectedChartId: chartFiles[0]?.id ?? '',
          selectedAudioId: audioFiles[0]?.id ?? '',
          selectedImageId: imageFiles[0]?.id ?? '',
          messages: missingMessages,
          canImport: chartFiles.length > 0,
        });
        return;
      }

      const chartFile = chartFiles[0] ?? null;
      if (!chartFile) {
        throw new Error(text.importDialog.noChartFileInZip);
      }

      await importResolvedZip({
        sourceFile: file,
        difficulty,
        chartFile,
        audioFileEntry: audioFiles[0] ?? null,
        imageFileEntry: imageFiles[0] ?? null,
        infoFile,
      });
    } catch (error) {
      console.error(error);
      if (showImportNotice) {
        setZipImportDialog({
          sourceFile: file,
          difficulty,
          chartFiles: [],
          audioFiles: [],
          imageFiles: [],
          infoFile: null,
          selectedChartId: '',
          selectedAudioId: '',
          selectedImageId: '',
          messages: [text.importDialog.unreadableBundle],
          canImport: false,
        });
        return;
      }
      throw error;
    }
  };

  const handleConfirmZipImportDialog = async () => {
    if (!zipImportDialog) return;

    if (!zipImportDialog.canImport) {
      setZipImportDialog(null);
      return;
    }

    const chartFile = zipImportDialog.chartFiles.find(file => file.id === zipImportDialog.selectedChartId)
      ?? zipImportDialog.chartFiles[0];
    if (!chartFile) {
      setZipImportDialog(null);
      return;
    }

    const audioFileEntry = zipImportDialog.audioFiles.find(file => file.id === zipImportDialog.selectedAudioId)
      ?? zipImportDialog.audioFiles[0]
      ?? null;
    const imageFileEntry = zipImportDialog.imageFiles.find(file => file.id === zipImportDialog.selectedImageId)
      ?? zipImportDialog.imageFiles[0]
      ?? null;
    const dialogState = zipImportDialog;
    setZipImportDialog(null);

    try {
      await importResolvedZip({
        sourceFile: dialogState.sourceFile,
        difficulty: dialogState.difficulty,
        chartFile,
        audioFileEntry,
        imageFileEntry,
        infoFile: dialogState.infoFile,
      });
    } catch (error) {
      console.error(error);
      setZipImportDialog({
        ...dialogState,
        messages: [text.importDialog.selectedFilesFailed],
        canImport: false,
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      resetEditorState();
      if (file.name.toLowerCase().endsWith('.zip')) {
        void handleZipImport(file);
      } else if (file.name.toLowerCase().endsWith('.txt')) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          await handleLevelImport(e.target?.result as string);
          setInitialChartFileName(file.name);
          setView({page: 'editor', mode: 'import'});
        };
        reader.readAsText(file);
      } else {
        console.log('Selected file:', file.name);
        setView({page: 'editor', mode: 'import'});
      }
    }
    // Reset input so the same file can be selected again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExampleSelect = async (exampleId: string) => {
    const example = EXAMPLES.find((entry) => entry.id === exampleId);
    if (!example) return;

    setIsExampleLoading(true);

    try {
      const response = await fetch(example.projectUrl);

      if (!response.ok) {
        throw new Error(`Unable to load example project: ${response.status}`);
      }

      const projectBlob = await response.blob();
      const projectFile = new File(
        [projectBlob],
        example.fileName,
        { type: projectBlob.type || 'application/zip' },
      );

      await handleZipImport(projectFile, {
        difficulty: example.difficulty,
        showImportNotice: false,
      });
    } catch (error) {
      console.error(error);
      alert(text.landing.exampleLoadFailed);
    } finally {
      setIsExampleLoading(false);
    }
  };

  return (
    <>
      {view.page === 'landing' ? (
        <LandingPage
          fileInputRef={fileInputRef}
          onCreateProject={() => {
            resetEditorState();
            setView({ page: 'editor', mode: 'new' });
          }}
          onImportClick={handleImportClick}
          examples={EXAMPLES}
          onExampleSelect={handleExampleSelect}
          onFileChange={handleFileChange}
          isExampleLoading={isExampleLoading}
          isBackdropBlurDisabled={isBackdropBlurDisabled}
          isAnimationDisabled={isAnimationDisabled}
        />
      ) : (
        <Suspense
          fallback={(
            <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-sm font-medium text-neutral-300">
              {text.app.loadingEditor}
            </div>
          )}
        >
          <Editor
            onBack={() => setView({ page: 'landing' })}
            mode={view.mode}
            initialProjectData={initialProjectData}
            initialChartFileName={initialChartFileName}
            notes={notes}
            setNotes={setNotes}
            bpmChanges={bpmChanges}
            setBpmChanges={setBpmChanges}
            speedChanges={speedChanges}
            setSpeedChanges={setSpeedChanges}
            offset={offset}
            setOffset={setOffset}
          />
        </Suspense>
      )}
      {zipImportDialog && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 font-sans text-neutral-50 ${isBackdropBlurDisabled ? 'bg-black/75' : 'bg-black/60 backdrop-blur-md'} ${isAnimationDisabled ? 'app-animations-disabled' : ''}`}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="zip-import-title"
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl shadow-black/50"
          >
            <div className="border-b border-neutral-800 px-6 py-5">
              <h2 id="zip-import-title" className="text-xl font-bold text-white">
                {text.importDialog.title}
              </h2>
              <p className="mt-1 text-sm text-neutral-400">
                {zipImportDialog.sourceFile.name}
              </p>
            </div>

            <div className="grid gap-4 p-6">
              {zipImportDialog.messages.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100">
                  {zipImportDialog.messages.map(message => (
                    <p key={message}>{message}</p>
                  ))}
                </div>
              )}

              {zipImportDialog.chartFiles.length > 1 && (
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-neutral-300">{text.importDialog.chartFile}</span>
                  <select
                    value={zipImportDialog.selectedChartId}
                    onChange={(event) => setZipImportDialog(current => current ? {
                      ...current,
                      selectedChartId: event.target.value,
                    } : current)}
                    className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 outline-none focus:border-indigo-500"
                  >
                    {zipImportDialog.chartFiles.map(file => (
                      <option key={file.id} value={file.id}>{file.name}</option>
                    ))}
                  </select>
                </label>
              )}

              {zipImportDialog.audioFiles.length > 1 && (
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-neutral-300">{text.importDialog.audioFile}</span>
                  <select
                    value={zipImportDialog.selectedAudioId}
                    onChange={(event) => setZipImportDialog(current => current ? {
                      ...current,
                      selectedAudioId: event.target.value,
                    } : current)}
                    className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 outline-none focus:border-indigo-500"
                  >
                    {zipImportDialog.audioFiles.map(file => (
                      <option key={file.id} value={file.id}>{file.name}</option>
                    ))}
                  </select>
                </label>
              )}

              {zipImportDialog.imageFiles.length > 1 && (
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-neutral-300">{text.importDialog.illustrationFile}</span>
                  <select
                    value={zipImportDialog.selectedImageId}
                    onChange={(event) => setZipImportDialog(current => current ? {
                      ...current,
                      selectedImageId: event.target.value,
                    } : current)}
                    className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 outline-none focus:border-indigo-500"
                  >
                    {zipImportDialog.imageFiles.map(file => (
                      <option key={file.id} value={file.id}>{file.name}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-neutral-800 px-6 py-4">
              <button
                type="button"
                onClick={() => setZipImportDialog(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
              >
                {text.importDialog.cancel}
              </button>
              <button
                type="button"
                onClick={() => { void handleConfirmZipImportDialog(); }}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
              >
                {text.importDialog.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
