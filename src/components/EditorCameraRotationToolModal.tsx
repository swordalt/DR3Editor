import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Maximize2, Plus, RotateCcw, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { formatTranslation, translations } from '../lang';
import {
  dialogFooterClassName,
  dialogHeaderClassName,
  dialogSurfaceClassName,
  getDialogMotionProps,
  getOverlayClassName,
  getOverlayMotionProps,
} from './editorDesign';

export interface CameraRotationToolKeyframe {
  location: number;
  angle: number | 'native';
}

export interface CameraRotationToolRequest {
  keyframes: CameraRotationToolKeyframe[];
}

export interface CameraRotationToolResult {
  generatedNoteCount: number;
  intervalCount: number;
  message: string;
}

interface CameraRotationToolKeyframeDraft {
  id: string;
  location: string;
  angle: string;
}

interface EditorCameraRotationToolModalProps {
  isOpen: boolean;
  onClose: () => void;
  chartDurationTimepos: number;
  isBackdropBlurDisabled: boolean;
  isAnimationDisabled: boolean;
  getNativeAngleAtTimepos: (timepos: number) => number;
  onApply: (request: CameraRotationToolRequest) => CameraRotationToolResult;
}

const createKeyframeDraft = (location: number, angle: number | 'native'): CameraRotationToolKeyframeDraft => ({
  id: `camera-rotation-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  location: formatCameraRotationNumber(location),
  angle: angle === 'native' ? 'native' : formatCameraRotationNumber(angle),
});

function formatCameraRotationNumber(value: number, precision = 4) {
  const roundedValue = Number(value.toFixed(precision));
  return Object.is(roundedValue, -0) ? '0' : roundedValue.toString();
}

const parseAngleValue = (value: string): number | 'native' | null => {
  const normalizedValue = value.trim().toLowerCase();
  if (normalizedValue === 'n' || normalizedValue === 'native') {
    return 'native';
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const parseKeyframes = (
  keyframes: CameraRotationToolKeyframeDraft[],
  chartDurationTimepos: number,
) => {
  const parsedKeyframes = keyframes.map((keyframe) => ({
    location: Number(keyframe.location),
    angle: parseAngleValue(keyframe.angle),
  }));

  if (parsedKeyframes.some(keyframe => !Number.isFinite(keyframe.location) || keyframe.angle === null)) {
    return { keyframes: [], error: translations.cameraRotationTool.invalidKeyframe };
  }

  if (parsedKeyframes.length < 2) {
    return { keyframes: [], error: translations.cameraRotationTool.needTwoKeyframes };
  }

  const sortedKeyframes = [...parsedKeyframes].sort((a, b) => a.location - b.location);
  const hasOutOfRangeLocation = sortedKeyframes.some(keyframe => (
    keyframe.location < 0 || keyframe.location > chartDurationTimepos
  ));
  if (hasOutOfRangeLocation) {
    return { keyframes: [], error: translations.cameraRotationTool.locationOutOfRange };
  }

  const hasDuplicateLocation = sortedKeyframes.some((keyframe, index) => (
    index > 0 && Math.abs(keyframe.location - sortedKeyframes[index - 1].location) <= 0.000001
  ));
  if (hasDuplicateLocation) {
    return { keyframes: [], error: translations.cameraRotationTool.duplicateLocation };
  }

  const firstKeyframe = sortedKeyframes[0];
  const lastKeyframe = sortedKeyframes[sortedKeyframes.length - 1];
  if (
    Math.abs(firstKeyframe.location) > 0.000001
    || Math.abs(lastKeyframe.location - chartDurationTimepos) > 0.000001
  ) {
    return { keyframes: [], error: translations.cameraRotationTool.startEndRequired };
  }

  return { keyframes: sortedKeyframes as CameraRotationToolKeyframe[], error: '' };
};

export default function EditorCameraRotationToolModal({
  isOpen,
  onClose,
  chartDurationTimepos,
  isBackdropBlurDisabled,
  isAnimationDisabled,
  getNativeAngleAtTimepos,
  onApply,
}: EditorCameraRotationToolModalProps) {
  const text = translations.cameraRotationTool;
  const normalizedDuration = Math.max(0.001, chartDurationTimepos);
  const [keyframes, setKeyframes] = useState<CameraRotationToolKeyframeDraft[]>(() => [
    createKeyframeDraft(0, 0),
    createKeyframeDraft(normalizedDuration, 0),
  ]);
  const [xZoom, setXZoom] = useState(1);
  const [yZoom, setYZoom] = useState(1);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    setKeyframes(currentKeyframes => {
      if (currentKeyframes.length !== 2) {
        return currentKeyframes;
      }

      const firstLocation = Number(currentKeyframes[0]?.location);
      const secondLocation = Number(currentKeyframes[1]?.location);
      if (Math.abs(firstLocation) > 0.000001 || Math.abs(secondLocation - normalizedDuration) > 0.000001) {
        return currentKeyframes;
      }

      return [
        currentKeyframes[0],
        {
          ...currentKeyframes[1],
          location: formatCameraRotationNumber(normalizedDuration),
        },
      ];
    });
  }, [normalizedDuration]);

  useEffect(() => {
    if (!isOpen) {
      setStatusMessage('');
    }
  }, [isOpen]);

  const parsedPreview = useMemo(() => parseKeyframes(keyframes, normalizedDuration), [keyframes, normalizedDuration]);
  const usesDr3FpOnlyAngles = useMemo(() => {
    const numericKeyframes = parsedPreview.keyframes.filter((keyframe): keyframe is CameraRotationToolKeyframe & { angle: number } => (
      keyframe.angle !== 'native'
    ));
    if (numericKeyframes.some(keyframe => Math.abs(keyframe.angle) > 180)) {
      return true;
    }

    for (let index = 0; index < parsedPreview.keyframes.length - 1; index += 1) {
      const currentKeyframe = parsedPreview.keyframes[index];
      const nextKeyframe = parsedPreview.keyframes[index + 1];
      if (
        currentKeyframe.angle !== 'native'
        && nextKeyframe.angle !== 'native'
        && Math.abs(nextKeyframe.angle - currentKeyframe.angle) > 180
      ) {
        return true;
      }
    }

    return false;
  }, [parsedPreview.keyframes]);
  const getDisplayAngle = (keyframe: CameraRotationToolKeyframe) => (
    keyframe.angle === 'native'
      ? getNativeAngleAtTimepos(keyframe.location)
      : keyframe.angle
  );
  const getPreviewAngleAtTimepos = (
    currentKeyframe: CameraRotationToolKeyframe,
    nextKeyframe: CameraRotationToolKeyframe,
    timepos: number,
  ) => {
    if (currentKeyframe.angle === 'native') {
      return getNativeAngleAtTimepos(timepos);
    }

    if (nextKeyframe.angle !== 'native') {
      const span = Math.max(0.000001, nextKeyframe.location - currentKeyframe.location);
      const progress = Math.max(0, Math.min(1, (timepos - currentKeyframe.location) / span));
      return currentKeyframe.angle + (nextKeyframe.angle - currentKeyframe.angle) * progress;
    }

    return currentKeyframe.angle;
  };
  const previewPoints = useMemo(() => {
    if (parsedPreview.keyframes.length === 0) {
      return [];
    }

    const points: Array<{ location: number; angle: number }> = [];
    for (let index = 0; index < parsedPreview.keyframes.length - 1; index += 1) {
      const currentKeyframe = parsedPreview.keyframes[index];
      const nextKeyframe = parsedPreview.keyframes[index + 1];
      const sampleCount = Math.max(2, Math.min(48, Math.ceil((nextKeyframe.location - currentKeyframe.location) * 4)));
      for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex += 1) {
        if (index > 0 && sampleIndex === 0) {
          continue;
        }

        const progress = sampleIndex / sampleCount;
        const location = currentKeyframe.location + (nextKeyframe.location - currentKeyframe.location) * progress;
        points.push({
          location,
          angle: getPreviewAngleAtTimepos(currentKeyframe, nextKeyframe, location),
        });
      }
    }

    return points;
  }, [getNativeAngleAtTimepos, parsedPreview.keyframes]);
  const graphAngles = previewPoints.length > 0
    ? previewPoints.map(point => point.angle)
    : [0];
  const graphMinAngle = Math.min(-5, ...graphAngles) - 1;
  const graphMaxAngle = Math.max(5, ...graphAngles) + 1;
  const graphAngleRange = Math.max(1, graphMaxAngle - graphMinAngle);
  const graphWidthPercent = Math.max(100, xZoom * 100);
  const graphHeight = Math.max(224, Math.round(224 * yZoom));
  const gridYValues = Array.from({ length: 7 }, (_, index) => (
    graphMinAngle + (graphAngleRange * index) / 6
  ));
  const gridXValues = Array.from({ length: 9 }, (_, index) => (
    (normalizedDuration * index) / 8
  ));
  const sortedDrafts = useMemo(
    () => [...keyframes].sort((a, b) => Number(a.location) - Number(b.location)),
    [keyframes],
  );

  const getGraphX = (location: number) => (location / normalizedDuration) * 100;
  const getGraphY = (angle: number) => 92 - ((angle - graphMinAngle) / graphAngleRange) * 84;
  const graphPath = previewPoints.reduce((path, point, index) => {
    const x = getGraphX(point.location);
    const y = getGraphY(point.angle);
    if (index === 0) {
      return `M ${x} ${y}`;
    }

    return `${path} L ${x} ${y}`;
  }, '');

  if (!isOpen) {
    return null;
  }

  const updateKeyframe = (id: string, updates: Partial<CameraRotationToolKeyframeDraft>) => {
    setStatusMessage('');
    setKeyframes(currentKeyframes => currentKeyframes.map(keyframe => (
      keyframe.id === id ? { ...keyframe, ...updates } : keyframe
    )));
  };

  const addKeyframe = () => {
    const parsedKeyframeLocations = keyframes
      .map(keyframe => Number(keyframe.location))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const largestGap = parsedKeyframeLocations.reduce((bestGap, location, index) => {
      const nextLocation = parsedKeyframeLocations[index + 1];
      if (nextLocation === undefined) {
        return bestGap;
      }

      const gap = nextLocation - location;
      return gap > bestGap.gap
        ? { gap, location: location + gap / 2 }
        : bestGap;
    }, { gap: 0, location: normalizedDuration / 2 });
    const nativeAngle = getNativeAngleAtTimepos(largestGap.location);

    setStatusMessage('');
    setKeyframes(currentKeyframes => [
      ...currentKeyframes,
      createKeyframeDraft(largestGap.location, nativeAngle),
    ]);
  };

  const resetKeyframes = () => {
    setStatusMessage('');
    setKeyframes([
      createKeyframeDraft(0, 'native'),
      createKeyframeDraft(normalizedDuration, 'native'),
    ]);
  };

  const resetGraphView = () => {
    setXZoom(1);
    setYZoom(1);
  };

  const applyKeyframes = () => {
    const parsed = parseKeyframes(keyframes, normalizedDuration);
    if (parsed.error) {
      setStatusMessage(parsed.error);
      return;
    }

    const result = onApply({ keyframes: parsed.keyframes });
    setStatusMessage(result.message);
  };

  return (
    <motion.div
      className={`${getOverlayClassName(isBackdropBlurDisabled, isAnimationDisabled, 'z-[65]')} text-neutral-100`}
      {...getOverlayMotionProps(isAnimationDisabled)}
      onMouseDown={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="camera-rotation-tool-title"
        className={`relative max-h-[92vh] w-full max-w-5xl ${dialogSurfaceClassName}`}
        {...getDialogMotionProps(isAnimationDisabled)}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={`${dialogHeaderClassName} flex items-start justify-between gap-4`}>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-300">{text.title}</div>
            <h2 id="camera-rotation-tool-title" className="mt-1 text-xl font-semibold text-white">
              {text.heading}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-neutral-400">
              {text.description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
            aria-label={text.close}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          <section className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-neutral-100">{text.timeline}</div>
                <div className="mt-1 text-xs text-neutral-500">
                  {formatTranslation(text.duration, { duration: formatCameraRotationNumber(normalizedDuration, 3) })}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {[
                  {
                    label: text.xZoom,
                    value: xZoom,
                    zoomOut: () => setXZoom(currentZoom => Math.max(1, Number((currentZoom / 1.5).toFixed(3)))),
                    zoomIn: () => setXZoom(currentZoom => Math.min(32, Number((currentZoom * 1.5).toFixed(3)))),
                  },
                  {
                    label: text.yZoom,
                    value: yZoom,
                    zoomOut: () => setYZoom(currentZoom => Math.max(1, Number((currentZoom / 1.5).toFixed(3)))),
                    zoomIn: () => setYZoom(currentZoom => Math.min(24, Number((currentZoom * 1.5).toFixed(3)))),
                  },
                ].map(control => (
                  <div key={control.label} className="flex items-center gap-1 rounded border border-neutral-800 bg-neutral-900/60 p-1">
                    <span className="px-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{control.label}</span>
                    <button
                      type="button"
                      onClick={control.zoomOut}
                      className="inline-flex h-8 w-8 items-center justify-center rounded border border-neutral-700 bg-neutral-800 text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
                      aria-label={`${control.label} ${text.zoomOut}`}
                    >
                      <ZoomOut className="h-4 w-4" />
                    </button>
                    <div className="w-12 text-center text-xs font-semibold text-neutral-400">{formatCameraRotationNumber(control.value, 2)}x</div>
                    <button
                      type="button"
                      onClick={control.zoomIn}
                      className="inline-flex h-8 w-8 items-center justify-center rounded border border-neutral-700 bg-neutral-800 text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
                      aria-label={`${control.label} ${text.zoomIn}`}
                    >
                      <ZoomIn className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={resetGraphView}
                  className="inline-flex h-10 w-10 items-center justify-center rounded border border-neutral-700 bg-neutral-800 text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
                  aria-label={text.resetView}
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="max-h-72 overflow-auto rounded border border-neutral-800 bg-neutral-900/50">
              <div className="relative min-w-full" style={{ width: `${graphWidthPercent}%`, height: `${graphHeight}px` }}>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                  <line x1="0" y1={getGraphY(0)} x2="100" y2={getGraphY(0)} stroke="rgba(163,163,163,0.22)" strokeWidth="0.5" />
                  {gridXValues.map(value => (
                    <line key={`x-${value}`} x1={getGraphX(value)} y1="0" x2={getGraphX(value)} y2="100" stroke="rgba(82,82,82,0.35)" strokeWidth="0.25" />
                  ))}
                  {gridYValues.map(value => (
                    <line key={`y-${value}`} x1="0" y1={getGraphY(value)} x2="100" y2={getGraphY(value)} stroke="rgba(82,82,82,0.35)" strokeWidth="0.25" />
                  ))}
                  {graphPath && (
                    <path d={graphPath} fill="none" stroke="rgb(129,140,248)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                  )}
                  {parsedPreview.keyframes.map(keyframe => (
                    <circle
                      key={`${keyframe.location}:${keyframe.angle}`}
                      cx={getGraphX(keyframe.location)}
                      cy={getGraphY(getDisplayAngle(keyframe))}
                      r="1.8"
                      fill={keyframe.angle === 'native' ? 'rgb(167,243,208)' : 'rgb(199,210,254)'}
                      stroke={keyframe.angle === 'native' ? 'rgb(5,150,105)' : 'rgb(67,56,202)'}
                      strokeWidth="0.7"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </svg>
                {gridYValues.map(value => (
                  <div
                    key={`label-y-${value}`}
                    className="pointer-events-none absolute left-3 -translate-y-1/2 text-[11px] font-mono text-neutral-500"
                    style={{ top: `${getGraphY(value)}%` }}
                  >
                    {formatCameraRotationNumber(value, 2)} deg
                  </div>
                ))}
                {gridXValues.map(value => (
                  <div
                    key={`label-x-${value}`}
                    className="pointer-events-none absolute bottom-2 -translate-x-1/2 text-[11px] font-mono text-neutral-500"
                    style={{ left: `${getGraphX(value)}%` }}
                  >
                    {formatCameraRotationNumber(value, 2)}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-neutral-100">{text.keyframes}</div>
                <div className="mt-1 text-xs text-neutral-500">{text.keyframesDescription}</div>
                {usesDr3FpOnlyAngles && (
                  <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    {text.dr3FpOnlyAngleWarning}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetKeyframes}
                  className="inline-flex items-center gap-2 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
                >
                  <RotateCcw className="h-4 w-4" />
                  {text.resetToNative}
                </button>
                <button
                  type="button"
                  onClick={addKeyframe}
                  className="inline-flex items-center gap-2 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
                >
                  <Plus className="h-4 w-4" />
                  {text.addKeyframe}
                </button>
              </div>
            </div>

            <div className="grid gap-2">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                <div>{text.location}</div>
                <div>{text.angle}</div>
                <div className="w-9" />
              </div>
              {sortedDrafts.map(keyframe => (
                <div key={keyframe.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 rounded-lg border border-neutral-800 bg-neutral-900/50 p-2">
                  <input
                    type="number"
                    value={keyframe.location}
                    min={0}
                    max={normalizedDuration}
                    step={0.001}
                    onChange={(event) => updateKeyframe(keyframe.id, { location: event.target.value })}
                    className="min-w-0 rounded border border-neutral-700 bg-neutral-800 p-2 font-mono text-sm text-neutral-100 outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={keyframe.angle}
                    onChange={(event) => updateKeyframe(keyframe.id, { angle: event.target.value })}
                    placeholder={text.nativePlaceholder}
                    className="min-w-0 rounded border border-neutral-700 bg-neutral-800 p-2 font-mono text-sm text-neutral-100 outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setStatusMessage('');
                      setKeyframes(currentKeyframes => currentKeyframes.filter(currentKeyframe => currentKeyframe.id !== keyframe.id));
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded border border-neutral-700 bg-neutral-800 text-neutral-400 transition-colors hover:bg-red-500/20 hover:text-red-200"
                    aria-label={text.deleteKeyframe}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className={`${dialogFooterClassName} flex flex-wrap items-center justify-between gap-3`}>
          <div className="min-h-5 text-xs text-neutral-400">{statusMessage}</div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-semibold text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
            >
              {translations.common.cancel}
            </button>
            <button
              type="button"
              onClick={applyKeyframes}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              {text.apply}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
