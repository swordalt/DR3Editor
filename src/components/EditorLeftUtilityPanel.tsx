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
import type { CurveEasingFamily, CurveEasingType } from '../editor/editorLocalTypes';
export default function EditorLeftUtilityPanel(props: any) {
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
    selectedNotesSorted,
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

  return (
    <>
      {isLeftPanelContentVisible && ['organize', 'history', 'chartIssues'].includes(activeLeftPanel) && (
            <div className="p-4 flex flex-col h-full overflow-hidden min-h-0">
              <div className="flex items-center gap-2 mb-4 shrink-0">
                <button onClick={() => setActiveLeftPanel('main')} className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  {activeLeftPanel === 'organize' ? 'Organize' : activeLeftPanel === 'chartIssues' ? 'Chart Issues' : 'History'}
                </div>
              </div>
              {activeLeftPanel === 'organize' ? (
                <div className="flex-1">
                  <button
                    type="button"
                    onClick={handleOrganizeNotes}
                    disabled={notes.length === 0 || isOrganizingNotes}
                    className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                  >
                    {isOrganizingNotes ? 'Organizing...' : 'Organize Notes'}
                  </button>
                  <p className="mt-2 text-xs leading-5 text-neutral-500">
                    Reassigns note IDs from earliest to latest timepos, then left to right by xpos. Notes sharing the same timepos and xpos keep their original ID order, and parent links are remapped to stay grouped with their children.
                  </p>
                </div>
              ) : activeLeftPanel === 'chartIssues' ? (
                <div className="flex min-h-0 flex-1 flex-col gap-3">
                  <button
                    type="button"
                    onClick={recheckChartIssues}
                    className="w-full shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
                  >
                    Recheck Chart Issues
                  </button>

                  <div className="shrink-0 rounded border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs leading-5 text-neutral-400">
                    Initial scan found <span className="font-semibold text-neutral-200">{chartIssues.length}</span> potential {chartIssues.length === 1 ? 'issue' : 'issues'}.
                  </div>

                  {chartIssues.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-neutral-800 p-4 text-center text-sm text-neutral-600">
                      No chart issues found
                    </div>
                  ) : (
                    <VirtualizedChangeList
                      items={chartIssues}
                      rowHeight={124}
                      overscan={8}
                      getKey={(issue) => issue.id}
                      className="min-h-0 flex-1 pr-1"
                      renderRow={(issue, _index, style) => (
                        <div style={style} className="pb-2">
                          <div className="flex h-[116px] flex-col rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 truncate text-sm font-medium text-amber-100">
                                {issue.title}
                              </div>
                              <span className="shrink-0 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-200">
                                {issue.category}
                              </span>
                            </div>
                            <div className="mt-1 max-h-12 overflow-hidden break-words text-xs leading-5 text-neutral-300">
                              {issue.detail}
                            </div>
                            <div className="mt-auto flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                              <span>#{issue.id}</span>
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate">
                                  Notes {formatGroupedIds(issue.noteIds)}
                                </span>
                                <button
                                  type="button"
                                  disabled={issue.timepos === null}
                                  onClick={() => {
                                    if (issue.timepos !== null) {
                                      jumpToNoteTime(getTimeFromTimepos(issue.timepos));
                                    }
                                  }}
                                  className="shrink-0 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-[11px] font-medium text-neutral-300 transition-colors hover:border-indigo-500 hover:bg-indigo-600 hover:text-white disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-950 disabled:text-neutral-700"
                                >
                                  Jump
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    />
                  )}
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-3">
                  <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-neutral-400">
                    <input
                      type="checkbox"
                      checked={shouldShowUndoneOperations}
                      onChange={(event) => setShouldShowUndoneOperations(event.target.checked)}
                      className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 accent-indigo-500"
                    />
                    Show Undone Operations
                  </label>

                  {operationHistory.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-neutral-800 p-4 text-center text-sm text-neutral-600">
                      No operations recorded yet
                    </div>
                  ) : visibleOperationHistory.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-neutral-800 p-4 text-center text-sm text-neutral-600">
                      Undone operations are hidden
                    </div>
                  ) : (
                    <VirtualizedChangeList
                      items={visibleOperationHistory}
                      rowHeight={116}
                      overscan={8}
                      getKey={(entry) => entry.id}
                      className="min-h-0 flex-1 pr-1"
                      renderRow={(entry, _index, style) => {
                        const isUndone = undoneOperationIds.has(entry.id);

                        return (
                          <div style={style} className="pb-2">
                            <div className={`flex h-[108px] flex-col rounded-lg border p-3 ${isUndone ? 'border-neutral-800 bg-neutral-950/20 opacity-55' : 'border-neutral-800 bg-neutral-950/40'}`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className={`min-w-0 truncate text-sm font-medium ${isUndone ? 'text-neutral-500' : 'text-neutral-200'}`}>
                                  {entry.title}
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                  {isUndone && (
                                    <span className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-neutral-500">
                                      Undone
                                    </span>
                                  )}
                                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${isUndone ? 'border-neutral-700 bg-neutral-900 text-neutral-500' : operationCategoryStyles[entry.category]}`}>
                                    {entry.category}
                                  </span>
                                </div>
                              </div>
                              <div className={`mt-1 max-h-10 overflow-hidden break-words text-xs leading-5 ${isUndone ? 'text-neutral-600' : 'text-neutral-400'}`}>
                                {entry.detail}
                              </div>
                              <div className="mt-auto flex items-center justify-between text-[11px] text-neutral-600">
                                <span>#{entry.id}</span>
                                <time dateTime={new Date(entry.timestamp).toISOString()}>
                                  {formatHistoryTimestamp(entry.timestamp)}
                                </time>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          )}
    </>
  );
}



