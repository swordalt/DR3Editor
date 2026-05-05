import { Box, Square } from 'lucide-react';
import {
  MAX_PREVIEW_3D_TILT_DEGREES,
  MIN_PREVIEW_3D_TILT_DEGREES,
  type PreviewDisplayMode,
} from '../editor/editorSettings';

export default function EditorPreviewSidebar({
  previewDisplayMode,
  setPreviewDisplayMode,
  preview3DTiltDegrees,
  setPreview3DTiltDegrees,
}: {
  previewDisplayMode: PreviewDisplayMode;
  setPreviewDisplayMode: (mode: PreviewDisplayMode) => void;
  preview3DTiltDegrees: number;
  setPreview3DTiltDegrees: (degrees: number) => void;
}) {
  return (
          <aside className="w-64 shrink-0 border-r border-neutral-800 bg-neutral-900/30 flex flex-col overflow-hidden">
            <div className="border-b border-neutral-800 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Preview Mode</div>
            </div>
            <div className="flex flex-col gap-4 p-4">
              <div>
                <div className="mb-2 text-xs font-medium text-neutral-400">Display Mode</div>
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-neutral-800 bg-neutral-950/40 p-1">
                  <button
                    type="button"
                    onClick={() => setPreviewDisplayMode('2d')}
                    aria-pressed={previewDisplayMode === '2d'}
                    className={`flex h-10 items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors ${
                      previewDisplayMode === '2d'
                        ? 'bg-indigo-600 text-white'
                        : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
                    }`}
                  >
                    <Square className="h-4 w-4" />
                    2D
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewDisplayMode('3d')}
                    aria-pressed={previewDisplayMode === '3d'}
                    className={`flex h-10 items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors ${
                      previewDisplayMode === '3d'
                        ? 'bg-indigo-600 text-white'
                        : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
                    }`}
                  >
                    <Box className="h-4 w-4" />
                    3D
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100">
                NSC and Note Appear Mode in Preview Mode may not be 100% accurate to the official game or other chart players.<br/><br/>Use direct preview via DR3FP for an 100% accurate preview in relation to DanceRail3.
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="preview-3d-tilt" className="text-xs font-medium text-neutral-400">
                    3D Tilt Angle
                  </label>
                  <span className="text-xs tabular-nums text-neutral-500">
                    {preview3DTiltDegrees.toFixed(1)}°
                  </span>
                </div>
                <input
                  id="preview-3d-tilt"
                  type="range"
                  min={MIN_PREVIEW_3D_TILT_DEGREES}
                  max={MAX_PREVIEW_3D_TILT_DEGREES}
                  step="0.1"
                  value={preview3DTiltDegrees}
                  onChange={(event) => setPreview3DTiltDegrees(Number(event.target.value))}
                  disabled={previewDisplayMode !== '3d'}
                  className="h-2 w-full accent-indigo-500 disabled:opacity-45"
                />
                <div className="flex justify-between text-[11px] text-neutral-600">
                  <span>{MIN_PREVIEW_3D_TILT_DEGREES}°</span>
                  <span>{MAX_PREVIEW_3D_TILT_DEGREES}°</span>
                </div>
              </div>
            </div>
          </aside>
  );
}
