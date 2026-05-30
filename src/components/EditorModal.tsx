import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { EditorFormData } from '../types/editorTypes';
import { translations } from '../lang';
import {
  getInvalidMetadataFields,
  hasInvalidMetadataFields,
  type MetadataField,
  type MetadataInvalidFields,
} from '../editor/metadataValidation';
import { stripInputWhitespace } from '../utils/inputSanitization';

interface EditorModalProps {
  isOpen: boolean;
  isBackdropBlurDisabled: boolean;
  isAnimationDisabled: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  isConfirming?: boolean;
  formData: EditorFormData;
  setFormData: (data: EditorFormData) => void;
  invalidMetadataFields: MetadataInvalidFields;
  showMetadataFieldValidation: (field: MetadataField) => void;
  handleMetadataFieldKeyDown: (field: MetadataField, event: React.KeyboardEvent<HTMLInputElement>) => void;
}

export default function EditorModal({
  isOpen,
  isBackdropBlurDisabled,
  isAnimationDisabled,
  onClose,
  onConfirm,
  isConfirming = false,
  formData,
  setFormData,
  invalidMetadataFields,
  showMetadataFieldValidation,
  handleMetadataFieldKeyDown,
}: EditorModalProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const illustrationInputRef = React.useRef<HTMLInputElement>(null);
  const text = translations;
  const isConfirmDisabled = isConfirming || hasInvalidMetadataFields(getInvalidMetadataFields(formData));
  const getInputClassName = (field: MetadataField) => (
    `w-full p-3 bg-neutral-800 rounded-lg border outline-none transition-colors ${invalidMetadataFields[field] ? 'border-red-500 focus:border-red-400' : 'border-neutral-700 focus:border-indigo-500'}`
  );
  const sanitizeMetadataField = (field: keyof Pick<EditorFormData, 'songId' | 'songName' | 'songArtist' | 'songBpm' | 'difficulty'>) => {
    setFormData({ ...formData, [field]: stripInputWhitespace(formData[field]) });
  };
  const commitValidatedMetadataField = (field: MetadataField) => {
    sanitizeMetadataField(field);
    showMetadataFieldValidation(field);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleIllustrationUploadClick = () => {
    illustrationInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData({ ...formData, songFile: e.target.files[0] });
    }
  };

  const handleIllustrationFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, songIllustration: e.target.files?.[0] || null });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${isBackdropBlurDisabled ? 'bg-black/75' : 'bg-black/60 backdrop-blur-sm'} ${isAnimationDisabled ? 'app-animations-disabled' : ''}`}>
          <motion.div
            initial={isAnimationDisabled ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={isAnimationDisabled ? undefined : { opacity: 0, scale: 0.9 }}
            transition={{ duration: isAnimationDisabled ? 0 : 0.2 }}
            className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">
                {text.modal.newProjectDetails}
              </h2>
            </div>
            <div className="space-y-4">
              <input
                type="text"
                placeholder={text.modal.songIdRequired}
                value={formData.songId}
                required
                className={getInputClassName('songId')}
                onBlur={() => commitValidatedMetadataField('songId')}
                onKeyDown={(event) => handleMetadataFieldKeyDown('songId', event)}
                onChange={(e) => setFormData({...formData, songId: e.target.value})}
              />
              <input type="text" placeholder={text.modal.songName} value={formData.songName} className="w-full p-3 bg-neutral-800 rounded-lg border border-neutral-700 focus:border-indigo-500 outline-none transition-colors" onBlur={() => sanitizeMetadataField('songName')} onChange={(e) => setFormData({...formData, songName: e.target.value})} />
              <input type="text" placeholder={text.modal.songArtist} value={formData.songArtist} className="w-full p-3 bg-neutral-800 rounded-lg border border-neutral-700 focus:border-indigo-500 outline-none transition-colors" onBlur={() => sanitizeMetadataField('songArtist')} onChange={(e) => setFormData({...formData, songArtist: e.target.value})} />
              <input
                type="text"
                inputMode="decimal"
                placeholder={text.modal.songBpmRequired}
                value={formData.songBpm}
                required
                className={getInputClassName('songBpm')}
                onBlur={() => commitValidatedMetadataField('songBpm')}
                onKeyDown={(event) => handleMetadataFieldKeyDown('songBpm', event)}
                onChange={(e) => setFormData({...formData, songBpm: e.target.value})}
              />
              <input
                type="text"
                inputMode="numeric"
                placeholder={text.modal.difficultyRequired}
                value={formData.difficulty}
                required
                className={getInputClassName('difficulty')}
                onBlur={() => commitValidatedMetadataField('difficulty')}
                onKeyDown={(event) => handleMetadataFieldKeyDown('difficulty', event)}
                onChange={(e) => setFormData({...formData, difficulty: e.target.value})}
              />
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleUploadClick}
                  onBlur={() => showMetadataFieldValidation('songFile')}
                  className={`p-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg border transition-colors w-full text-left ${invalidMetadataFields.songFile ? 'border-red-500' : 'border-neutral-700'}`}
                >
                  {formData.songFile ? formData.songFile.name : text.modal.selectAudioRequired}
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="audio/*" 
                  required
                  className="hidden" 
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleIllustrationUploadClick}
                  className="p-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg border border-neutral-700 transition-colors w-full text-left"
                >
                  {formData.songIllustration ? formData.songIllustration.name : text.modal.selectIllustration}
                </button>
                <input
                  type="file"
                  ref={illustrationInputRef}
                  onChange={handleIllustrationFileChange}
                  accept="image/*"
                  className="hidden"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button onClick={onClose} className="w-full p-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg font-semibold transition-colors">
                  {text.modal.returnToLanding}
                </button>
                <button
                  onClick={onConfirm}
                  disabled={isConfirmDisabled}
                  className="w-full p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                >
                  {isConfirming ? 'Converting...' : text.common.confirm}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
