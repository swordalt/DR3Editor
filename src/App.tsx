import React, { Suspense, lazy, useRef, useState } from 'react';
import { CheckCircle2, FileText, Image, Music, Upload } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import LandingPage from './components/LandingPage';
import {
  dialogFooterClassName,
  dialogHeaderClassName,
  dialogSurfaceClassName,
  getDialogMotionProps,
  getOverlayClassName,
  getOverlayMotionProps,
} from './components/editorDesign';
import { loadEditorSettings } from './editor/editorSettings';
import { translations } from './lang';
import type { BpmChange, ImportLoadStatus, Note, ProjectData, SpeedChange, ViewState } from './types/editorTypes';
import { convertAudioFileToOgg, isOggAudioFile } from './utils/audioOggConversion';

const Editor = lazy(() => import('./Editor'));

const DEFAULT_BPM_CHANGES: BpmChange[] = [{ timepos: 0, bpm: 180, timeSignature: '4/4' }];
const DEFAULT_SPEED_CHANGES: SpeedChange[] = [{ timepos: 0, speedChange: 1 }];
const SILENT_IMPORT_AUDIO_SAMPLE_RATE = 8000;
const SILENT_IMPORT_AUDIO_MARGIN_SECONDS = 5;
const SILENT_IMPORT_AUDIO_MIN_SECONDS = 10;
const TUTORIAL_MEASURE_COUNT = 20;
const EXAMPLES = [
  {
    id: 'eviternity',
    label: "Eviternity - Tier21 [Official]",
    projectUrl: 'https://raw.githubusercontent.com/swordalt/dancerail3-editor/refs/heads/assets/exampleCharts/eviternity_tier21_raw.zip',
    fileName: 'eviternity_tier21_raw.zip',
    difficulty: '21',
  },
  {
    id: 'raidboss',
    label: 'カタストロフィック・ラヴ - Tier17 [Official]',
    projectUrl: 'https://raw.githubusercontent.com/swordalt/dancerail3-editor/refs/heads/assets/exampleCharts/raidboss_tier17_raw.zip',
    fileName: 'raidboss_tier17_raw.zip',
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

const createSilentWavBlob = (duration: number, sampleCountMode: 'ceil' | 'floor' = 'ceil') => {
  const sampleCount = Math.max(
    1,
    sampleCountMode === 'floor'
      ? Math.floor(duration * SILENT_IMPORT_AUDIO_SAMPLE_RATE)
      : Math.ceil(duration * SILENT_IMPORT_AUDIO_SAMPLE_RATE),
  );
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

  return new Blob([buffer], { type: 'audio/wav' });
};

const getValidAudioDuration = (duration: number) => (
  Number.isFinite(duration) && duration > 0 ? duration : 0
);

const readAudioFileDuration = (file: File) => new Promise<number>((resolve) => {
  const audio = new Audio();
  const url = URL.createObjectURL(file);
  let isSettled = false;

  function settle(duration: number) {
    if (isSettled) return;

    isSettled = true;
    window.clearTimeout(timeoutId);
    audio.removeAttribute('src');
    audio.load();
    URL.revokeObjectURL(url);
    resolve(getValidAudioDuration(duration));
  }

  const timeoutId = window.setTimeout(() => settle(0), 10000);

  audio.preload = 'metadata';
  audio.onloadedmetadata = () => settle(audio.duration);
  audio.onerror = () => settle(0);
  audio.src = url;
});

const createTutorialProjectData = (): ProjectData => {
  const tutorialBpm = DEFAULT_BPM_CHANGES[0].bpm;
  const tutorialBeatsPerMeasure = parseInt(DEFAULT_BPM_CHANGES[0].timeSignature.split('/')[0], 10) || 4;
  const tutorialDurationSeconds = TUTORIAL_MEASURE_COUNT * tutorialBeatsPerMeasure * (60 / tutorialBpm);
  const audioBlob = createSilentWavBlob(tutorialDurationSeconds, 'floor');
  const songFile = new File([audioBlob], 'tutorial.wav', { type: 'audio/wav' });

  return {
    chartFormat: 'Official',
    songId: 'Tutorial',
    songName: 'Tutorial',
    songArtist: 'Artist',
    songBpm: tutorialBpm.toString(),
    difficulty: '0',
    songFile,
    songIllustration: null,
    bpm: tutorialBpm,
    audioUrl: URL.createObjectURL(audioBlob),
    audioDuration: tutorialDurationSeconds,
  };
};

interface ChartBundleManifest {
  keyword?: unknown;
  title?: unknown;
  artist?: unknown;
  bpm?: unknown;
  diff?: unknown;
  chart?: unknown;
  audio?: unknown;
  illustration?: unknown;
}

const getManifestString = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
);

const getManifestNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const getManifestDifficulty = (manifest: ChartBundleManifest | null) => {
  if (!manifest) return '';

  if (typeof manifest.diff === 'number' && Number.isFinite(manifest.diff)) {
    return Math.max(0, Math.trunc(manifest.diff)).toString();
  }

  return getManifestString(manifest.diff);
};

const createAudioLessImportProjectData = ({
  sourceName,
  chartMetadata,
  difficulty,
  firstBpm,
  manifest,
  notes,
}: {
  sourceName: string;
  chartMetadata: ReturnType<typeof getChartMetadataFromFileName>;
  difficulty?: string;
  firstBpm: number;
  manifest?: ChartBundleManifest | null;
  notes: Note[];
}): ProjectData => {
  const sourceBaseName = getFileBaseName(sourceName);
  const manifestKeyword = getManifestString(manifest?.keyword);
  const songId = manifestKeyword
    ? sanitizeSongId(manifestKeyword)
    : sanitizeSongId(chartMetadata?.songId || sourceBaseName);
  const bpm = getManifestNumber(manifest?.bpm) ?? firstBpm;
  const inferredDifficulty = getManifestDifficulty(manifest ?? null) || difficulty || chartMetadata?.difficulty || '0';
  const audioDuration = getSilentImportAudioDuration(notes);

  return {
    chartFormat: 'Official',
    songId,
    songName: getManifestString(manifest?.title) || songId,
    songArtist: getManifestString(manifest?.artist),
    songBpm: bpm.toString(),
    difficulty: inferredDifficulty,
    songFile: null,
    songIllustration: null,
    bpm,
    audioUrl: URL.createObjectURL(createSilentWavBlob(audioDuration)),
    audioDuration,
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

function ImportLoadingOverlay({
  status,
  isBackdropBlurDisabled,
  isAnimationDisabled,
}: {
  status: ImportLoadStatus;
  isBackdropBlurDisabled: boolean;
  isAnimationDisabled: boolean;
}) {
  return (
    <motion.div
      className={`${getOverlayClassName(isBackdropBlurDisabled, isAnimationDisabled, 'z-[60]')} text-neutral-100`}
      {...getOverlayMotionProps(isAnimationDisabled)}
    >
      <motion.div className={`w-full max-w-sm p-5 ${dialogSurfaceClassName}`} {...getDialogMotionProps(isAnimationDisabled)}>
        <div className="mb-3 h-1 overflow-hidden rounded-full bg-neutral-800">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-indigo-500" />
        </div>
        <div className="text-sm font-semibold text-white">{status.title}</div>
        <div className="mt-1 text-sm text-neutral-400">{status.message}</div>
      </motion.div>
    </motion.div>
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
  manifest: ChartBundleManifest | null;
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

const parseChartBundleManifest = (manifestText: string): ChartBundleManifest | null => {
  try {
    const parsed = JSON.parse(manifestText) as unknown;

    return parsed && typeof parsed === 'object'
      ? parsed as ChartBundleManifest
      : null;
  } catch (error) {
    console.warn('Unable to parse chart bundle manifest.', error);
    return null;
  }
};

const findManifestFileEntry = (files: ZipImportEntry[], manifestPath: unknown) => {
  const requestedPath = getManifestString(manifestPath).replace(/\\/g, '/').toLowerCase();
  if (!requestedPath) return null;

  const requestedName = requestedPath.split('/').pop() || requestedPath;

  return files.find(file => file.id.replace(/\\/g, '/').toLowerCase() === requestedPath)
    ?? files.find(file => file.name.toLowerCase() === requestedName)
    ?? null;
};

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

  const handleStartTutorial = () => {
    resetEditorState();
    setInitialProjectData(createTutorialProjectData());
    setInitialChartFileName('tutorial.txt');
    setView({ page: 'editor', isTutorial: true });
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
    const manifestFile = zipFiles.find(({ name }) => name.toLowerCase() === 'manifest.json') ?? null;
    const manifest = manifestFile
      ? parseChartBundleManifest(await manifestFile.entry.async('text') as string)
      : null;

    return {
      chartFiles: textFiles.filter(({ name }) => name.toLowerCase() !== 'info.txt'),
      audioFiles,
      imageFiles,
      infoFile,
      manifest,
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
    manifest,
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
    manifest: ChartBundleManifest | null;
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
      const sourceAudioFile = resolvedAudioFile ?? new File(
        [audioBlob!],
        audioFileEntry!.name,
        { type: getMimeType(audioFileEntry!.extension) },
      );
      let wasAudioConvertedToOgg = false;
      let audioFile = sourceAudioFile;

      if (!isOggAudioFile(sourceAudioFile)) {
        try {
          await updateImportLoadStatus(text.importStatus.convertingAudio);
          audioFile = await convertAudioFileToOgg(sourceAudioFile);
          wasAudioConvertedToOgg = true;
        } catch (error) {
          console.warn(text.editor.audioConversionFailedLog, error);
          throw new Error(text.editor.audioConversionFailedAlert);
        }
      }
      const audioDuration = await readAudioFileDuration(audioFile);
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
      const manifestKeyword = getManifestString(manifest?.keyword);
      const manifestTitle = getManifestString(manifest?.title);
      const manifestArtist = getManifestString(manifest?.artist);
      const manifestDifficulty = getManifestDifficulty(manifest);
      const songId = manifestKeyword
        ? sanitizeSongId(manifestKeyword)
        : chartMetadata?.songId || (audioBaseName.toLowerCase() === 'base' ? zipBaseName : audioBaseName);
      const bpm = getManifestNumber(manifest?.bpm) ?? (parseFloat(infoBpm) || firstBpm);

      setInitialProjectData({
        chartFormat: 'Official',
        songId,
        songName: manifestTitle || infoTitle || songId,
        songArtist: manifestArtist || infoArtist,
        songBpm: bpm.toString(),
        difficulty: manifestDifficulty || difficulty || chartMetadata?.difficulty || inferredDifficulty || '0',
        songFile: audioFile,
        songIllustration: imageFile,
        bpm,
        audioUrl: URL.createObjectURL(audioFile),
        audioDuration,
        audioConvertedToOgg: wasAudioConvertedToOgg,
      });
    } else {
      setInitialProjectData(createAudioLessImportProjectData({
        sourceName: chartFileName,
        chartMetadata,
        difficulty: difficulty || inferredDifficulty || '0',
        firstBpm,
        manifest,
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
      const { chartFiles, audioFiles, imageFiles, infoFile, manifest } = await getZipImportEntries(file);
      const manifestChartFile = findManifestFileEntry(chartFiles, manifest?.chart);
      const manifestAudioFile = findManifestFileEntry(audioFiles, manifest?.audio);
      const manifestImageFile = findManifestFileEntry(imageFiles, manifest?.illustration);
      const missingMessages = [
        ...(chartFiles.length === 0 ? [text.importDialog.missingChartFile] : []),
        ...(audioFiles.length === 0 ? [text.importDialog.missingAudioFile] : []),
      ];
      const needsSelection = (chartFiles.length > 1 && !manifestChartFile)
        || (audioFiles.length > 1 && !manifestAudioFile)
        || (imageFiles.length > 1 && !manifestImageFile);

      if (showImportNotice && (missingMessages.length > 0 || needsSelection)) {
        setZipImportDialog({
          sourceFile: file,
          difficulty,
          chartFiles,
          audioFiles,
          imageFiles,
          infoFile,
          manifest,
          selectedChartId: manifestChartFile?.id ?? chartFiles[0]?.id ?? '',
          selectedAudioId: manifestAudioFile?.id ?? audioFiles[0]?.id ?? '',
          selectedImageId: manifestImageFile?.id ?? imageFiles[0]?.id ?? '',
          localChartFile: null,
          localAudioFile: null,
          localImageFile: null,
          messages: missingMessages,
          canImport: chartFiles.length > 0,
        });
        setImportLoadStatus(null);
        return;
      }

      const chartFile = manifestChartFile ?? chartFiles[0] ?? null;
      if (!chartFile) {
        throw new Error(text.importDialog.noChartFileInZip);
      }

      await importResolvedZip({
        sourceFile: file,
        difficulty,
        chartFile,
        localChartFile: null,
        audioFileEntry: manifestAudioFile ?? audioFiles[0] ?? null,
        localAudioFile: null,
        imageFileEntry: manifestImageFile ?? imageFiles[0] ?? null,
        localImageFile: null,
        infoFile,
        manifest,
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
          manifest: null,
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
        manifest: dialogState.manifest,
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
      {importLoadStatus && (
        <ImportLoadingOverlay
          status={importLoadStatus}
          isBackdropBlurDisabled={isBackdropBlurDisabled}
          isAnimationDisabled={isAnimationDisabled}
        />
      )}
      {view.page === 'landing' ? (
        <LandingPage
          fileInputRef={fileInputRef}
          onCreateProject={() => {
            resetEditorState();
            setView({ page: 'editor', mode: 'new' });
          }}
          onStartTutorial={handleStartTutorial}
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
            isTutorial={Boolean(view.isTutorial)}
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
      <AnimatePresence>
      {zipImportDialog && (
        <motion.div
          className={`${getOverlayClassName(isBackdropBlurDisabled, isAnimationDisabled)} font-sans text-neutral-50`}
          {...getOverlayMotionProps(isAnimationDisabled)}
          onMouseDown={() => setZipImportDialog(null)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="zip-import-title"
            className={`max-h-[90vh] w-full max-w-2xl ${dialogSurfaceClassName}`}
            {...getDialogMotionProps(isAnimationDisabled)}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={dialogHeaderClassName}>
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

            <div className={`${dialogFooterClassName} flex shrink-0 justify-end gap-3 px-6`}>
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
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </>
  );
}
