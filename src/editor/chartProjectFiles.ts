import { FileText, Image, Info, Music } from 'lucide-react';
import type { BpmChange, Note, ProjectData, SpeedChange } from '../types/editorTypes';
import { getBpmChangeTimepos } from '../utils/editorUtils';
import { buildLevelText } from '../utils/levelFormat';
import { formatByteSize, formatFileSize, getFileExtension } from './editorFileHelpers';

export const buildChartProjectFiles = ({
  projectData,
  notes,
  bpmChanges,
  speedChanges,
  offset,
}: {
  projectData: ProjectData | null;
  notes: Note[];
  bpmChanges: BpmChange[];
  speedChanges: SpeedChange[];
  offset: string | number;
}) => {
  if (!projectData) return [];

  const songId = projectData.songId || 'level';
  const difficulty = projectData.difficulty || '0';
  const chartText = buildLevelText({
    projectData,
    notes,
    bpmChanges,
    speedChanges,
    offset,
  });
  const firstBpm = [...bpmChanges]
    .sort((a, b) => getBpmChangeTimepos(a) - getBpmChangeTimepos(b))[0]?.bpm ?? projectData.bpm ?? 120;
  const infoText = `${projectData.songName || ''}\n${projectData.songArtist || ''}\n${firstBpm}\n`;
  const textEncoder = new TextEncoder();
  const files = [
    {
      label: 'Chart File',
      name: `${songId}.${difficulty}.txt`,
      detail: formatByteSize(textEncoder.encode(chartText).byteLength),
      Icon: FileText,
    },
    {
      label: 'Info File',
      name: 'info.txt',
      detail: formatByteSize(textEncoder.encode(infoText).byteLength),
      Icon: Info,
    },
  ];

  if (projectData.songFile) {
    files.push({
      label: 'Audio',
      name: projectData.songFile.name || `${songId}.${getFileExtension(projectData.songFile)}`,
      detail: formatFileSize(projectData.songFile),
      Icon: Music,
    });
  }

  if (projectData.songIllustration) {
    files.push({
      label: 'Illustration',
      name: projectData.songIllustration.name || `${songId}.${getFileExtension(projectData.songIllustration)}`,
      detail: formatFileSize(projectData.songIllustration),
      Icon: Image,
    });
  }

  return files;
};
