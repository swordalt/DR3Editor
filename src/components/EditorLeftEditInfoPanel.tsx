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
import type { MetadataField } from '../editor/metadataValidation';
export default function EditorLeftEditInfoPanel(props: any) {
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
    invalidMetadataFields,
    showMetadataFieldValidation,
    handleMetadataFieldKeyDown,
    illustrationPreview,
    chartProjectFiles,
    isChartProjectFilesPending,
    onPreviewProjectFile,
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
  const getMetadataInputClassName = (field: MetadataField) => (
    `w-full p-2 text-sm bg-neutral-800 rounded border outline-none ${invalidMetadataFields[field] ? 'border-red-500 focus:border-red-400' : 'border-neutral-700 focus:border-indigo-500'}`
  );

  return (
    <>
      {isLeftPanelContentVisible && activeLeftPanel === 'editInfo' && (
            <div className="p-4 flex flex-col h-full overflow-hidden min-h-0">
              <div className="flex items-center gap-2 mb-4 shrink-0">
                <button onClick={() => setActiveLeftPanel('main')} className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">{text.sidebar.editInfo}</div>
              </div>
              <div className="flex flex-col gap-3 overflow-y-auto flex-1 pr-1 pb-4">
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">{text.modal.songIdRequired}</label>
                  <input
                    type="text"
                    value={formData.songId}
                    required
                    className={getMetadataInputClassName('songId')}
                    onBlur={() => showMetadataFieldValidation('songId')}
                    onKeyDown={(event) => handleMetadataFieldKeyDown('songId', event)}
                    onChange={(e) => setFormData({...formData, songId: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">{text.modal.songName}</label>
                  <input type="text" value={formData.songName} className="w-full p-2 text-sm bg-neutral-800 rounded border border-neutral-700 focus:border-indigo-500 outline-none" onChange={(e) => setFormData({...formData, songName: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">{text.modal.songArtist}</label>
                  <input type="text" value={formData.songArtist} className="w-full p-2 text-sm bg-neutral-800 rounded border border-neutral-700 focus:border-indigo-500 outline-none" onChange={(e) => setFormData({...formData, songArtist: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">{text.modal.difficultyRequired}</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formData.difficulty}
                    required
                    className={getMetadataInputClassName('difficulty')}
                    onBlur={() => showMetadataFieldValidation('difficulty')}
                    onKeyDown={(event) => handleMetadataFieldKeyDown('difficulty', event)}
                    onChange={(e) => setFormData({...formData, difficulty: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">{text.sidebar.audioFileRequired}</label>
                  <label
                    className={`flex flex-col items-center justify-center w-full h-12 border-2 border-dashed rounded cursor-pointer hover:border-indigo-500 hover:bg-neutral-800/50 transition-colors ${invalidMetadataFields.songFile ? 'border-red-500' : 'border-neutral-700'}`}
                    tabIndex={0}
                    onBlur={() => showMetadataFieldValidation('songFile')}
                  >
                    <p className="text-xs text-neutral-400 truncate w-full px-2 text-center">
                      {formData.songFile ? <span className="font-semibold text-indigo-400">{formData.songFile.name}</span> : <span>{text.sidebar.uploadAudio}</span>}
                    </p>
                    <input type="file" accept="audio/*" required className="hidden" onChange={(e) => setFormData({...formData, songFile: e.target.files?.[0] || null})} />
                  </label>
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">{text.sidebar.illustration}</label>
                  <label className="group flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-neutral-700 rounded cursor-pointer hover:border-indigo-500 hover:bg-neutral-800/50 transition-colors relative overflow-hidden">
                    {illustrationPreview && (
                      <>
                        <img src={illustrationPreview} alt={text.sidebar.previewImageAlt} className="absolute inset-0 w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-neutral-900/70 group-hover:bg-neutral-900/50 transition-colors" />
                      </>
                    )}
                    <p className="text-xs text-neutral-300 truncate w-full px-2 text-center relative z-10">
                      {formData.songIllustration ? <span className="font-semibold text-indigo-300">{formData.songIllustration.name}</span> : <span>{text.sidebar.uploadImage}</span>}
                    </p>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => setFormData({...formData, songIllustration: e.target.files?.[0] || null})} />
                  </label>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="block text-xs text-neutral-400">{text.sidebar.availableFiles}</label>
                    <span className="text-[11px] text-neutral-500">{`${chartProjectFiles.length} files`}</span>
                  </div>
                  <div className="overflow-hidden rounded border border-neutral-800 bg-neutral-900/60">
                    {chartProjectFiles.map((file) => {
                      const { id, label, name, detail, Icon } = file;

                      return (
                      <div key={`${id}-${name}`} className="flex items-center gap-3 border-b border-neutral-800 px-3 py-2 last:border-b-0">
                        <button
                          type="button"
                          onClick={() => onPreviewProjectFile(file)}
                          className="flex min-w-0 flex-1 items-center gap-3 rounded text-left transition-colors hover:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <Icon className="h-4 w-4 shrink-0 text-neutral-500" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-medium text-neutral-300">{label}</span>
                            <span className="block truncate text-xs text-neutral-500" title={name}>{name}</span>
                          </span>
                        </button>
                        <div className="shrink-0 text-[11px] text-neutral-500">
                          {detail || (id === 'chart' && isChartProjectFilesPending ? text.sidebar.projectFilesUpdating : '')}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
                <button onClick={handleConfirm} className="w-full p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-semibold mt-2 transition-colors shrink-0">{text.sidebar.saveChanges}</button>
              </div>
            </div>
          )}
    </>
  );
}




