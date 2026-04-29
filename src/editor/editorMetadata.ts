export const getTierBadge = (difficulty?: string) => {
  const difficultyText = difficulty?.trim() || '';
  const difficultyValue = Number.parseInt(difficultyText, 10);
  const tier = Number.isFinite(difficultyValue) ? Math.max(0, difficultyValue) : 0;
  const label = tier === 0 ? 'Tier ?' : `Tier ${difficultyText || tier}`;

  if (tier >= 21) {
    return {
      label,
      className: 'border-neutral-500/70 bg-black text-white',
    };
  }
  if (tier >= 16) {
    return {
      label,
      className: 'border-purple-400/50 bg-purple-600 text-white',
    };
  }
  if (tier >= 11) {
    return {
      label,
      className: 'border-red-400/50 bg-red-600 text-white',
    };
  }
  if (tier >= 6) {
    return {
      label,
      className: 'border-yellow-300/70 bg-yellow-300 text-yellow-950',
    };
  }
  if (tier >= 1) {
    return {
      label,
      className: 'border-blue-400/50 bg-blue-600 text-white',
    };
  }

  return {
    label,
    className: 'border-neutral-200 bg-white text-neutral-950',
  };
};
