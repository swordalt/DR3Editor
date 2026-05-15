import type { BpmChange, Note, ProjectData, SpeedChange } from '../types/editorTypes';
import type { ChartProjectFileDetails } from '../editor/chartProjectFiles';
import { buildLevelText } from '../utils/levelFormat';
import { formatByteSize } from '../editor/editorFileHelpers';

interface ChartProjectFilesRequest {
  requestId: number;
  projectData: ProjectData | null;
  notes: Note[];
  bpmChanges: BpmChange[];
  speedChanges: SpeedChange[];
  offset: string | number;
}

interface ChartProjectFilesResponse {
  requestId: number;
  ok: boolean;
  details?: ChartProjectFileDetails;
  error?: string;
}

self.onmessage = (event: MessageEvent<ChartProjectFilesRequest>) => {
  const { requestId, projectData, notes, bpmChanges, speedChanges, offset } = event.data;

  try {
    const textEncoder = new TextEncoder();
    const chartText = buildLevelText({
      projectData,
      notes,
      bpmChanges,
      speedChanges,
      offset,
    });
    const details: ChartProjectFileDetails = {
      chart: formatByteSize(textEncoder.encode(chartText).byteLength),
    };

    const response: ChartProjectFilesResponse = {
      requestId,
      ok: true,
      details,
    };
    self.postMessage(response);
  } catch (err) {
    const response: ChartProjectFilesResponse = {
      requestId,
      ok: false,
      error: err instanceof Error ? err.message : 'File detail calculation failed',
    };
    self.postMessage(response);
  }
};
