import { ArrowLeft, X } from 'lucide-react';
import CommitInput from './CommitInput';
import VirtualizedChangeList from './VirtualizedChangeList';
import { AVAILABLE_NOTE_TYPES, NOTE_TYPES, UNKNOWN_NOTE_TYPE, canTypeHaveParent } from '../constants/editorConstants';
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
import { formatTime, getBpmChangeTimepos } from '../utils/editorUtils';
import { stripInputWhitespace } from '../utils/inputSanitization';
import { formatTranslation, translations } from '../lang';
import type { CurveEasingFamily, CurveEasingType } from '../editor/editorLocalTypes';
export default function EditorLeftCurvePanel(props: any) {
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
    curveStartIdInput,
    setCurveStartIdInput,
    curveEndIdInput,
    setCurveEndIdInput,
    curveIdSelectTarget,
    setCurveIdSelectTarget,
    curveStartNote,
    curveEndNote,
    curveNoteType,
    setCurveNoteType,
    timedBpmChanges,
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
      {isLeftPanelContentVisible && activeLeftPanel === 'curveNotes' && (
            <div className="p-4 flex flex-col h-full overflow-hidden min-h-0">
              <div className="flex items-center gap-2 mb-4 shrink-0">
                <button onClick={() => setActiveLeftPanel('main')} className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">{text.sidebar.curveNotes}</div>
              </div>
              <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1 pb-4">
                <label className="block">
                  <span className="mb-1 block text-xs text-neutral-400">{text.sidebar.startId}</span>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={curveStartIdInput}
                      className={`${notePropertyInputClass} min-w-0 flex-1`}
                      onChange={(e) => {
                        setCurveStartIdInput(e.target.value);
                        setCurveNotesMessage('');
                      }}
                      onBlur={() => setCurveStartIdInput(stripInputWhitespace(curveStartIdInput))}
                    />
                    <button
                      type="button"
                      disabled={curveIdSelectTarget === 'end'}
                      onClick={() => {
                        const nextTarget = curveIdSelectTarget === 'start' ? null : 'start';
                        setCurveIdSelectTarget(nextTarget);
                        setCurveNotesMessage(nextTarget ? text.sidebar.clickNoteToSetStartId : '');
                      }}
                      className={`shrink-0 rounded border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-600 ${
                        curveIdSelectTarget === 'start'
                          ? 'border-indigo-500 bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'
                      }`}
                    >
                      {curveIdSelectTarget === 'start' ? text.common.cancel : text.common.select}
                    </button>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {curveStartNote
                        ? formatTranslation(text.sidebar.noteAtTime, {
                          noteName: NOTE_TYPES[curveStartNote.type]?.name || UNKNOWN_NOTE_TYPE.name,
                          time: formatTime(curveStartNote.time, timedBpmChanges),
                        })
                      : curveStartIdInput.trim() === ''
                        ? text.sidebar.enterExistingNoteId
                        : text.sidebar.noNoteExistsWithThatId}
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-neutral-400">{text.sidebar.endId}</span>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={curveEndIdInput}
                      className={`${notePropertyInputClass} min-w-0 flex-1`}
                      onChange={(e) => {
                        setCurveEndIdInput(e.target.value);
                        setCurveNotesMessage('');
                      }}
                      onBlur={() => setCurveEndIdInput(stripInputWhitespace(curveEndIdInput))}
                    />
                    <button
                      type="button"
                      disabled={curveIdSelectTarget === 'start'}
                      onClick={() => {
                        const nextTarget = curveIdSelectTarget === 'end' ? null : 'end';
                        setCurveIdSelectTarget(nextTarget);
                        setCurveNotesMessage(nextTarget ? text.sidebar.clickNoteToSetEndId : '');
                      }}
                      className={`shrink-0 rounded border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-600 ${
                        curveIdSelectTarget === 'end'
                          ? 'border-indigo-500 bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'
                      }`}
                    >
                      {curveIdSelectTarget === 'end' ? text.common.cancel : text.common.select}
                    </button>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {curveEndNote
                        ? formatTranslation(text.sidebar.noteAtTime, {
                          noteName: NOTE_TYPES[curveEndNote.type]?.name || UNKNOWN_NOTE_TYPE.name,
                          time: formatTime(curveEndNote.time, timedBpmChanges),
                        })
                      : curveEndIdInput.trim() === ''
                        ? text.sidebar.enterExistingNoteId
                        : text.sidebar.noNoteExistsWithThatId}
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-neutral-400">{text.sidebar.type}</span>
                  <select
                    value={curveNoteType}
                    className={notePropertyInputClass}
                    onChange={(e) => {
                      setCurveNoteType(Number(e.target.value));
                      setCurveNotesMessage('');
                    }}
                  >
                    {AVAILABLE_NOTE_TYPES.map(type => (
                      <option key={type} value={type}>
                        {type} - {NOTE_TYPES[type]?.name || UNKNOWN_NOTE_TYPE.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs text-neutral-400">{text.sidebar.density}</span>
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-sm text-neutral-400">1/</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={curveDensityInput}
                      className={`${notePropertyInputClass} min-w-0 flex-1`}
                      onChange={(e) => {
                        setCurveDensityInput(e.target.value);
                        setCurveNotesMessage('');
                      }}
                      onBlur={() => setCurveDensityInput(stripInputWhitespace(curveDensityInput))}
                    />
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {curveDensityInput.trim() === ''
                      ? text.sidebar.enterDenominator
                      : hasValidCurveDensity
                        ? formatTranslation(text.sidebar.snapDensity, { density: parsedCurveDensity })
                        : text.sidebar.densityPositiveWholeNumber}
                  </div>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block min-w-0">
                    <span className="mb-1 block text-xs text-neutral-400">{text.sidebar.easing}</span>
                    <select
                      value={curveEasingFamily}
                      className={`${notePropertyInputClass} min-w-0`}
                      onChange={(e) => {
                        setCurveEasingFamily(e.target.value as CurveEasingFamily);
                        setCurveNotesMessage('');
                      }}
                    >
                      {CURVE_EASING_FAMILY_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block min-w-0">
                    <span className="mb-1 block text-xs text-neutral-400">{text.sidebar.type}</span>
                    <select
                      value={curveEasingType}
                      className={`${notePropertyInputClass} min-w-0`}
                      disabled={curveEasingFamily === 'linear'}
                      onChange={(e) => {
                        setCurveEasingType(e.target.value as CurveEasingType);
                        setCurveNotesMessage('');
                      }}
                    >
                      {CURVE_EASING_TYPE_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleGenerateCurveNotes}
                  disabled={!canGenerateCurveNotes}
                  className="mt-1 w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                >
                  {text.sidebar.generateCurveNotes}
                </button>

                <p className="text-xs leading-5 text-neutral-500">
                  {text.sidebar.curveNotesDescription}
                </p>

                {canTypeHaveParent(curveNoteType) && (
                  <p className="text-xs leading-5 text-neutral-500">
                    {text.sidebar.curveNotesParentDescription}
                  </p>
                )}

                {curveNotesMessage && (
                  <div className="rounded border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs leading-5 text-neutral-400">
                    {curveNotesMessage}
                  </div>
                )}
              </div>
            </div>
          )}
    </>
  );
}




