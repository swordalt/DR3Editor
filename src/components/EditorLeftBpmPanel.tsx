import { ArrowLeft, X } from 'lucide-react';
import CommitInput from './CommitInput';
import VirtualizedChangeList from './VirtualizedChangeList';
import { NOTE_TYPES, canTypeHaveParent } from '../constants/editorConstants';
import {
  CURVE_EASING_FAMILY_OPTIONS,
  CURVE_EASING_TYPE_OPTIONS,
  getCurveEasingId,
} from '../editor/editorViewConstants';
import {
  formatGroupedIds,
  formatHistoryTimestamp,
  formatNoteLane,
  operationCategoryStyles,
} from '../editor/editorHistory';
import { getBpmChangeTimepos } from '../utils/editorUtils';
import { translations } from '../lang';
import type { CurveEasingFamily, CurveEasingType } from '../editor/editorLocalTypes';
export default function EditorLeftBpmPanel(props: any) {
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
      {isLeftPanelContentVisible && activeLeftPanel === 'bpmTiming' && (
            <div className="p-4 flex flex-col h-full overflow-hidden min-h-0">
              <div className="flex items-center gap-2 mb-4 shrink-0">
                <button onClick={() => setActiveLeftPanel('main')} className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">{text.sidebar.bpmTiming}</div>
              </div>
              <div className="flex flex-col gap-4 overflow-hidden flex-1 pr-1 pb-4 min-h-0">
                <div className="shrink-0">
                  <label className="block text-xs text-neutral-400 mb-1">{text.sidebar.offsetMs}</label>
                  <CommitInput type="number" value={offset} className="w-full p-2 text-sm bg-neutral-800 rounded border border-neutral-700 focus:border-indigo-500 outline-none" onCommit={(val) => {
                    if (val === '-' || val === "") updateOffset(val);
                    else {
                      const num = parseFloat(val);
                      updateOffset(isNaN(num) ? 0 : num);
                    }
                  }} />
                </div>
                <div className="flex flex-1 min-h-0 flex-col">
                  {!isOfficialChartFormat && (
                    <p className="mb-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-200">
                      {text.sidebar.exportTimeSignatureNotice}
                    </p>
                  )}
                  <label className="block shrink-0 text-xs text-neutral-400 mb-1">{text.sidebar.bpmChanges}</label>
                  <div className={`${bpmChangeGridClass} pb-2 text-left text-sm text-neutral-500`}>
                    <div>{text.sidebar.id}</div>
                    <div>{text.sidebar.timepos}</div>
                    <div>{text.sidebar.bpm}</div>
                    {!isOfficialChartFormat && <div>{text.sidebar.signature}</div>}
                    <div />
                  </div>
                  <VirtualizedChangeList
                    items={bpmChanges}
                    rowHeight={36}
                    getKey={(_, index) => index}
                    className="min-h-0 flex-1 pr-1 text-sm text-neutral-300"
                    renderRow={(change, index, style) => (
                      <div style={style} className={`${bpmChangeGridClass} items-center`}>
                        <button
                          type="button"
                          className={changeTableJumpMarkerClass}
                          title={`Jump to BPM change ${index + 1}`}
                          onClick={() => jumpToNoteTime(getTimeFromTimepos(getBpmChangeTimepos(change)))}
                        >
                          {index + 1}
                        </button>
                        <CommitInput type="number" step="0.001" value={getBpmChangeTimepos(change)} className={changeTableInputClass} onCommit={(value) => {
                            const timepos = parseFloat(value);
                            updateBpmChange(index, { timepos: Number.isFinite(timepos) ? timepos : 0 });
                          }} />
                        <CommitInput type="number" value={change.bpm} className={changeTableInputClass} onCommit={(value) => {
                            updateBpmChange(index, { bpm: parseFloat(value) || 120 });
                          }} />
                        {!isOfficialChartFormat && (
                          <CommitInput type="text" value={change.timeSignature} className={changeTableInputClass} onCommit={(value) => {
                              updateBpmChange(index, { timeSignature: value });
                            }} />
                        )}
                        <div>
                          {index > 0 && (
                            <button onClick={() => {
                              deleteBpmChange(index);
                            }} className="text-red-400 hover:text-red-300">
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  />
                  <button onClick={addBpmChange} className="w-full shrink-0 p-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded text-sm mt-2 transition-colors">{text.sidebar.addBpmChange}</button>
                </div>
              </div>
            </div>
          )}
    </>
  );
}




