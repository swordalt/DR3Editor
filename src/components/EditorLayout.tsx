import { motion } from 'motion/react';
import EditorModal from './EditorModal';
import EditorOverlays from './EditorOverlays';
import EditorTopBar from './EditorTopBar';
import EditorPerformanceStats from './EditorPerformanceStats';
import EditorLeftSidebar from './EditorLeftSidebar';
import EditorPreviewSidebar from './EditorPreviewSidebar';
import EditorCanvasStage from './EditorCanvasStage';
import EditorRightSidebar from './EditorRightSidebar';
import { applyAudioPlaybackSpeed } from '../editor/audioPlayback';

export default function EditorLayout(props: any) {
  const {
    mode,
    onBack,
    isModalOpen,
    setIsModalOpen,
    formData,
    setFormData,
    handleConfirm,
    projectData,
    audioRef,
    setDuration,
    stateRef,
    isExitWarningOpen,
    isSettingsOpen,
    isHelpOpen,
    isDr3FpPreviewInfoOpen,
    isExitWarningEnabled,
    isScrollDirectionInverted,
    isSelectionTypeMenuOpen,
    isStatisticsRefreshRateMenuOpen,
    selectionType,
    statisticsRefreshRate,
    musicVolume,
    tapSoundVolume,
    flickSoundVolume,
    isPreviewCameraTiltEnabled,
    isPreviewCameraMovementEnabled,
    isPreviewNoteSpeedChangesEnabled,
    isPreviewNoteAppearModeEnabled,
    setIsExitWarningOpen,
    setIsSettingsOpen,
    setIsHelpOpen,
    setIsDr3FpPreviewInfoOpen,
    setIsExitWarningEnabled,
    setIsScrollDirectionInverted,
    setIsSelectionTypeMenuOpen,
    setIsStatisticsRefreshRateMenuOpen,
    setSelectionType,
    setStatisticsRefreshRate,
    setMusicVolume,
    setTapSoundVolume,
    setFlickSoundVolume,
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
    openExitWarning,
    togglePlay,
    handleSeekChange,
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
    exportDr3Viewer,
    exportDr3Fp,
    fps,
    renderedObjects,
    onPerformanceStatsMouseEnter,
    onPerformanceStatsMouseLeave,
    leftSidebarProps,
    previewDisplayMode,
    setPreviewDisplayMode,
    preview3DTiltDegrees,
    setPreview3DTiltDegrees,
    canvasStageProps,
    rightSidebarProps,
  } = props;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="h-screen overflow-hidden bg-neutral-950 text-neutral-50 flex flex-col font-sans"
    >
      {projectData?.audioUrl && (
        <audio 
          ref={audioRef} 
          src={projectData.audioUrl} 
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration);
            applyAudioPlaybackSpeed(e.currentTarget, stateRef.current.playbackSpeed);
          }}
        />
      )}

      {/* Modal */}
      <EditorModal 
        isOpen={isModalOpen} 
        onClose={() => {
          if (mode === 'new') {
            onBack();
            return;
          }
          setIsModalOpen(false);
        }}
        onConfirm={() => {
          if (!formData.songId.trim() || !formData.difficulty.trim() || !formData.songFile || !formData.songBpm) {
            alert('Please fill in all required fields: Song ID, Difficulty, Audio File, and Song BPM.');
            return;
          }
          handleConfirm();
        }}
        formData={formData}
        setFormData={setFormData}
      />

      <EditorOverlays
        isExitWarningOpen={isExitWarningOpen}
        isSettingsOpen={isSettingsOpen}
        isHelpOpen={isHelpOpen}
        isDr3FpPreviewInfoOpen={isDr3FpPreviewInfoOpen}
        isExitWarningEnabled={isExitWarningEnabled}
        isScrollDirectionInverted={isScrollDirectionInverted}
        isSelectionTypeMenuOpen={isSelectionTypeMenuOpen}
        isStatisticsRefreshRateMenuOpen={isStatisticsRefreshRateMenuOpen}
        selectionType={selectionType}
        statisticsRefreshRate={statisticsRefreshRate}
        musicVolume={musicVolume}
        tapSoundVolume={tapSoundVolume}
        flickSoundVolume={flickSoundVolume}
        isPreviewCameraTiltEnabled={isPreviewCameraTiltEnabled}
        isPreviewCameraMovementEnabled={isPreviewCameraMovementEnabled}
        isPreviewNoteSpeedChangesEnabled={isPreviewNoteSpeedChangesEnabled}
        isPreviewNoteAppearModeEnabled={isPreviewNoteAppearModeEnabled}
        setIsExitWarningOpen={setIsExitWarningOpen}
        setIsSettingsOpen={setIsSettingsOpen}
        setIsHelpOpen={setIsHelpOpen}
        setIsDr3FpPreviewInfoOpen={setIsDr3FpPreviewInfoOpen}
        setIsExitWarningEnabled={setIsExitWarningEnabled}
        setIsScrollDirectionInverted={setIsScrollDirectionInverted}
        setIsSelectionTypeMenuOpen={setIsSelectionTypeMenuOpen}
        setIsStatisticsRefreshRateMenuOpen={setIsStatisticsRefreshRateMenuOpen}
        setSelectionType={setSelectionType}
        setStatisticsRefreshRate={setStatisticsRefreshRate}
        setMusicVolume={setMusicVolume}
        setTapSoundVolume={setTapSoundVolume}
        setFlickSoundVolume={setFlickSoundVolume}
        setIsPreviewCameraTiltEnabled={setIsPreviewCameraTiltEnabled}
        setIsPreviewCameraMovementEnabled={setIsPreviewCameraMovementEnabled}
        setIsPreviewNoteSpeedChangesEnabled={setIsPreviewNoteSpeedChangesEnabled}
        setIsPreviewNoteAppearModeEnabled={setIsPreviewNoteAppearModeEnabled}
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
        openExitWarning={openExitWarning}
        togglePlay={togglePlay}
        handleSeekChange={handleSeekChange}
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
        exportDr3Viewer={exportDr3Viewer}
        exportDr3Fp={exportDr3Fp}
      />

      {projectData && (
        <EditorPerformanceStats
          fps={fps}
          renderedObjects={renderedObjects}
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
            previewDisplayMode={previewDisplayMode}
            setPreviewDisplayMode={setPreviewDisplayMode}
            preview3DTiltDegrees={preview3DTiltDegrees}
            setPreview3DTiltDegrees={setPreview3DTiltDegrees}
          />
        )}

        <EditorCanvasStage {...canvasStageProps} />

        {/* Right Sidebar - Properties */}
        {!isPreviewMode && (
        <EditorRightSidebar {...rightSidebarProps} />
        )}
      </main>
    </motion.div>
  );
}
