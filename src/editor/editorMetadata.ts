import { formatTranslation, translations } from '../lang';

export const getTierBadge = (difficulty?: string) => {
  const difficultyText = difficulty?.trim() || '';
  const difficultyValue = Number.parseInt(difficultyText, 10);
  const tier = Number.isFinite(difficultyValue) ? Math.max(0, difficultyValue) : 0;
  const label = tier === 0
    ? translations.editor.tierUnknown
    : formatTranslation(translations.editor.tier, { difficulty: difficultyText || tier });
  const tierText = tier === 0 ? '?' : difficultyText || `${tier}`;

  if (tier >= 21) {
    return {
      label,
      tierText,
      className: 'border-neutral-500/70 bg-black text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]',
    };
  }
  if (tier >= 16) {
    return {
      label,
      tierText,
      className: 'border-purple-300/60 bg-purple-600 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22)]',
    };
  }
  if (tier >= 11) {
    return {
      label,
      tierText,
      className: 'border-red-300/60 bg-red-500 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22)]',
    };
  }
  if (tier >= 6) {
    return {
      label,
      tierText,
      className: 'border-yellow-200/80 bg-yellow-300 text-yellow-950 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]',
    };
  }
  if (tier >= 1) {
    return {
      label,
      tierText,
      className: 'border-sky-200/70 bg-sky-400 text-sky-950 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25)]',
    };
  }

  return {
    label,
    tierText,
    className: 'border-neutral-500/70 bg-black text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]',
  };
};
