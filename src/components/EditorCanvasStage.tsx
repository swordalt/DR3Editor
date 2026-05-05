import EditorCanvas from './EditorCanvas';

export default function EditorCanvasStage(props: any) {
  const {
    containerRef,
    handleWheel,
    projectData,
    emptyCanvasMessage,
    canvasRef,
    bpmChanges,
    speedChanges,
    gridZoom,
    pixelsPerBeat,
    currentTime,
    offset,
    stateRef,
    selectedNoteIds,
    selectionBox,
    timeDisplayRef,
    progressBarRef,
    isDraggingProgress,
    audioRef,
    isPreviewMode,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    getSelectionPointFromClient,
    handleCanvasMouseLeave,
    handleContextMenu,
  } = props;

  return (
    <section
      ref={containerRef}
      className="flex-1 bg-neutral-950 relative flex items-center justify-center overflow-hidden"
      onWheel={handleWheel}
    >
      {!projectData ? (
        <div className="text-neutral-500 z-10 flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-2 border-dashed border-neutral-700 rounded-full flex items-center justify-center">
            <span className="text-2xl">🎵</span>
          </div>
          <p>{emptyCanvasMessage}</p>
        </div>
      ) : (
        <EditorCanvas
          canvasRef={canvasRef}
          containerRef={containerRef}
          projectData={projectData}
          bpmChanges={bpmChanges}
          speedChanges={speedChanges}
          gridZoom={gridZoom}
          pixelsPerBeat={pixelsPerBeat}
          currentTime={currentTime}
          offset={offset}
          stateRef={stateRef}
          selectedNoteIds={selectedNoteIds}
          selectionBox={selectionBox}
          timeDisplayRef={timeDisplayRef}
          progressBarRef={progressBarRef}
          isDraggingProgress={isDraggingProgress}
          audioRef={audioRef}
          isPreviewMode={isPreviewMode}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={(event) => {
            if (!selectionBox) {
              handleCanvasMouseUp(null);
              return;
            }

            const selectionPoint = getSelectionPointFromClient(event.clientX, event.clientY);
            handleCanvasMouseUp(selectionPoint
              ? {
                  ...selectionBox,
                  endXPosition: selectionPoint.xPosition,
                  endBeat: selectionPoint.beat,
                }
              : selectionBox);
          }}
          onMouseLeave={handleCanvasMouseLeave}
          onContextMenu={handleContextMenu}
        />
      )}
    </section>
  );
}
