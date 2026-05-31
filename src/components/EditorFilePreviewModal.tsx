import { Pause, Play, X } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { ChartProjectFileEntry } from '../editor/chartProjectFiles';
import { formatTranslation, translations } from '../lang';
import {
  dialogHeaderClassName,
  dialogSurfaceClassName,
  getDialogMotionProps,
  getOverlayClassName,
  getOverlayMotionProps,
} from './editorDesign';

interface EditorFilePreviewModalProps {
  file: ChartProjectFileEntry | null;
  textContent: string;
  mediaUrl: string;
  isBackdropBlurDisabled: boolean;
  isAnimationDisabled: boolean;
  onSaveChartText: (text: string) => { ok: true } | { ok: false; lineNumber: number; message: string };
  onClose: () => void;
}

export default function EditorFilePreviewModal({
  file,
  textContent,
  mediaUrl,
  isBackdropBlurDisabled,
  isAnimationDisabled,
  onSaveChartText,
  onClose,
}: EditorFilePreviewModalProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const text = translations;
  const chartTextAreaRef = useRef<HTMLTextAreaElement>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [draftTextContent, setDraftTextContent] = useState(textContent);
  const [chartTextError, setChartTextError] = useState<{ lineNumber: number; message: string } | null>(null);

  useEffect(() => {
    setIsAudioPlaying(false);
    setAudioCurrentTime(0);
    setAudioDuration(0);
  }, [file, mediaUrl]);

  useEffect(() => {
    setDraftTextContent(textContent);
    setChartTextError(null);
  }, [file, textContent]);

  if (!file) return null;

  const isChartPreview = file.id === 'chart';
  const isInfoPreview = file.id === 'info';
  const isAudioPreview = file.id === 'audio';
  const isImagePreview = file.id === 'illustration';
  const hasChartTextChanges = isChartPreview && draftTextContent !== textContent;
  const getLineNumbers = (content: string) => (
    Array.from({ length: Math.max(1, content.split('\n').length) }, (_, index) => index + 1).join('\n')
  );
  const formatAudioTime = (time: number) => {
    if (!Number.isFinite(time) || time <= 0) return '0:00';

    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };
  const toggleAudioPlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  };
  const handleAudioSeek = (event: ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    const nextTime = Number(event.target.value);

    setAudioCurrentTime(nextTime);
    if (audio && Number.isFinite(nextTime)) {
      audio.currentTime = nextTime;
    }
  };
  const focusChartLine = (lineNumber: number) => {
    const textArea = chartTextAreaRef.current;
    if (!textArea) return;

    const lines = draftTextContent.split('\n');
    const lineStart = lines.slice(0, Math.max(0, lineNumber - 1)).join('\n').length + (lineNumber > 1 ? 1 : 0);
    const lineEnd = lineStart + (lines[lineNumber - 1]?.length ?? 0);

    textArea.focus();
    textArea.setSelectionRange(lineStart, lineEnd);
    const lineHeight = 18;
    textArea.scrollTop = Math.max(0, (lineNumber - 4) * lineHeight);
  };
  const handleDiscardChartChanges = () => {
    setDraftTextContent(textContent);
    setChartTextError(null);
  };
  const handleSaveChartChanges = () => {
    const result = onSaveChartText(draftTextContent);

    if (!result.ok) {
      setChartTextError({
        lineNumber: result.lineNumber,
        message: result.message,
      });
      window.requestAnimationFrame(() => focusChartLine(result.lineNumber));
      return;
    }

    setChartTextError(null);
  };

  return (
    <AnimatePresence>
      {file && (
        <motion.div
          className={getOverlayClassName(isBackdropBlurDisabled, isAnimationDisabled, 'z-[70]')}
          role="dialog"
          aria-modal="true"
          aria-labelledby="file-preview-title"
          {...getOverlayMotionProps(isAnimationDisabled)}
          onMouseDown={onClose}
        >
          <motion.div
            className={`max-h-[85vh] w-full max-w-3xl ${dialogSurfaceClassName}`}
            {...getDialogMotionProps(isAnimationDisabled)}
            onMouseDown={(event) => event.stopPropagation()}
          >
        <div className={`${dialogHeaderClassName} flex shrink-0 items-start justify-between gap-4`}>
          <div className="min-w-0">
            <h2 id="file-preview-title" className="truncate text-sm font-semibold text-white">
              {file.label}
            </h2>
            <div className="truncate text-xs text-neutral-500" title={file.name}>
              {file.name}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
            aria-label={text.filePreview.closeFilePreview}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative min-h-0 flex-1 overflow-auto p-4">
          {isChartPreview && (
            <div className="relative">
              <div className={`grid min-h-96 grid-cols-[3rem_minmax(0,1fr)] overflow-hidden rounded-lg border bg-neutral-900/70 font-mono text-xs leading-relaxed transition-colors ${
                chartTextError ? 'border-red-500' : 'border-neutral-800'
              }`}>
                <pre className="select-none overflow-hidden border-r border-neutral-800 bg-neutral-950/70 p-3 text-right text-neutral-600">
                  {getLineNumbers(draftTextContent)}
                </pre>
                <textarea
                  ref={chartTextAreaRef}
                  value={draftTextContent}
                  spellCheck={false}
                  onChange={(event) => {
                    setDraftTextContent(event.target.value);
                    setChartTextError(null);
                  }}
                  className="min-h-96 w-full resize-none overflow-auto bg-transparent p-3 text-neutral-200 outline-none transition-colors focus:bg-neutral-900/40"
                />
              </div>
              {chartTextError && (
                <div className="mt-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {formatTranslation(text.filePreview.lineError, {
                    lineNumber: chartTextError.lineNumber,
                    message: chartTextError.message,
                  })}
                </div>
              )}
              {hasChartTextChanges && (
                <div className="sticky bottom-0 mt-3 flex items-center justify-between gap-3 rounded-lg border border-neutral-700 bg-neutral-950/95 p-3 shadow-xl">
                  <span className="min-w-0 text-xs text-neutral-400">{text.filePreview.unsavedChartEdits}</span>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={handleDiscardChartChanges}
                      className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
                    >
                      {text.common.discard}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveChartChanges}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-500"
                    >
                      {text.common.save}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isInfoPreview && (
            <div className="grid min-h-72 grid-cols-[3rem_minmax(0,1fr)] overflow-auto rounded-lg border border-neutral-800 bg-neutral-900/70 font-mono text-xs leading-relaxed">
              <pre className="select-none border-r border-neutral-800 bg-neutral-950/70 p-3 text-right text-neutral-600">
                {getLineNumbers(textContent)}
              </pre>
              <pre className="whitespace-pre-wrap p-3 text-neutral-200">
                {textContent}
              </pre>
            </div>
          )}

          {isAudioPreview && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-4">
              <audio
                ref={audioRef}
                src={mediaUrl}
                preload="metadata"
                onLoadedMetadata={(event) => setAudioDuration(event.currentTarget.duration || 0)}
                onTimeUpdate={(event) => setAudioCurrentTime(event.currentTarget.currentTime)}
                onPlay={() => setIsAudioPlaying(true)}
                onPause={() => setIsAudioPlaying(false)}
                onEnded={() => setIsAudioPlaying(false)}
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleAudioPlayback}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                    isAudioPlaying
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20'
                      : 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-emerald-500/50 hover:text-emerald-300'
                  }`}
                  aria-label={isAudioPlaying ? text.filePreview.pauseAudioPreview : text.filePreview.playAudioPreview}
                >
                  {isAudioPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(audioDuration, audioCurrentTime, 0.01)}
                    step={0.01}
                    value={audioCurrentTime}
                    onChange={handleAudioSeek}
                    className="h-1.5 w-full cursor-pointer accent-emerald-400"
                    aria-label={text.filePreview.audioPreviewPosition}
                  />
                  <div className="mt-2 flex justify-between font-mono text-[11px] text-neutral-500">
                    <span>{formatAudioTime(audioCurrentTime)}</span>
                    <span>{formatAudioTime(audioDuration)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {isImagePreview && (
            <div className="flex min-h-72 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900/70 p-3">
              <img src={mediaUrl} alt={file.label} className="max-h-[60vh] max-w-full object-contain" />
            </div>
          )}
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
