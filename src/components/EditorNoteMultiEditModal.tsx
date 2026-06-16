import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronDown, Plus, Trash2, X } from 'lucide-react';
import { APPEAR_MODE_OPTIONS, CURVE_EASING_OPTIONS } from '../editor/editorViewConstants';
import { formatGroupedIds } from '../editor/editorHistory';
import { NOTE_TYPES } from '../constants/editorConstants';
import { formatTranslation, translations } from '../lang';
import type { Note } from '../types/editorTypes';
import {
  dialogFooterClassName,
  dialogHeaderClassName,
  dialogSurfaceClassName,
  getDialogMotionProps,
  getOverlayClassName,
  getOverlayMotionProps,
  menuItemClassName,
  menuSurfaceClassName,
} from './editorDesign';

export type NoteMultiEditTarget = 'lane' | 'time' | 'speed' | 'width' | 'type' | 'appearMode';
export type NoteMultiEditOperation = 'to' | 'add' | 'multiply';
export type NoteMultiEditConditionField = 'type' | 'lane' | 'time' | 'speed' | 'width' | 'parentId' | 'appearMode';
export type NoteMultiEditConditionOperator = 'equals' | 'notEquals' | 'between' | 'outside' | 'atLeast' | 'atMost' | 'empty' | 'notEmpty';

export interface NoteMultiEditCondition {
  id: string;
  field: NoteMultiEditConditionField;
  operator: NoteMultiEditConditionOperator;
  value: string;
  upperValue: string;
}

export interface NoteMultiEditRequest {
  target: NoteMultiEditTarget;
  lowerValue: string;
  upperValue: string;
  easingId: string;
  operation: NoteMultiEditOperation;
  conditions: NoteMultiEditCondition[];
}

export interface NoteMultiEditResult {
  changedCount: number;
  matchedCount: number;
  message: string;
}

interface EditorNoteMultiEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedNotes: Note[];
  isBackdropBlurDisabled: boolean;
  isAnimationDisabled: boolean;
  onApply: (request: NoteMultiEditRequest) => NoteMultiEditResult;
}

interface NoteMultiEditSelectOption<TValue extends string> {
  id: TValue;
  label: string;
}

interface NoteMultiEditSelectProps<TValue extends string> {
  id: string;
  value: TValue;
  options: Array<NoteMultiEditSelectOption<TValue>>;
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
  onChange: (value: TValue) => void;
  disabled?: boolean;
}

const targetOptions: Array<{ id: NoteMultiEditTarget; label: string }> = [
  { id: 'lane', label: translations.noteMultiEdit.targets.lane },
  { id: 'time', label: translations.noteMultiEdit.targets.time },
  { id: 'speed', label: translations.noteMultiEdit.targets.speed },
  { id: 'width', label: translations.noteMultiEdit.targets.width },
  { id: 'type', label: translations.noteMultiEdit.targets.type },
  { id: 'appearMode', label: translations.noteMultiEdit.targets.appearMode },
];

const operationOptions: Array<{ id: NoteMultiEditOperation; label: string }> = [
  { id: 'to', label: translations.noteMultiEdit.operations.to },
  { id: 'add', label: translations.noteMultiEdit.operations.add },
  { id: 'multiply', label: translations.noteMultiEdit.operations.multiply },
];

const conditionFieldOptions: Array<{ id: NoteMultiEditConditionField; label: string }> = [
  { id: 'type', label: translations.noteMultiEdit.conditionFields.type },
  { id: 'lane', label: translations.noteMultiEdit.conditionFields.lane },
  { id: 'time', label: translations.noteMultiEdit.conditionFields.time },
  { id: 'speed', label: translations.noteMultiEdit.conditionFields.speed },
  { id: 'width', label: translations.noteMultiEdit.conditionFields.width },
  { id: 'parentId', label: translations.noteMultiEdit.conditionFields.parentId },
  { id: 'appearMode', label: translations.noteMultiEdit.conditionFields.appearMode },
];

const conditionOperatorOptions: Array<{ id: NoteMultiEditConditionOperator; label: string }> = [
  { id: 'equals', label: translations.noteMultiEdit.conditionOperators.equals },
  { id: 'notEquals', label: translations.noteMultiEdit.conditionOperators.notEquals },
  { id: 'between', label: translations.noteMultiEdit.conditionOperators.between },
  { id: 'outside', label: translations.noteMultiEdit.conditionOperators.outside },
  { id: 'atLeast', label: translations.noteMultiEdit.conditionOperators.atLeast },
  { id: 'atMost', label: translations.noteMultiEdit.conditionOperators.atMost },
  { id: 'empty', label: translations.noteMultiEdit.conditionOperators.empty },
  { id: 'notEmpty', label: translations.noteMultiEdit.conditionOperators.notEmpty },
];

const createCondition = (): NoteMultiEditCondition => ({
  id: `condition-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  field: 'type',
  operator: 'equals',
  value: '1',
  upperValue: '',
});

const fieldSupportsEmptyOperators = (field: NoteMultiEditConditionField) => (
  field === 'speed' || field === 'parentId' || field === 'appearMode'
);

const getDefaultConditionValue = (field: NoteMultiEditConditionField) => {
  if (field === 'type') return '1';
  if (field === 'appearMode') return 'none';
  return '';
};

const getDefaultConditionOperator = (field: NoteMultiEditConditionField): NoteMultiEditConditionOperator => (
  field === 'appearMode' ? 'equals' : 'equals'
);

const isConditionOperatorAllowed = (field: NoteMultiEditConditionField, operator: NoteMultiEditConditionOperator) => {
  if ((operator === 'empty' || operator === 'notEmpty') && !fieldSupportsEmptyOperators(field)) {
    return false;
  }

  if (field === 'appearMode') {
    return operator === 'equals' || operator === 'notEquals' || operator === 'empty' || operator === 'notEmpty';
  }

  return true;
};

const fieldUsesSelectValue = (field: NoteMultiEditConditionField) => field === 'type' || field === 'appearMode';
const targetUsesNoteTypeValue = (target: NoteMultiEditTarget) => target === 'type';
const targetUsesAppearModeValue = (target: NoteMultiEditTarget) => target === 'appearMode';
const targetUsesNumericValue = (target: NoteMultiEditTarget) => !targetUsesNoteTypeValue(target) && !targetUsesAppearModeValue(target);
const getDefaultTargetValues = (target: NoteMultiEditTarget) => {
  if (target === 'type') return { lowerValue: '1', upperValue: '1' };
  if (target === 'appearMode') return { lowerValue: 'none', upperValue: 'none' };
  if (target === 'width') return { lowerValue: '4', upperValue: '4' };
  return { lowerValue: '0', upperValue: target === 'lane' ? '16' : '0' };
};

const isUpperValueVisible = (operator: NoteMultiEditConditionOperator) => operator === 'between' || operator === 'outside';
const isValueVisible = (operator: NoteMultiEditConditionOperator) => operator !== 'empty' && operator !== 'notEmpty';

function NoteMultiEditSelect<TValue extends string>({
  id,
  value,
  options,
  openMenuId,
  setOpenMenuId,
  onChange,
  disabled = false,
}: NoteMultiEditSelectProps<TValue>) {
  const selectedOption = options.find(option => option.id === value) ?? options[0];
  const isOpen = openMenuId === id;

  return (
    <div className={`relative ${isOpen ? 'z-30' : 'z-0'}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setOpenMenuId(isOpen ? null : id)}
        className="flex min-h-9 w-full items-center justify-between gap-2 rounded border border-neutral-700 bg-neutral-800 px-2.5 py-2 text-left text-sm text-neutral-100 outline-none transition-colors hover:border-neutral-600 hover:bg-neutral-700 focus:border-indigo-500 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-600"
      >
        <span className="min-w-0 truncate">{selectedOption?.label ?? value}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div role="listbox" className={`absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-y-auto ${menuSurfaceClassName}`}>
          {options.map(option => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={option.id === value}
              onClick={() => {
                onChange(option.id);
                setOpenMenuId(null);
              }}
              className={`${menuItemClassName} ${option.id === value ? 'bg-indigo-500/15 text-indigo-100' : ''}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EditorNoteMultiEditModal({
  isOpen,
  onClose,
  selectedNotes,
  isBackdropBlurDisabled,
  isAnimationDisabled,
  onApply,
}: EditorNoteMultiEditModalProps) {
  const text = translations.noteMultiEdit;
  const [target, setTarget] = useState<NoteMultiEditTarget>('lane');
  const [lowerValue, setLowerValue] = useState('0');
  const [upperValue, setUpperValue] = useState('16');
  const [easingId, setEasingId] = useState('linear');
  const [operation, setOperation] = useState<NoteMultiEditOperation>('to');
  const [conditions, setConditions] = useState<NoteMultiEditCondition[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const isNumericTarget = targetUsesNumericValue(target);
  const isAppearModeTarget = targetUsesAppearModeValue(target);
  const effectiveOperation = isAppearModeTarget ? 'to' : operation;
  const noteTypeOptions = useMemo<Array<NoteMultiEditSelectOption<string>>>(() => (
    Object.entries(NOTE_TYPES).map(([type, noteType]) => ({
      id: type,
      label: `${noteType.name} (${type})`,
    }))
  ), []);
  const appearModeOptions = useMemo<Array<NoteMultiEditSelectOption<string>>>(() => (
    APPEAR_MODE_OPTIONS.map(mode => ({
      id: mode,
      label: mode === 'none' ? translations.common.none : mode,
    }))
  ), []);

  const selectedNoteSummary = useMemo(() => {
    if (selectedNotes.length === 0) {
      return text.noNotesSelected;
    }

    return formatTranslation(text.selectedNotes, {
      count: selectedNotes.length,
      ids: formatGroupedIds(selectedNotes.map(note => note.id)),
    });
  }, [selectedNotes, text.noNotesSelected, text.selectedNotes]);

  if (!isOpen) {
    return null;
  }

  const updateCondition = (conditionId: string, updates: Partial<NoteMultiEditCondition>) => {
    setConditions(currentConditions => currentConditions.map(condition => (
      condition.id === conditionId
        ? (() => {
          const nextField = updates.field ?? condition.field;
          const nextOperator = updates.operator ?? condition.operator;
          const shouldResetFieldValue = updates.field !== undefined && updates.field !== condition.field;

          return {
            ...condition,
            ...updates,
            operator: isConditionOperatorAllowed(nextField, nextOperator)
              ? nextOperator
              : getDefaultConditionOperator(nextField),
            value: shouldResetFieldValue ? getDefaultConditionValue(nextField) : updates.value ?? condition.value,
            upperValue: shouldResetFieldValue ? '' : updates.upperValue ?? condition.upperValue,
          };
        })()
        : condition
    )));
  };

  const updateTarget = (nextTarget: NoteMultiEditTarget) => {
    const defaultValues = getDefaultTargetValues(nextTarget);
    setTarget(nextTarget);
    setLowerValue(defaultValues.lowerValue);
    setUpperValue(defaultValues.upperValue);
    if (nextTarget === 'appearMode') {
      setOperation('to');
    }
    setOpenMenuId(null);
    setStatusMessage('');
  };

  const applyEdit = () => {
    if (isNumericTarget && (!Number.isFinite(Number(lowerValue)) || !Number.isFinite(Number(upperValue)))) {
      setStatusMessage(text.invalidRange);
      return;
    }

    const result = onApply({
      target,
      lowerValue,
      upperValue,
      easingId,
      operation: effectiveOperation,
      conditions,
    });
    setStatusMessage(result.message);
  };

  return (
    <motion.div
      className={`${getOverlayClassName(isBackdropBlurDisabled, isAnimationDisabled, 'z-[65]')} text-neutral-100`}
      {...getOverlayMotionProps(isAnimationDisabled)}
      onMouseDown={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-multi-edit-title"
        className={`relative max-h-[92vh] w-full max-w-4xl ${dialogSurfaceClassName}`}
        {...getDialogMotionProps(isAnimationDisabled)}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={`${dialogHeaderClassName} flex items-start justify-between gap-4`}>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-300">{text.title}</div>
            <h2 id="note-multi-edit-title" className="mt-1 text-xl font-semibold text-white">
              {text.heading}
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              {text.description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
            aria-label={text.close}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          <section className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-neutral-100">{text.editGroup}</div>
                <div className="mt-1 text-xs text-neutral-500">{text.editGroupDescription}</div>
              </div>
              <div className="rounded border border-indigo-400/40 bg-indigo-950/80 px-3 py-2 text-xs font-semibold text-indigo-100">
                {selectedNoteSummary}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]">
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-400">{text.target}</span>
                <NoteMultiEditSelect
                  id="target"
                  value={target}
                  options={targetOptions}
                  openMenuId={openMenuId}
                  setOpenMenuId={setOpenMenuId}
                  onChange={updateTarget}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-400">{text.lowerValue}</span>
                {targetUsesNoteTypeValue(target) ? (
                  <NoteMultiEditSelect
                    id="lower-note-type"
                    value={lowerValue}
                    options={noteTypeOptions}
                    openMenuId={openMenuId}
                    setOpenMenuId={setOpenMenuId}
                    onChange={setLowerValue}
                  />
                ) : targetUsesAppearModeValue(target) ? (
                  <NoteMultiEditSelect
                    id="lower-appear-mode"
                    value={lowerValue}
                    options={appearModeOptions}
                    openMenuId={openMenuId}
                    setOpenMenuId={setOpenMenuId}
                    onChange={setLowerValue}
                  />
                ) : (
                  <input
                    type="number"
                    value={lowerValue}
                    onChange={(event) => setLowerValue(event.target.value)}
                    className="w-full rounded border border-neutral-700 bg-neutral-800 p-2 text-sm outline-none focus:border-indigo-500"
                  />
                )}
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-400">{text.upperValue}</span>
                {targetUsesNoteTypeValue(target) ? (
                  <NoteMultiEditSelect
                    id="upper-note-type"
                    value={upperValue}
                    options={noteTypeOptions}
                    openMenuId={openMenuId}
                    setOpenMenuId={setOpenMenuId}
                    onChange={setUpperValue}
                  />
                ) : targetUsesAppearModeValue(target) ? (
                  <NoteMultiEditSelect
                    id="upper-appear-mode"
                    value={upperValue}
                    options={appearModeOptions}
                    openMenuId={openMenuId}
                    setOpenMenuId={setOpenMenuId}
                    onChange={setUpperValue}
                  />
                ) : (
                  <input
                    type="number"
                    value={upperValue}
                    onChange={(event) => setUpperValue(event.target.value)}
                    className="w-full rounded border border-neutral-700 bg-neutral-800 p-2 text-sm outline-none focus:border-indigo-500"
                  />
                )}
              </label>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-400">{text.easing}</span>
                <NoteMultiEditSelect
                  id="easing"
                  value={easingId}
                  options={CURVE_EASING_OPTIONS}
                  openMenuId={openMenuId}
                  setOpenMenuId={setOpenMenuId}
                  onChange={setEasingId}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-400">{text.operation}</span>
                <NoteMultiEditSelect
                  id="operation"
                  value={effectiveOperation}
                  options={operationOptions}
                  openMenuId={openMenuId}
                  setOpenMenuId={setOpenMenuId}
                  onChange={setOperation}
                  disabled={isAppearModeTarget}
                />
              </label>
            </div>
          </section>

          <section className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-neutral-100">{text.conditions}</div>
                <div className="mt-1 text-xs text-neutral-500">{text.conditionsDescription}</div>
              </div>
              <button
                type="button"
                onClick={() => setConditions(currentConditions => [...currentConditions, createCondition()])}
                className="inline-flex items-center gap-2 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
              >
                <Plus className="h-4 w-4" />
                {text.addCondition}
              </button>
            </div>

            {conditions.length === 0 ? (
              <div className="rounded border border-dashed border-neutral-800 bg-neutral-900/40 p-4 text-sm text-neutral-500">
                {text.noConditions}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {conditions.map(condition => {
                  const operatorOptions = conditionOperatorOptions.filter(option => (
                    isConditionOperatorAllowed(condition.field, option.id)
                  ));
                  const showValue = isValueVisible(condition.operator);
                  const showUpperValue = isUpperValueVisible(condition.operator);

                  return (
                    <div key={condition.id} className="grid gap-2 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2.25rem]">
                      <label className="block">
                        <span className="mb-1 block text-xs text-neutral-400">{text.conditionField}</span>
                        <NoteMultiEditSelect
                          id={`${condition.id}-field`}
                          value={condition.field}
                          options={conditionFieldOptions}
                          openMenuId={openMenuId}
                          setOpenMenuId={setOpenMenuId}
                          onChange={(field) => updateCondition(condition.id, { field })}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-neutral-400">{text.conditionOperator}</span>
                        <NoteMultiEditSelect
                          id={`${condition.id}-operator`}
                          value={condition.operator}
                          options={operatorOptions}
                          openMenuId={openMenuId}
                          setOpenMenuId={setOpenMenuId}
                          onChange={(operator) => updateCondition(condition.id, { operator })}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-neutral-400">{text.conditionValue}</span>
                        {showValue && fieldUsesSelectValue(condition.field) ? (
                          <NoteMultiEditSelect
                            id={`${condition.id}-value`}
                            value={condition.value}
                            options={condition.field === 'type' ? noteTypeOptions : appearModeOptions}
                            openMenuId={openMenuId}
                            setOpenMenuId={setOpenMenuId}
                            onChange={(value) => updateCondition(condition.id, { value })}
                          />
                        ) : (
                          <input
                            type={showValue ? 'text' : 'hidden'}
                            value={condition.value}
                            onChange={(event) => updateCondition(condition.id, { value: event.target.value })}
                            disabled={!showValue}
                            className="w-full rounded border border-neutral-700 bg-neutral-800 p-2 text-sm outline-none focus:border-indigo-500 disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-600"
                          />
                        )}
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-neutral-400">{text.conditionUpperValue}</span>
                        <input
                          type={showUpperValue ? 'text' : 'hidden'}
                          value={condition.upperValue}
                          onChange={(event) => updateCondition(condition.id, { upperValue: event.target.value })}
                          disabled={!showUpperValue}
                          className="w-full rounded border border-neutral-700 bg-neutral-800 p-2 text-sm outline-none focus:border-indigo-500 disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-600"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setConditions(currentConditions => currentConditions.filter(currentCondition => currentCondition.id !== condition.id))}
                        className="mt-5 inline-flex h-9 w-9 items-center justify-center rounded border border-neutral-700 bg-neutral-800 text-neutral-400 transition-colors hover:bg-red-500/20 hover:text-red-200"
                        aria-label={text.removeCondition}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className={`${dialogFooterClassName} flex flex-wrap items-center justify-between gap-3`}>
          <div className="min-h-5 text-xs text-neutral-400">{statusMessage}</div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-semibold text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
            >
              {translations.common.cancel}
            </button>
            <button
              type="button"
              onClick={applyEdit}
              disabled={selectedNotes.length === 0}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
            >
              {text.applyToSelectedNotes}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
