import { FileText, Image, Info, Music } from 'lucide-react';
import type { ComponentType } from 'react';
import type { ProjectData } from '../types/editorTypes';
import { formatFileSize, getFileExtension } from './editorFileHelpers';

export type ChartProjectFileId = 'chart' | 'info' | 'audio' | 'illustration';

export interface ChartProjectFileEntry {
  id: ChartProjectFileId;
  label: string;
  name: string;
  detail: string;
  Icon: ComponentType<{ className?: string }>;
}

export type ChartProjectFileDetails = Partial<Record<ChartProjectFileId, string>>;

export const buildChartProjectFiles = ({
  projectData,
  chartFileName,
  details = {},
}: {
  projectData: ProjectData | null;
  chartFileName?: string | null;
  details?: ChartProjectFileDetails;
}): ChartProjectFileEntry[] => {
  if (!projectData && !chartFileName) return [];

  const songId = projectData?.songId || 'level';
  const difficulty = projectData?.difficulty || '0';
  const files: ChartProjectFileEntry[] = [
    {
      id: 'chart',
      label: 'Chart File',
      name: chartFileName || `${songId}.${difficulty}.txt`,
      detail: details.chart || '',
      Icon: FileText,
    },
  ];

  if (projectData) {
    files.push({
      id: 'info',
      label: 'Info File',
      name: 'info.txt',
      detail: '',
      Icon: Info,
    });
  }

  if (projectData?.songFile) {
    files.push({
      id: 'audio',
      label: 'Audio',
      name: projectData.songFile.name || `${songId}.${getFileExtension(projectData.songFile)}`,
      detail: formatFileSize(projectData.songFile),
      Icon: Music,
    });
  }

  if (projectData?.songIllustration) {
    files.push({
      id: 'illustration',
      label: 'Illustration',
      name: projectData.songIllustration.name || `${songId}.${getFileExtension(projectData.songIllustration)}`,
      detail: formatFileSize(projectData.songIllustration),
      Icon: Image,
    });
  }

  return files;
};
