import React, { Suspense, lazy, useRef, useState } from 'react';
import { CheckCircle2, FileText, Image, Music, Upload } from 'lucide-react';
import LandingPage from './components/LandingPage';
import { loadEditorSettings } from './editor/editorSettings';
import { translations } from './lang';
import type { BpmChange, ImportLoadStatus, Note, ProjectData, SpeedChange, ViewState } from './types/editorTypes';

const Editor = lazy(() => import('./Editor'));

const DEFAULT_BPM_CHANGES: BpmChange[] = [{ timepos: 0, bpm: 180, timeSignature: '4/4' }];
const DEFAULT_SPEED_CHANGES: SpeedChange[] = [{ timepos: 0, speedChange: 1 }];
const SILENT_IMPORT_AUDIO_SAMPLE_RATE = 8000;
const SILENT_IMPORT_AUDIO_MARGIN_SECONDS = 5;
const SILENT_IMPORT_AUDIO_MIN_SECONDS = 10;
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

const getChartMetadataFromFileName = (fileName: string) => {
  const baseName = getFileBaseName(fileName);
  const match = baseName.match(/^(.+)\.([1-9]\d*)$/);

  return match
    ? { songId: match[1], difficulty: match[2] }
    : null;
};

const sanitizeSongId = (value: string) => {
  const sanitized = value.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return sanitized || 'imported_chart';
};

const getSilentImportAudioDuration = (notes: Note[]) => {
  const lastNoteTime = notes.reduce((maxTime, note) => (
    Number.isFinite(note.time) ? Math.max(maxTime, note.time) : maxTime
  ), 0);

  return Math.max(SILENT_IMPORT_AUDIO_MIN_SECONDS, lastNoteTime + SILENT_IMPORT_AUDIO_MARGIN_SECONDS);
};

const writeAscii = (view: DataView, offset: number, value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
};

const createSilentImportAudioUrl = (notes: Note[]) => {
  const duration = getSilentImportAudioDuration(notes);
  const sampleCount = Math.max(1, Math.ceil(duration * SILENT_IMPORT_AUDIO_SAMPLE_RATE));
  const bytesPerSample = 2;
  const channelCount = 1;
  const dataSize = sampleCount * bytesPerSample * channelCount;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, SILENT_IMPORT_AUDIO_SAMPLE_RATE, true);
  view.setUint32(28, SILENT_IMPORT_AUDIO_SAMPLE_RATE * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
};

const createAudioLessImportProjectData = ({
  sourceName,
  chartMetadata,
  difficulty,
  firstBpm,
  notes,
}: {
  sourceName: string;
  chartMetadata: ReturnType<typeof getChartMetadataFromFileName>;
  difficulty?: string;
  firstBpm: number;
  notes: Note[];
}): ProjectData => {
  const sourceBaseName = getFileBaseName(sourceName);
  const songId = sanitizeSongId(chartMetadata?.songId || sourceBaseName);
  const inferredDifficulty = difficulty || chartMetadata?.difficulty || '0';

  return {
    chartFormat: 'Official',
    songId,
    songName: songId,
    songArtist: '',
    songBpm: firstBpm.toString(),
    difficulty: inferredDifficulty,
    songFile: null,
    songIllustration: null,
    bpm: firstBpm,
    audioUrl: createSilentImportAudioUrl(notes),
  };
};

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

const waitForPaint = () => new Promise<void>((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
});

function ImportLoadingOverlay({ status }: { status: ImportLoadStatus }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-950/90 px-4 text-neutral-100">
      <div className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-2xl">
        <div className="mb-3 h-1 overflow-hidden rounded-full bg-neutral-800">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-indigo-500" />
        </div>
        <div className="text-sm font-semibold text-white">{status.title}</div>
        <div className="mt-1 text-sm text-neutral-400">{status.message}</div>
      </div>
    </div>
  );
}

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
  localChartFile: File | null;
  localAudioFile: File | null;
  localImageFile: File | null;
  messages: string[];
  canImport: boolean;
}

interface ZipImportResolverSectionProps {
  title: string;
  isRequired?: boolean;
  Icon: typeof FileText;
  bundledFiles: ZipImportEntry[];
  selectedId: string;
  localFile: File | null;
  accept: string;
  onSelectedIdChange: (selectedId: string) => void;
  onLocalFileChange: (file: File | null) => void;
}

function ZipImportResolverSection({
  title,
  isRequired = false,
  Icon,
  bundledFiles,
  selectedId,
  localFile,
  accept,
  onSelectedIdChange,
  onLocalFileChange,
}: ZipImportResolverSectionProps) {
  const hasBundledFiles = bundledFiles.length > 0;
  const selectedBundledFile = bundledFiles.find(file => file.id === selectedId) ?? bundledFiles[0] ?? null;

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-4">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-neutral-300">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${isRequired ? 'bg-amber-500/10 text-amber-200 ring-1 ring-amber-500/30' : 'bg-neutral-800 text-neutral-400'}`}>
              {isRequired ? text.importDialog.required : text.importDialog.optional}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-neutral-500">
            {localFile
              ? `${text.importDialog.usingLocalFile}: ${localFile.name}`
              : selectedBundledFile
                ? `${text.importDialog.usingBundledFile}: ${selectedBundledFile.name}`
                : text.importDialog.noBundledFile}
          </p>
        </div>
        {(localFile || selectedBundledFile) && (
          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-400" />
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="grid min-w-0 gap-1">
          <span className="text-xs font-medium text-neutral-500">{text.importDialog.bundledFile}</span>
          {hasBundledFiles ? (
            <select
              value={selectedId}
              onChange={(event) => onSelectedIdChange(event.target.value)}
              className="h-10 min-w-0 rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-sm text-neutral-100 outline-none transition-colors focus:border-indigo-500"
            >
              {bundledFiles.map(file => (
                <option key={file.id} value={file.id}>{file.name}</option>
              ))}
            </select>
          ) : (
            <div className="flex h-10 items-center rounded-lg border border-neutral-800 bg-neutral-900 px-3 text-sm text-neutral-500">
              {text.importDialog.noBundledFile}
            </div>
          )}
        </label>

        <label className="grid gap-1 sm:w-48">
          <span className="text-xs font-medium text-neutral-500">{text.importDialog.localFile}</span>
          <span className={`flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors ${localFile ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:border-emerald-400' : 'border-dashed border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-indigo-500 hover:text-white'}`}>
            <Upload className="h-4 w-4" />
            <span className="truncate">{localFile?.name || text.importDialog.chooseLocalFile}</span>
          </span>
          <input
            type="file"
            accept={accept}
            className="hidden"
            onChange={(event) => onLocalFileChange(event.target.files?.[0] ?? null)}
          />
        </label>
      </div>
    </section>
  );
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
  const [importLoadStatus, setImportLoadStatus] = useState<ImportLoadStatus | null>(null);
  const [isExampleLoading, setIsExampleLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateImportLoadStatus = async (status: ImportLoadStatus) => {
    setImportLoadStatus(status);
    await waitForPaint();
  };

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
    await updateImportLoadStatus(text.importStatus.readingBundle);
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
    localChartFile,
    audioFileEntry,
    localAudioFile,
    imageFileEntry,
    localImageFile,
    infoFile,
  }: {
    sourceFile: File;
    difficulty?: string;
    chartFile: ZipImportEntry | null;
    localChartFile?: File | null;
    audioFileEntry: ZipImportEntry | null;
    localAudioFile?: File | null;
    imageFileEntry: ZipImportEntry | null;
    localImageFile?: File | null;
    infoFile: ZipImportEntry | null;
  }) => {
    await updateImportLoadStatus(text.importStatus.readingChart);
    const chartText = localChartFile
      ? await localChartFile.text()
      : await chartFile!.entry.async('text') as string;
    await updateImportLoadStatus(text.importStatus.parsingChart);
    const parsedLevel = await handleLevelImport(chartText);
    const chartFileName = localChartFile?.name ?? chartFile!.name;
    setInitialChartFileName(chartFileName);
    const nextBpmChanges = parsedLevel.bpmChanges.length > 0 ? parsedLevel.bpmChanges : getDefaultBpmChanges();
    const firstBpm = nextBpmChanges[0]?.bpm || 120;
    const zipBaseName = getZipBaseName(sourceFile.name);
    const chartBaseName = getFileBaseName(chartFileName);
    const chartMetadata = getChartMetadataFromFileName(chartFileName);
    const chartNameParts = chartBaseName.split('.');
    const inferredDifficulty = chartNameParts.length > 1
      ? chartNameParts[chartNameParts.length - 1]
      : chartBaseName;

    const resolvedAudioFile = localAudioFile ?? null;
    const resolvedImageFile = localImageFile ?? null;

    if (audioFileEntry || resolvedAudioFile) {
      await updateImportLoadStatus(text.importStatus.loadingAssets);
      const [audioBlob, imageBlob, infoText] = await Promise.all([
        resolvedAudioFile ? Promise.resolve(null) : audioFileEntry!.entry.async('blob') as Promise<Blob>,
        resolvedImageFile || !imageFileEntry ? Promise.resolve(null) : imageFileEntry.entry.async('blob') as Promise<Blob>,
        infoFile ? infoFile.entry.async('text') as Promise<string> : Promise.resolve(''),
      ]);
      const audioFile = resolvedAudioFile ?? new File(
        [audioBlob!],
        audioFileEntry!.name,
        { type: getMimeType(audioFileEntry!.extension) },
      );
      const imageFile = resolvedImageFile ?? (imageFileEntry && imageBlob
        ? new File(
            [imageBlob],
            imageFileEntry.name,
            { type: getMimeType(imageFileEntry.extension) },
          )
        : null);
      const [infoTitle = '', infoArtist = '', infoBpm = ''] = infoText
        .split(/\r?\n/)
        .map((line) => line.trim());
      const audioBaseName = getFileBaseName(audioFile.name);
      const songId = chartMetadata?.songId || (audioBaseName.toLowerCase() === 'base' ? zipBaseName : audioBaseName);
      const bpm = parseFloat(infoBpm) || firstBpm;

      setInitialProjectData({
        chartFormat: 'Official',
        songId,
        songName: infoTitle || songId,
        songArtist: infoArtist,
        songBpm: bpm.toString(),
        difficulty: difficulty || chartMetadata?.difficulty || inferredDifficulty || '0',
        songFile: audioFile,
        songIllustration: imageFile,
        bpm,
        audioUrl: URL.createObjectURL(audioFile),
      });
    } else {
      setInitialProjectData(createAudioLessImportProjectData({
        sourceName: chartFileName,
        chartMetadata,
        difficulty: difficulty || inferredDifficulty || '0',
        firstBpm,
        notes: parsedLevel.notes,
      }));
    }

    await updateImportLoadStatus(text.importStatus.openingEditor);
    setView({ page: 'editor', mode: 'import' });
  };

  const handleZipImport = async (file: File, options: { difficulty?: string; showImportNotice?: boolean } = {}) => {
    const { difficulty, showImportNotice = true } = options;

    try {
      await updateImportLoadStatus(text.importStatus.preparingImport);
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
          localChartFile: null,
          localAudioFile: null,
          localImageFile: null,
          messages: missingMessages,
          canImport: chartFiles.length > 0,
        });
        setImportLoadStatus(null);
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
        localChartFile: null,
        audioFileEntry: audioFiles[0] ?? null,
        localAudioFile: null,
        imageFileEntry: imageFiles[0] ?? null,
        localImageFile: null,
        infoFile,
      });
    } catch (error) {
      console.error(error);
      setImportLoadStatus(null);
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
          localChartFile: null,
          localAudioFile: null,
          localImageFile: null,
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

    if (!zipImportDialog.canImport && !zipImportDialog.localChartFile) {
      setZipImportDialog(null);
      return;
    }

    const chartFile = zipImportDialog.chartFiles.find(file => file.id === zipImportDialog.selectedChartId)
      ?? zipImportDialog.chartFiles[0]
      ?? null;
    if (!chartFile && !zipImportDialog.localChartFile) {
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
      await updateImportLoadStatus(text.importStatus.preparingImport);
      await importResolvedZip({
        sourceFile: dialogState.sourceFile,
        difficulty: dialogState.difficulty,
        chartFile,
        localChartFile: dialogState.localChartFile,
        audioFileEntry,
        localAudioFile: dialogState.localAudioFile,
        imageFileEntry,
        localImageFile: dialogState.localImageFile,
        infoFile: dialogState.infoFile,
      });
    } catch (error) {
      console.error(error);
      setImportLoadStatus(null);
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
        void updateImportLoadStatus(text.importStatus.preparingImport);
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            await updateImportLoadStatus(text.importStatus.readingChart);
            await updateImportLoadStatus(text.importStatus.parsingChart);
            const parsedLevel = await handleLevelImport(e.target?.result as string);
            const nextBpmChanges = parsedLevel.bpmChanges.length > 0 ? parsedLevel.bpmChanges : getDefaultBpmChanges();
            const firstBpm = nextBpmChanges[0]?.bpm || 120;
            const chartMetadata = getChartMetadataFromFileName(file.name);

            setInitialChartFileName(file.name);
            setInitialProjectData(createAudioLessImportProjectData({
              sourceName: file.name,
              chartMetadata,
              firstBpm,
              notes: parsedLevel.notes,
            }));
            await updateImportLoadStatus(text.importStatus.openingEditor);
            setView({page: 'editor', mode: 'import'});
          } catch (error) {
            console.error(error);
            setImportLoadStatus(null);
          }
        };
        reader.onerror = () => {
          setImportLoadStatus(null);
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

  const canConfirmZipImport = Boolean(zipImportDialog && (zipImportDialog.canImport || zipImportDialog.localChartFile));
  const zipImportDialogMessages = zipImportDialog
    ? zipImportDialog.messages.filter(message => (
        !(zipImportDialog.localChartFile && message === text.importDialog.missingChartFile)
        && !(zipImportDialog.localAudioFile && message === text.importDialog.missingAudioFile)
      ))
    : [];

  return (
    <>
      {importLoadStatus && <ImportLoadingOverlay status={importLoadStatus} />}
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
              {importLoadStatus?.message || text.app.loadingEditor}
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
            onImportLoadStatusChange={setImportLoadStatus}
          />
        </Suspense>
      )}
      {zipImportDialog && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 font-sans text-neutral-50 ${isBackdropBlurDisabled ? 'bg-black/75' : 'bg-black/60 backdrop-blur-md'} ${isAnimationDisabled ? 'app-animations-disabled' : ''}`}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="zip-import-title"
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl shadow-black/50"
          >
            <div className="border-b border-neutral-800 px-6 py-5">
              <h2 id="zip-import-title" className="text-xl font-bold text-white">
                {text.importDialog.title}
              </h2>
              <p className="mt-1 text-sm text-neutral-400">
                {zipImportDialog.sourceFile.name}
              </p>
            </div>

            <div className="grid gap-4 overflow-y-auto p-6">
              {zipImportDialogMessages.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100">
                  {zipImportDialogMessages.map(message => (
                    <p key={message}>{message}</p>
                  ))}
                </div>
              )}

              {zipImportDialog.chartFiles.length !== 1 && (
                <ZipImportResolverSection
                  title={text.importDialog.chartFile}
                  isRequired
                  Icon={FileText}
                  bundledFiles={zipImportDialog.chartFiles}
                  selectedId={zipImportDialog.selectedChartId}
                  localFile={zipImportDialog.localChartFile}
                  accept=".txt,text/plain"
                  onSelectedIdChange={(selectedChartId) => setZipImportDialog(current => current ? {
                    ...current,
                    selectedChartId,
                  } : current)}
                  onLocalFileChange={(localChartFile) => setZipImportDialog(current => current ? {
                    ...current,
                    localChartFile,
                    canImport: current.chartFiles.length > 0 || Boolean(localChartFile),
                  } : current)}
                />
              )}

              {zipImportDialog.audioFiles.length !== 1 && (
                <ZipImportResolverSection
                  title={text.importDialog.audioFile}
                  isRequired
                  Icon={Music}
                  bundledFiles={zipImportDialog.audioFiles}
                  selectedId={zipImportDialog.selectedAudioId}
                  localFile={zipImportDialog.localAudioFile}
                  accept="audio/*"
                  onSelectedIdChange={(selectedAudioId) => setZipImportDialog(current => current ? {
                    ...current,
                    selectedAudioId,
                  } : current)}
                  onLocalFileChange={(localAudioFile) => setZipImportDialog(current => current ? {
                    ...current,
                    localAudioFile,
                  } : current)}
                />
              )}

              {zipImportDialog.imageFiles.length > 1 && (
                <ZipImportResolverSection
                  title={text.importDialog.illustrationFile}
                  Icon={Image}
                  bundledFiles={zipImportDialog.imageFiles}
                  selectedId={zipImportDialog.selectedImageId}
                  localFile={zipImportDialog.localImageFile}
                  accept="image/*"
                  onSelectedIdChange={(selectedImageId) => setZipImportDialog(current => current ? {
                    ...current,
                    selectedImageId,
                  } : current)}
                  onLocalFileChange={(localImageFile) => setZipImportDialog(current => current ? {
                    ...current,
                    localImageFile,
                  } : current)}
                />
              )}
            </div>

            <div className="flex shrink-0 justify-end gap-3 border-t border-neutral-800 bg-neutral-900 px-6 py-4">
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
                disabled={!canConfirmZipImport}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
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
