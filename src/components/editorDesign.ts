export const getOverlayClassName = (
  isBackdropBlurDisabled: boolean,
  isAnimationDisabled: boolean,
  zIndexClassName = 'z-50',
) => `fixed inset-0 ${zIndexClassName} flex items-center justify-center p-4 ${
  isBackdropBlurDisabled ? 'bg-black/75' : 'bg-black/55 backdrop-blur-md'
} ${isAnimationDisabled ? 'app-animations-disabled' : ''}`;

export const getDialogMotionProps = (isAnimationDisabled: boolean) => (
  isAnimationDisabled
    ? {
      initial: false as const,
      animate: { opacity: 1, y: 0, scale: 1 },
      exit: undefined,
      transition: { duration: 0 },
    }
    : {
      initial: { opacity: 0, y: 28, scale: 0.96 },
      animate: { opacity: 1, y: 0, scale: 1 },
      exit: { opacity: 0, y: 20, scale: 0.96 },
      transition: { type: 'spring' as const, stiffness: 320, damping: 30 },
    }
);

export const getOverlayMotionProps = (isAnimationDisabled: boolean) => (
  isAnimationDisabled
    ? {
      initial: false as const,
      animate: { opacity: 1 },
      exit: undefined,
      transition: { duration: 0 },
    }
    : {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.2 },
    }
);

export const dialogSurfaceClassName = 'flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-neutral-950/90 shadow-2xl shadow-black/50';
export const dialogHeaderClassName = 'border-b border-white/10 bg-gradient-to-br from-neutral-900 to-neutral-950 px-6 py-5';
export const dialogFooterClassName = 'border-t border-white/10 p-4';
export const menuSurfaceClassName = 'rounded-xl border border-white/10 bg-neutral-950/95 p-1 shadow-2xl shadow-black/40';
export const menuItemClassName = 'w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-200 transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:text-neutral-500 disabled:hover:bg-transparent';
