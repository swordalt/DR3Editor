import { ArrowLeft, X } from 'lucide-react';
import CommitInput from './CommitInput';
import VirtualizedChangeList from './VirtualizedChangeList';
import { NOTE_TYPES, canTypeHaveParent } from '../constants/editorConstants';
import {
  formatGroupedIds,
  formatHistoryTimestamp,
  formatNoteLane,
  operationCategoryStyles,
} from '../editor/editorHistory';
import { getBpmChangeTimepos } from '../utils/editorUtils';
import { translations } from '../lang';
export default function EditorLeftSpeedPanel(props: any) {
  const {
    isLeftPanelContentVisible,
    activeLeftPanel,
    setActiveLeftPanel,
    handleEditInfo,
    handleClearCopiedNotes,
    copiedNotesCount,
    currentParentInput,
    setCurrentParentInput,
    currentParentNote,
    selectedSingleNote,
    canUseSelectedAsParent,
    currentId,
    selectedNoteType,
    noteWidth,
    formData,
    setFormData,
    illustrationPreview,
    chartProjectFiles,
    handleConfirm,
    offset,
    updateOffset,
    isOfficialChartFormat,
    bpmChangeGridClass,
    bpmChanges,
    changeTableJumpMarkerClass,
    jumpToNoteTime,
    getTimeFromTimepos,
    changeTableInputClass,
    updateBpmChange,
    deleteBpmChange,
    addBpmChange,
    speedChangeGridClass,
    speedChanges,
    updateSpeedChange,
    deleteSpeedChange,
    addSpeedChange,
    selectedNoteIdSet,
    curveNoteType,
    setCurveNoteType,
    notePropertyInputClass,
    curveDensityInput,
    setCurveDensityInput,
    setCurveNotesMessage,
    hasValidCurveDensity,
    parsedCurveDensity,
    curveEasingFamily,
    setCurveEasingFamily,
    curveEasingType,
    setCurveEasingType,
    handleGenerateCurveNotes,
    canGenerateCurveNotes,
    curveNotesMessage,
    handleOrganizeNotes,
    notes,
    isOrganizingNotes,
    recheckChartIssues,
    chartIssues,
    shouldShowUndoneOperations,
    setShouldShowUndoneOperations,
    operationHistory,
    visibleOperationHistory,
    undoneOperationIds,
  } = props;
  const text = translations;

  return (
    <>
      {isLeftPanelContentVisible && activeLeftPanel === 'speedChanges' && (
            <div className="p-4 flex flex-col h-full overflow-hidden min-h-0">
              <div className="flex items-center gap-2 mb-4 shrink-0">
                <button onClick={() => setActiveLeftPanel('main')} className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">{text.sidebar.speedChanges}</div>
              </div>
              <div className="flex flex-col overflow-hidden flex-1 pr-1 pb-4 min-h-0">
                <div className={`${speedChangeGridClass} pb-2 text-left text-sm text-neutral-500`}>
                  <div>{text.sidebar.id}</div>
                  <div>{text.sidebar.timepos}</div>
                  <div>{text.sidebar.speed}</div>
                  <div />
                </div>
                <VirtualizedChangeList
                  items={speedChanges}
                  rowHeight={36}
                    getKey={(_, index) => index}
                    className="min-h-0 flex-1 pr-1 text-sm text-neutral-300"
                    renderRow={(change, index, style) => (
                    <div style={style} className={`${speedChangeGridClass} items-center`}>
                      <button
                        type="button"
                        className={changeTableJumpMarkerClass}
                        title={`Jump to speed change ${index + 1}`}
                        onClick={() => jumpToNoteTime(getTimeFromTimepos(change.timepos))}
                      >
                        {index + 1}
                      </button>
                      <CommitInput type="number" step="0.001" value={change.timepos} className={changeTableInputClass} onCommit={(value) => {
                          const timepos = parseFloat(value);
                          updateSpeedChange(index, { timepos: Number.isFinite(timepos) ? timepos : 0 });
                        }} />
                      <CommitInput type="number" step="0.1" value={change.speedChange} className={changeTableInputClass} onCommit={(value) => {
                          const val = parseFloat(value);
                          updateSpeedChange(index, { speedChange: isNaN(val) ? 1 : val });
                        }} />
                      <div>
                        {index > 0 && (
                          <button onClick={() => {
                            deleteSpeedChange(index);
                          }} className="text-red-400 hover:text-red-300">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                />
                <button onClick={addSpeedChange} className="w-full shrink-0 p-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded text-sm mt-2 transition-colors">{text.sidebar.addSpeedChange}</button>
              </div>
            </div>
          )}
    </>
  );
}




