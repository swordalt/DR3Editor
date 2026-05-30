import { motion } from 'motion/react';
import EditorModal from './EditorModal';
import EditorOverlays from './EditorOverlays';
import EditorTopBar from './EditorTopBar';
import EditorPerformanceStats from './EditorPerformanceStats';
import EditorLeftSidebar from './EditorLeftSidebar';
import EditorPreviewSidebar from './EditorPreviewSidebar';
import EditorCanvasStage from './EditorCanvasStage';
import EditorRightSidebar from './EditorRightSidebar';

export default function EditorLayout(props: any) {
  const {
    mode,
    onBack,
    isModalOpen,
    setIsModalOpen,
    formData,
    setFormData,
    invalidMetadataFields,
    showMetadataFieldValidation,
    handleMetadataFieldKeyDown,
    handleConfirm,
    isProjectAudioConverting,
    isAudioOffsetNoticeOpen,
    setIsAudioOffsetNoticeOpen,
    projectData,
    playbackAudioUrl,
    audioRef,
    onAudioLoadedMetadata,
    isExitWarningOpen,
    isSettingsOpen,
    isHelpOpen,
    isDr3FpPreviewInfoOpen,
    dr3FpPreviewStatus,
    dr3FpPreviewLogs,
    isExitWarningEnabled,
    isBackdropBlurDisabled,
    isAnimationDisabled,
    isScrollDirectionInverted,
    areTimingChangeIndicatorsAdjusted,
    isEditorJudgementGlowEnabled,
    isVSyncEnabled,
    isDr3FpPreviewEnabled,
    isPreviewPrecomputeEnabled,
    isSelectionTypeMenuOpen,
    isStatisticsRefreshRateMenuOpen,
    selectionType,
    statisticsRefreshRate,
    musicVolume,
    tapSoundVolume,
    flickSoundVolume,
    isPreviewSpritesEnabled,
    isPreviewHoldSpritesEnabled,
    isPreviewChartSpeedChangesEnabled,
    isPreviewCameraTiltEnabled,
    isPreviewCameraMovementEnabled,
    isPreviewNoteSpeedChangesEnabled,
    isPreviewNoteAppearModeEnabled,
    setIsExitWarningOpen,
    setIsSettingsOpen,
    setIsHelpOpen,
    setIsDr3FpPreviewInfoOpen,
    setIsExitWarningEnabled,
    setIsBackdropBlurDisabled,
    setIsAnimationDisabled,
    setIsScrollDirectionInverted,
    setAreTimingChangeIndicatorsAdjusted,
    setIsEditorJudgementGlowEnabled,
    setIsVSyncEnabled,
    setIsDr3FpPreviewEnabled,
    setIsPreviewPrecomputeEnabled,
    setIsSelectionTypeMenuOpen,
    setIsStatisticsRefreshRateMenuOpen,
    setSelectionType,
    setStatisticsRefreshRate,
    setMusicVolume,
    setTapSoundVolume,
    setFlickSoundVolume,
    setIsPreviewSpritesEnabled,
    setIsPreviewHoldSpritesEnabled,
    setIsPreviewChartSpeedChangesEnabled,
    setIsPreviewCameraTiltEnabled,
    setIsPreviewCameraMovementEnabled,
    setIsPreviewNoteSpeedChangesEnabled,
    setIsPreviewNoteAppearModeEnabled,
    tierBadge,
    isXPositionGridEnabled,
    isOutOfBoundsPlacementEnabled,
    isPlaying,
    isPlaybackSpeedMenuOpen,
    isPreviewMode,
    isExportMenuOpen,
    isPreviewMenuOpen,
    isExportDisabled,
    hasExportIncompatibleTimeSignature,
    duration,
    currentTime,
    effectiveGridZoom,
    pixelsPerBeat,
    playbackSpeed,
    bpmChanges,
    progressBarRef,
    timeDisplayRef,
    isDraggingProgress,
    isProgressBarInteractive,
    openExitWarning,
    togglePlay,
    handleSeekChange,
    beginProgressSeek,
    finishProgressSeek,
    setIsXPositionGridEnabled,
    setIsOutOfBoundsPlacementEnabled,
    setIsExportMenuOpen,
    setIsPlaybackSpeedMenuOpen,
    setIsPreviewMenuOpen,
    changePlaybackSpeed,
    openHelp,
    openSettings,
    togglePreviewMode,
    previewDr3Fp,
    exportRaw,
    exportDr3Viewer,
    exportDr3Fp,
    fps,
    renderedObjects,
    onPerformanceStatsMouseEnter,
    onPerformanceStatsMouseLeave,
    leftSidebarProps,
    canvasStageProps,
    rightSidebarProps,
  } = props;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: isAnimationDisabled ? 0 : 0.3 }}
      className={`h-screen overflow-hidden bg-neutral-950 text-neutral-50 flex flex-col font-sans ${isAnimationDisabled ? 'app-animations-disabled' : ''}`}
    >
      {playbackAudioUrl && (
        <audio 
          ref={audioRef} 
          src={playbackAudioUrl} 
          onLoadedMetadata={(e) => {
            onAudioLoadedMetadata(e.currentTarget);
          }}
        />
      )}

      {/* Modal */}
      <EditorModal 
        isOpen={isModalOpen} 
        isBackdropBlurDisabled={isBackdropBlurDisabled}
        isAnimationDisabled={isAnimationDisabled}
        isConfirming={isProjectAudioConverting}
        onClose={() => {
          if (mode === 'new') {
            onBack();
            return;
          }
          setIsModalOpen(false);
        }}
        onConfirm={handleConfirm}
        formData={formData}
        setFormData={setFormData}
        invalidMetadataFields={invalidMetadataFields}
        showMetadataFieldValidation={showMetadataFieldValidation}
        handleMetadataFieldKeyDown={handleMetadataFieldKeyDown}
      />

      {isProjectAudioConverting && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-950/90 px-4 text-neutral-100">
          <div className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-2xl">
            <div className="mb-3 h-1 overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-indigo-500" />
            </div>
            <div className="text-sm font-semibold text-white">Converting audio</div>
            <div className="mt-1 text-sm text-neutral-400">
              This audio will be converted to OGG format before editing.
            </div>
          </div>
        </div>
      )}

      {isAudioOffsetNoticeOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-950/90 px-4 text-neutral-100">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="audio-offset-notice-title"
            className="w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-2xl"
          >
            <div className="text-sm font-semibold uppercase tracking-wider text-amber-300">Audio converted</div>
            <h2 id="audio-offset-notice-title" className="mt-2 text-xl font-semibold text-white">
              Review the chart offset
            </h2>
            <p className="mt-3 text-sm leading-6 text-neutral-300">
              The audio was converted to OGG before editing. Conversion between formats can shift timing slightly, so check and adjust the offset before charting.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsAudioOffsetNoticeOpen(false);
                  leftSidebarProps?.setActiveLeftPanel?.('bpmTiming');
                }}
                className="flex-1 rounded-lg bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-600"
              >
                Open offset
              </button>
              <button
                type="button"
                onClick={() => setIsAudioOffsetNoticeOpen(false)}
                className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-3 text-sm font-semibold text-neutral-200 transition-colors hover:bg-neutral-700"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      <EditorOverlays
        isExitWarningOpen={isExitWarningOpen}
        isSettingsOpen={isSettingsOpen}
        isHelpOpen={isHelpOpen}
        isDr3FpPreviewInfoOpen={isDr3FpPreviewInfoOpen}
        dr3FpPreviewStatus={dr3FpPreviewStatus}
        dr3FpPreviewLogs={dr3FpPreviewLogs}
        isExitWarningEnabled={isExitWarningEnabled}
        isBackdropBlurDisabled={isBackdropBlurDisabled}
        isAnimationDisabled={isAnimationDisabled}
        isScrollDirectionInverted={isScrollDirectionInverted}
        areTimingChangeIndicatorsAdjusted={areTimingChangeIndicatorsAdjusted}
        isEditorJudgementGlowEnabled={isEditorJudgementGlowEnabled}
        isVSyncEnabled={isVSyncEnabled}
        isDr3FpPreviewEnabled={isDr3FpPreviewEnabled}
        isPreviewPrecomputeEnabled={isPreviewPrecomputeEnabled}
        isSelectionTypeMenuOpen={isSelectionTypeMenuOpen}
        isStatisticsRefreshRateMenuOpen={isStatisticsRefreshRateMenuOpen}
        selectionType={selectionType}
        statisticsRefreshRate={statisticsRefreshRate}
        musicVolume={musicVolume}
        tapSoundVolume={tapSoundVolume}
        flickSoundVolume={flickSoundVolume}
        setIsExitWarningOpen={setIsExitWarningOpen}
        setIsSettingsOpen={setIsSettingsOpen}
        setIsHelpOpen={setIsHelpOpen}
        setIsDr3FpPreviewInfoOpen={setIsDr3FpPreviewInfoOpen}
        setIsExitWarningEnabled={setIsExitWarningEnabled}
        setIsBackdropBlurDisabled={setIsBackdropBlurDisabled}
        setIsAnimationDisabled={setIsAnimationDisabled}
        setIsScrollDirectionInverted={setIsScrollDirectionInverted}
        setAreTimingChangeIndicatorsAdjusted={setAreTimingChangeIndicatorsAdjusted}
        setIsEditorJudgementGlowEnabled={setIsEditorJudgementGlowEnabled}
        setIsVSyncEnabled={setIsVSyncEnabled}
        setIsDr3FpPreviewEnabled={setIsDr3FpPreviewEnabled}
        setIsPreviewPrecomputeEnabled={setIsPreviewPrecomputeEnabled}
        setIsSelectionTypeMenuOpen={setIsSelectionTypeMenuOpen}
        setIsStatisticsRefreshRateMenuOpen={setIsStatisticsRefreshRateMenuOpen}
        setSelectionType={setSelectionType}
        setStatisticsRefreshRate={setStatisticsRefreshRate}
        setMusicVolume={setMusicVolume}
        setTapSoundVolume={setTapSoundVolume}
        setFlickSoundVolume={setFlickSoundVolume}
        onBack={onBack}
      />

      {/* Top Navigation Bar */}
      <EditorTopBar
        projectData={projectData}
        tierBadge={tierBadge}
        isXPositionGridEnabled={isXPositionGridEnabled}
        isOutOfBoundsPlacementEnabled={isOutOfBoundsPlacementEnabled}
        isPlaying={isPlaying}
        isPlaybackSpeedMenuOpen={isPlaybackSpeedMenuOpen}
        isHelpOpen={isHelpOpen}
        isSettingsOpen={isSettingsOpen}
        isPreviewMode={isPreviewMode}
        isDr3FpPreviewEnabled={isDr3FpPreviewEnabled}
        isExportMenuOpen={isExportMenuOpen}
        isPreviewMenuOpen={isPreviewMenuOpen}
        isExportDisabled={isExportDisabled}
        hasExportIncompatibleTimeSignature={hasExportIncompatibleTimeSignature}
        duration={duration}
        currentTime={currentTime}
        effectiveGridZoom={effectiveGridZoom}
        pixelsPerBeat={pixelsPerBeat}
        playbackSpeed={playbackSpeed}
        bpmChanges={bpmChanges}
        progressBarRef={progressBarRef}
        timeDisplayRef={timeDisplayRef}
        isDraggingProgress={isDraggingProgress}
        isProgressBarInteractive={isProgressBarInteractive}
        openExitWarning={openExitWarning}
        togglePlay={togglePlay}
        handleSeekChange={handleSeekChange}
        beginProgressSeek={beginProgressSeek}
        finishProgressSeek={finishProgressSeek}
        setIsXPositionGridEnabled={setIsXPositionGridEnabled}
        setIsOutOfBoundsPlacementEnabled={setIsOutOfBoundsPlacementEnabled}
        setIsExportMenuOpen={setIsExportMenuOpen}
        setIsPlaybackSpeedMenuOpen={setIsPlaybackSpeedMenuOpen}
        setIsPreviewMenuOpen={setIsPreviewMenuOpen}
        changePlaybackSpeed={changePlaybackSpeed}
        openHelp={openHelp}
        openSettings={openSettings}
        togglePreviewMode={togglePreviewMode}
        previewDr3Fp={previewDr3Fp}
        exportRaw={exportRaw}
        exportDr3Viewer={exportDr3Viewer}
        exportDr3Fp={exportDr3Fp}
      />

      {projectData && (
        <EditorPerformanceStats
          fps={fps}
          renderedObjects={renderedObjects}
          isBackdropBlurDisabled={isBackdropBlurDisabled}
          onMouseEnter={onPerformanceStatsMouseEnter}
          onMouseLeave={onPerformanceStatsMouseLeave}
        />
      )}

      {/* Main Editor Area */}
      <main className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Sidebar - General Functions */}
        {!isPreviewMode && (
          <EditorLeftSidebar {...leftSidebarProps} />
        )}

        {isPreviewMode && (
          <EditorPreviewSidebar
            isLeftPanelCompact={leftSidebarProps.isLeftPanelCompact}
            isLeftPanelContentVisible={leftSidebarProps.isLeftPanelContentVisible}
            toggleLeftPanelCompact={leftSidebarProps.toggleLeftPanelCompact}
            isPreviewSpritesEnabled={isPreviewSpritesEnabled}
            isPreviewHoldSpritesEnabled={isPreviewHoldSpritesEnabled}
            isPreviewChartSpeedChangesEnabled={isPreviewChartSpeedChangesEnabled}
            isPreviewCameraTiltEnabled={isPreviewCameraTiltEnabled}
            isPreviewCameraMovementEnabled={isPreviewCameraMovementEnabled}
            isPreviewNoteSpeedChangesEnabled={isPreviewNoteSpeedChangesEnabled}
            isPreviewNoteAppearModeEnabled={isPreviewNoteAppearModeEnabled}
            setIsPreviewSpritesEnabled={setIsPreviewSpritesEnabled}
            setIsPreviewHoldSpritesEnabled={setIsPreviewHoldSpritesEnabled}
            setIsPreviewChartSpeedChangesEnabled={setIsPreviewChartSpeedChangesEnabled}
            setIsPreviewCameraTiltEnabled={setIsPreviewCameraTiltEnabled}
            setIsPreviewCameraMovementEnabled={setIsPreviewCameraMovementEnabled}
            setIsPreviewNoteSpeedChangesEnabled={setIsPreviewNoteSpeedChangesEnabled}
            setIsPreviewNoteAppearModeEnabled={setIsPreviewNoteAppearModeEnabled}
          />
        )}

        <EditorCanvasStage {...canvasStageProps} />

        {/* Right Sidebar - Properties */}
        <EditorRightSidebar
          {...rightSidebarProps}
          isPreviewMode={isPreviewMode}
        />
      </main>
    </motion.div>
  );
}
