import type { BpmChange, Note, ProjectData, SpeedChange } from '../types/editorTypes';
import type { ChartProjectFileDetails } from '../editor/chartProjectFiles';

interface ChartProjectFilesPayload {
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

interface PendingRequest {
  resolve: (details: ChartProjectFileDetails) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<number, PendingRequest>();

const createWorker = () => {
  const nextWorker = new Worker(new URL('../workers/chartProjectFilesWorker.ts', import.meta.url), {
    type: 'module',
  });

  nextWorker.onmessage = (event: MessageEvent<ChartProjectFilesResponse>) => {
    const response = event.data;
    const pendingRequest = pendingRequests.get(response.requestId);

    if (!pendingRequest) {
      return;
    }

    pendingRequests.delete(response.requestId);

    if (response.ok) {
      pendingRequest.resolve(response.details || {});
      return;
    }

    pendingRequest.reject(new Error(response.error || 'File detail calculation failed'));
  };

  nextWorker.onerror = (event) => {
    const error = new Error(event.message || 'File detail calculation failed');

    for (const pendingRequest of pendingRequests.values()) {
      pendingRequest.reject(error);
    }

    pendingRequests.clear();
    nextWorker.terminate();
    if (worker === nextWorker) {
      worker = null;
    }
  };

  return nextWorker;
};

const getWorker = () => {
  if (!worker) {
    worker = createWorker();
  }

  return worker;
};

export const calculateChartProjectFileDetailsInWorker = (payload: ChartProjectFilesPayload) => (
  new Promise<ChartProjectFileDetails>((resolve, reject) => {
    const requestId = nextRequestId;
    nextRequestId += 1;

    pendingRequests.set(requestId, { resolve, reject });

    try {
      getWorker().postMessage({
        requestId,
        ...payload,
      });
    } catch (err) {
      pendingRequests.delete(requestId);
      reject(err instanceof Error ? err : new Error('File detail calculation failed'));
    }
  })
);
