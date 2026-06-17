import { buildLevelText } from '../utils/levelFormat';
import { createZipBuffer } from '../utils/zipExport';
import type { ExportWorkerPayload, ExportWorkerRequest, ExportWorkerResponse } from '../types/exportTypes';
import type { BpmChange } from '../types/editorTypes';
import { getBpmChangeTimepos } from '../utils/editorUtils';

const getFileExtension = (file: File) => {
  const extension = file.name.split('.').pop();
  return extension && extension !== file.name ? extension : 'bin';
};

const getFirstBpm = (bpmChanges: BpmChange[], fallbackBpm: number | undefined) => {
  const firstChange = [...bpmChanges]
    .sort((a, b) => getBpmChangeTimepos(a) - getBpmChangeTimepos(b))[0];

  return firstChange?.bpm ?? fallbackBpm ?? 120;
};

const assertSafeZipFileName = (fileName: string) => {
  if (
    !fileName ||
    fileName.includes('/') ||
    fileName.includes('\\') ||
    fileName.includes('..') ||
    /^[a-zA-Z]:/.test(fileName)
  ) {
    throw new Error(`Unsafe preview file name: ${fileName || '(empty)'}`);
  }
};

const getOriginalFileName = (file: File) => {
  const fileName = file.name || `file.${getFileExtension(file)}`;
  assertSafeZipFileName(fileName);
  return fileName;
};

const createDr3FpEntries = ({
  projectData,
  bpmChanges,
  chartText,
  difficulty,
}: {
  projectData: ExportWorkerPayload['projectData'];
  bpmChanges: BpmChange[];
  chartText: string;
  difficulty: string;
}) => {
  const infoText = `${projectData.songName || ''}\n${projectData.songArtist || ''}\n${getFirstBpm(bpmChanges, projectData.bpm)}\n`;
  const audioFileName = `base.${getFileExtension(projectData.songFile!)}`;
  const illustrationFileName = projectData.songIllustration
    ? `base.${getFileExtension(projectData.songIllustration)}`
    : undefined;
  const entries = [
    {
      name: 'info.txt',
      data: infoText,
    },
    {
      name: `${difficulty}.txt`,
      data: chartText,
    },
    {
      name: audioFileName,
      data: projectData.songFile!,
    },
  ];

  if (projectData.songIllustration && illustrationFileName) {
    entries.push({
      name: illustrationFileName,
      data: projectData.songIllustration,
    });
  }

  return {
    entries,
    chartFileName: `${difficulty}.txt`,
    audioFileName,
    illustrationFileName,
  };
};

const createChartBundleManifest = ({
  projectData,
  bpmChanges,
  difficulty,
  chartFileName,
  audioFileName,
  illustrationFileName,
  files,
}: {
  projectData: ExportWorkerPayload['projectData'];
  bpmChanges: BpmChange[];
  difficulty: string;
  chartFileName: string;
  audioFileName: string;
  illustrationFileName?: string;
  files: string[];
}) => ({
  version: 1,
  keyword: projectData.songId || 'editor-preview',
  title: projectData.songName || 'Untitled Project',
  artist: projectData.songArtist || '',
  bpm: getFirstBpm(bpmChanges, projectData.bpm),
  diff: Number.parseInt(difficulty, 10) || 0,
  chart: chartFileName,
  audio: audioFileName,
  ...(illustrationFileName ? { illustration: illustrationFileName } : {}),
  files,
});

const createExportZip = async (payload: ExportWorkerPayload) => {
  const { format, projectData, notes, bpmChanges, speedChanges, offset, chartFileName } = payload;

  if (!projectData.songFile) {
    throw new Error('Cannot export without a song file.');
  }

  const songId = projectData.songId || 'level';
  const difficulty = projectData.difficulty || '0';
  const chartText = buildLevelText({
    projectData,
    notes,
    bpmChanges,
    speedChanges,
    offset,
  });

  if (format === 'raw') {
    const rawChartFileName = chartFileName || `${songId}.${difficulty}.txt`;
    assertSafeZipFileName(rawChartFileName);
    const audioFileName = getOriginalFileName(projectData.songFile);
    const illustrationFileName = projectData.songIllustration
      ? getOriginalFileName(projectData.songIllustration)
      : undefined;
    const files = [rawChartFileName, audioFileName];

    const entries = [
      {
        name: rawChartFileName,
        data: chartText,
      },
      {
        name: audioFileName,
        data: projectData.songFile,
      },
    ];

    if (projectData.songIllustration && illustrationFileName) {
      files.push(illustrationFileName);
      entries.push({
        name: illustrationFileName,
        data: projectData.songIllustration,
      });
    }

    entries.push({
      name: 'manifest.json',
      data: `${JSON.stringify(createChartBundleManifest({
        projectData,
        bpmChanges,
        difficulty,
        chartFileName: rawChartFileName,
        audioFileName,
        illustrationFileName,
        files,
      }), null, 2)}\n`,
    });

    return {
      zipBuffer: await createZipBuffer(entries),
      suggestedName: `${songId}_tier${difficulty}_raw.zip`,
    };
  }

  if (format === 'dr3-viewer') {
    const entries = [
      {
        name: `${songId}.${difficulty}.txt`,
        data: chartText,
      },
      {
        name: `${songId}.${getFileExtension(projectData.songFile)}`,
        data: projectData.songFile,
      },
    ];

    if (projectData.songIllustration) {
      entries.push({
        name: `${songId}.${getFileExtension(projectData.songIllustration)}`,
        data: projectData.songIllustration,
      });
    }

    return {
      zipBuffer: await createZipBuffer(entries),
      suggestedName: `${songId}_tier${difficulty}.zip`,
    };
  }

  if (format === 'dr3-fp-preview') {
    const dr3FpBundle = createDr3FpEntries({
      projectData,
      bpmChanges,
      chartText,
      difficulty,
    });
    const files = ['info.txt', dr3FpBundle.chartFileName, dr3FpBundle.audioFileName];

    if (dr3FpBundle.illustrationFileName) {
      files.push(dr3FpBundle.illustrationFileName);
    }

    files.forEach(assertSafeZipFileName);

    const entries = [
      ...dr3FpBundle.entries,
      {
        name: 'manifest.json',
        data: `${JSON.stringify(createChartBundleManifest({
          projectData,
          bpmChanges,
          difficulty,
          chartFileName: dr3FpBundle.chartFileName,
          audioFileName: dr3FpBundle.audioFileName,
          illustrationFileName: dr3FpBundle.illustrationFileName,
          files,
        }), null, 2)}\n`,
      },
    ];

    return {
      zipBuffer: await createZipBuffer(entries),
      suggestedName: `${songId}.preview.zip`,
    };
  }

  const { entries } = createDr3FpEntries({
    projectData,
    bpmChanges,
    chartText,
    difficulty,
  });

  return {
    zipBuffer: await createZipBuffer(entries),
    suggestedName: `${songId}_tier${difficulty}.zip`,
  };
};

self.onmessage = async (event: MessageEvent<ExportWorkerRequest>) => {
  const request = event.data;

  if (request.type === 'warmup') {
    return;
  }

  try {
    const result = await createExportZip(request.payload);
    const response: ExportWorkerResponse = {
      requestId: request.requestId,
      ok: true,
      ...result,
    };

    self.postMessage(response, [result.zipBuffer]);
  } catch (err) {
    const response: ExportWorkerResponse = {
      requestId: request.requestId,
      ok: false,
      error: err instanceof Error ? err.message : 'Export worker failed',
    };

    self.postMessage(response);
  }
};
