import { translations } from '../lang';

export type Dr3FpPreviewStage = 'idle' | 'exporting' | 'launching' | 'receiver' | 'uploading' | 'complete' | 'failed';

export type Dr3FpPreviewFailureKind = 'export' | 'launch' | 'receiver' | 'upload';

export interface Dr3FpPreviewStatus {
  stage: Dr3FpPreviewStage;
  failureKind?: Dr3FpPreviewFailureKind;
  title: string;
  message: string;
  detail?: string;
}

export interface Dr3FpPreviewLogEntry {
  id: string;
  time: string;
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
    title: translations.dr3FpStatus.idle.title,
    message: translations.dr3FpStatus.idle.message,
  },
  exporting: {
    stage: 'exporting',
    title: translations.dr3FpStatus.exporting.title,
    message: translations.dr3FpStatus.exporting.message,
  },
  launching: {
    stage: 'launching',
    title: translations.dr3FpStatus.launching.title,
    message: translations.dr3FpStatus.launching.message,
  },
  receiver: {
    stage: 'receiver',
    title: translations.dr3FpStatus.receiver.title,
    message: translations.dr3FpStatus.receiver.message,
  },
  uploading: {
    stage: 'uploading',
    title: translations.dr3FpStatus.uploading.title,
    message: translations.dr3FpStatus.uploading.message,
  },
  complete: {
    stage: 'complete',
    title: translations.dr3FpStatus.complete.title,
    message: translations.dr3FpStatus.complete.message,
  },
};

export const createDr3FpPreviewFailureStatus = (
  kind: Dr3FpPreviewFailureKind,
  message: string,
  detail?: string,
): Dr3FpPreviewStatus => ({
  stage: 'failed',
  failureKind: kind,
  title: translations.dr3FpStatus.failures[kind],
  message,
  detail,
});
