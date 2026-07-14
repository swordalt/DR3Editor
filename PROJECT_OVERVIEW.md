# DR3Editor — Project Overview

Browser-based chart editor for the rhythm game **DanceRail3**, built as a full replacement for the official editor ("DRMaker"). Client-side only (no backend) — React 19 + TypeScript + Vite 6 + Tailwind CSS 4.

Live build: `swordalt.github.io/DR3Editor/`. Deployed to GitHub Pages and Cloudflare Pages.

## Stack & tooling

- **Framework**: React 19, TypeScript, Vite 6, Tailwind CSS 4 (`@tailwindcss/vite`)
- **Key deps**: `jszip` (reading imported `.zip` bundles), `wasm-media-encoders` (in-browser audio→OGG transcoding), `motion` (animation), `lucide-react` (icons)
- **No** state-management library, no router, no backend — state lives in plain `useState`
- **Scripts** (`package.json`): `dev` (vite on :3000), `build`, `preview`, `lint` (`tsc --noEmit`, no ESLint), `deploy:github-pages`, `clean`
- **Config**: `vite.config.ts` supports `VITE_BASE_PATH` for GH Pages subpath, `@` path alias → root

## Entry points

`index.html` → `src/main.tsx` → `App.tsx`, which switches between `LandingPage` and a lazily-loaded `Editor` (`src/Editor.tsx`, ~9k lines — the central orchestrator holding most editor runtime state). Two Web Workers offload heavy work: `src/workers/exportWorker.ts` (ZIP export) and `src/workers/chartProjectFilesWorker.ts`.

## Directory map

- `src/App.tsx` — app shell: landing/editor switch, project import (raw `.txt`, `.zip` bundles via manifest.json or resolver dialog), audio-to-OGG conversion trigger, tutorial bootstrap, **chart merge/combination dialog** (most recent feature)
- `src/Editor.tsx` — main editor component; owns selection/playback/view/tools/undo-redo/dialog state, renders `EditorLayout`
- `src/components/` — UI: `LandingPage`, `EditorLayout`, `EditorTopBar`, `EditorCanvas(Stage)`, left sidebar panels (BPM/Curve/Speed/EditInfo/Main/Utility), `EditorRightSidebar`, `EditorPreviewSidebar`, `EditorOverlays`, tool modals (`EditorNscToolModal`, `EditorNoteMultiEditModal`, `EditorCameraRotationToolModal`), `EditorFilePreviewModal`, `EditorTutorialOverlay`, `VirtualizedChangeList`
- `src/editor/` — domain logic (non-UI):
  - `editorHistory.ts` — undo/redo snapshot model (before/after, capped at 500 entries)
  - `editorTiming.ts` / `editorViewConstants.ts` — beat/measure math, snapping, camera/animation constants
  - `editorSettings.ts`, `editorKeybinds.ts`, `editorMetadata.ts`, `editorNoteTransforms.ts`
  - `chartIssues.ts` — playability issue finder
  - `chartStatistics.ts`, `chartProjectFiles.ts`, `noteRenderIndex.ts`
  - `previewPlayback.ts` + `preview3DConstants.ts` + `dr3FpPreviewStatus.ts` — top-down/3D **Preview Mode** simulation (camera tilt, appear-mode note entry, combo tracking), with optional handoff to external "DR3FP" preview receiver via postMessage
  - `audioTiming.ts`, `audioNormalization.ts`, `audioPlayback.ts` — audio sync/processing
  - `tutorial.ts` — in-editor tutorial script
- `src/types/` — `editorTypes.ts` (Note, BpmChange, SpeedChange, ProjectData, ViewState), `exportTypes.ts`
- `src/utils/` — `levelFormat.ts` (chart text parser/serializer + validator), `zipExport.ts` (hand-rolled ZIP writer, no lib), `exportWorkerClient.ts`, `chartProjectFilesWorkerClient.ts`, `audioOggConversion.ts`
- `src/constants/editorConstants.ts` — registry of 25 official note types (colors, hit sounds, hold classifications)
- `src/lang/` — UI strings (`en.ts`); i18n scaffold exists but only English is wired
- `src/data/changelog.ts`, `src/assets/` (logo, hit/flick SFX, preview note sprites)

## Data formats

**Native chart format** (`.txt`), handled by `src/utils/levelFormat.ts`:
- Header: `#OFFSET=`, `#BEAT=`, `#BPM_NUMBER=` + indexed `#BPM[i]`/`#BPMS[i]` pairs, `#SCN=` + indexed `#SC[i]`/`#SCI[i]` speed-change pairs
- Notes: `<id><type><beatPos><lane><width><speed><parentId>[<appearMode>]`, appearMode ∈ `{L,R,H,P,N}`
- Strict regex-based `validateLevelText` validator with line-numbered errors

**Project ZIP bundles**: read via `jszip`, written via hand-rolled `zipExport.ts`. Optional `manifest.json` (version/keyword/title/artist/bpm/diff/chart/audio/illustration/files) disambiguates contents; falls back to a resolver dialog or legacy `info.txt`.

**Export formats** (`ExportFormat` in `exportTypes.ts`):
- `raw` — chart + assets + generated manifest
- `dr3-viewer` — for DanceRail3Viewer
- `dr3-fp` — DR3FP bundle layout (`info.txt`, `{difficulty}.txt`, `base.{ext}`)
- `dr3-fp-preview` — DR3FP layout + manifest, feeds live in-app Preview Mode

**Audio**: accepts aac/flac/m4a/mp3/ogg/wav/webm; non-OGG is transcoded client-side to OGG (required by DanceRail3) via `wasm-media-encoders`. Silent WAV is synthesized when a chart is imported without audio.

**Images**: avif/gif/jpeg/jpg/png/svg/webp for chart illustration/cover art.

## Notable architecture patterns

- Single-locus state: no Redux/Zustand — `App.tsx` and `Editor.tsx` hold state directly via hooks
- Undo/redo via full before/after snapshots (`editorHistory.ts`), not command/diff-based
- CPU-heavy work (export zipping, project-file computation) offloaded to Web Workers with `requestId`-correlated client wrappers
- Dual beat/time coordinate system throughout (`editorUtils.ts`/`editorTiming.ts` convert between tempo-relative beat position and absolute seconds)
- Manifest-driven import with graceful fallback to a manual resolver dialog for ambiguous zip bundles
- **Chart merging** (`App.tsx: importCombinedChartFiles`, newest feature): combines multiple `.txt` charts in `direct` (concatenate) or `priority` (non-overlapping time-span precedence) mode, rebuilding a unified BPM/speed-change timeline and remapping note IDs/parentIds
- `Editor` component is `React.lazy`-loaded; heavy import-time deps (`parseLevelText`, `JSZip`) are dynamically `import()`ed on demand

## Attribution (per README)

Credits DanceRail3Viewer/DRMaker (lucarioex), PhiEdit (cmdysj), and easings.net.
