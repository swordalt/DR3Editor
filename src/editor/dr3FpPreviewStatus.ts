export type Dr3FpPreviewStage = 'idle' | 'exporting' | 'launching' | 'receiver' | 'uploading' | 'complete' | 'failed';

export type Dr3FpPreviewFailureKind = 'export' | 'launch' | 'receiver' | 'upload';

export interface Dr3FpPreviewStatus {
  stage: Dr3FpPreviewStage;
  failureKind?: Dr3FpPreviewFailureKind;
  title: string;
  message: string;
  detail?: string;
}

export class Dr3FpPreviewError extends Error {
  kind: Dr3FpPreviewFailureKind;
  detail?: string;

  constructor(kind: Dr3FpPreviewFailureKind, message: string, detail?: string) {
    super(message);
    this.name = 'Dr3FpPreviewError';
    this.kind = kind;
    this.detail = detail;
  }
}

export const DR3FP_PREVIEW_STATUS: Record<Exclude<Dr3FpPreviewStage, 'failed'>, Dr3FpPreviewStatus> = {
  idle: {
    stage: 'idle',
    title: 'Ready to preview in DR3FP',
    message: 'Start DR3FP preview from the Preview menu.',
  },
  exporting: {
    stage: 'exporting',
    title: 'Building preview bundle',
    message: 'Packaging the current chart and audio for DR3FP.',
  },
  launching: {
    stage: 'launching',
    title: 'Opening DR3FP',
    message: 'Sending the preview session to the DR3FP app.',
  },
  receiver: {
    stage: 'receiver',
    title: 'Waiting for DR3FP',
    message: 'DR3FP is starting its local preview receiver.',
  },
  uploading: {
    stage: 'uploading',
    title: 'Transferring chart',
    message: 'Uploading the preview bundle to the DR3FP receiver.',
  },
  complete: {
    stage: 'complete',
    title: 'Preview sent',
    message: 'DR3FP accepted the chart bundle.',
  },
};

export const createDr3FpPreviewFailureStatus = (
  kind: Dr3FpPreviewFailureKind,
  message: string,
  detail?: string,
): Dr3FpPreviewStatus => ({
  stage: 'failed',
  failureKind: kind,
  title: kind === 'export'
    ? 'Preview bundle could not be built'
    : kind === 'launch'
      ? 'DR3FP could not be opened'
      : kind === 'receiver'
        ? 'DR3FP did not become ready'
        : 'Preview upload failed',
  message,
  detail,
});
