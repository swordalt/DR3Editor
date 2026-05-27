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
export default function EditorLeftMainPanel(props: any) {
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
    infoBadge,
    chartIssuesBadge,
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
  const formatBadgeCount = (count: number) => (
    count > 1000 ? `${Math.floor(count / 1000)}k` : count.toString()
  );
  const renderTabBadge = (badge: { count: number; tone: 'red' | 'yellow' } | null | undefined) => {
    if (!badge) return null;

    const toneClass = badge.tone === 'red'
      ? 'bg-red-500 text-white'
      : 'bg-amber-400 text-neutral-950';

    return (
      <span className={`ml-3 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums ${toneClass}`}>
        {formatBadgeCount(badge.count)}
      </span>
    );
  };

  return (
    <>
      {isLeftPanelContentVisible && activeLeftPanel === 'main' && (
            <div className="p-4 flex flex-col gap-4 h-full overflow-y-auto min-h-0">
              <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">{text.sidebar.generalFunctions}</div>
              <div className="flex flex-col gap-2 flex-1">
                <button 
                  onClick={handleEditInfo}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                >
                  <span className="min-w-0 truncate">{text.sidebar.infoAndFiles}</span>
                  {renderTabBadge(infoBadge)}
                </button>
                <button onClick={() => setActiveLeftPanel('bpmTiming')} className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors">
                  {text.sidebar.bpmTiming}
                </button>
                <button onClick={() => setActiveLeftPanel('speedChanges')} className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors">
                  {text.sidebar.speedChanges}
                </button>
                <button onClick={() => setActiveLeftPanel('curveSpeedChanges')} className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors">
                  {text.sidebar.curveSpeedChanges}
                </button>
                <button onClick={() => setActiveLeftPanel('curveNotes')} className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors">
                  {text.sidebar.curveNotes}
                </button>
                <button onClick={() => setActiveLeftPanel('organize')} className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors">
                  {text.sidebar.organizeNotes}
                </button>
                <button onClick={() => setActiveLeftPanel('history')} className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors">
                  {text.sidebar.operationHistory}
                </button>
                <button
                  onClick={() => {
                    recheckChartIssues();
                    setActiveLeftPanel('chartIssues');
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                >
                  <span className="min-w-0 truncate">{text.sidebar.chartIssues}</span>
                  {renderTabBadge(chartIssuesBadge)}
                </button>
              </div>
              
              <div className="mt-auto pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={handleClearCopiedNotes}
                  disabled={copiedNotesCount === 0}
                  className="mb-4 w-full px-3 py-2 text-sm text-neutral-300 bg-neutral-800 hover:bg-neutral-700 hover:text-white disabled:bg-neutral-900 disabled:text-neutral-600 rounded-lg transition-colors"
                >
                  {text.sidebar.clearClipboard}
                </button>
                <div className="mb-4 border-t border-neutral-800 pt-4">
                  <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">{text.sidebar.currentParent}</div>
                  <input
                    type="number"
                    min="0"
                    value={currentParentInput}
                    placeholder={text.sidebar.auto}
                    className="w-full p-2 text-sm bg-neutral-800 rounded border border-neutral-700 focus:border-indigo-500 outline-none"
                    onChange={(e) => setCurrentParentInput(e.target.value)}
                  />
                  <div className="text-xs text-neutral-400 mt-2">
                    {currentParentNote
                      ? `ID ${currentParentNote.id} | XPos ${formatNoteLane(currentParentNote.lane)} | Type ${NOTE_TYPES[currentParentNote.type]?.name || currentParentNote.type}`
                      : currentParentInput.trim() === ''
                        ? 'Auto-select current ID when placing.'
                        : 'No note exists with that ID.'}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setCurrentParentInput('')}
                      className="flex-1 px-2 py-1.5 text-xs text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded transition-colors"
                    >
                      {text.sidebar.auto}
                    </button>
                    <button
                      onClick={() => {
                        if (selectedSingleNote) {
                          setCurrentParentInput(selectedSingleNote.id.toString());
                        }
                      }}
                      disabled={!canUseSelectedAsParent}
                      className="flex-1 px-2 py-1.5 text-xs text-neutral-300 bg-neutral-800 hover:bg-neutral-700 disabled:bg-neutral-900 disabled:text-neutral-600 rounded transition-colors"
                    >
                      {text.sidebar.useSelected}
                    </button>
                  </div>
                  <div className="text-xs text-neutral-500 mt-2">
                    Current ID: {currentId}
                  </div>
                </div>

                <div className="pt-4 border-t border-neutral-800">
                  <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">{text.sidebar.selectedNote}</div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded shadow-sm border border-neutral-700 flex items-center justify-center" style={{ backgroundColor: NOTE_TYPES[selectedNoteType]?.color || '#3b82f6' }}>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-neutral-300">{NOTE_TYPES[selectedNoteType]?.name || 'Unknown'}</span>
                    <span className="text-xs text-neutral-400">Width: {noteWidth} / 16</span>
                  </div>
                </div>
                </div>
              </div>
            </div>
          )}
    </>
  );
}




