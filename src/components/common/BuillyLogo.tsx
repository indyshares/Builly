import React from 'react';
import { DeviceMode } from '../../types/builder';

export const BUILLY_LOGO_ASSETS = {
  full: '/full_logo.webp',
  iconName: '/icon_name.webp',
  icon: '/icon.webp',
  favicon: '/favicon.ico',
} as const;

export type BuillyLogoVariant = 'full' | 'icon_name' | 'icon';
export type BuillyLogoSize = 'sm' | 'md' | 'lg';

export interface BuillyLogoProps {
  /**
   * Responsive / viewport mode:
   * - 'desktop'    -> /full_logo.webp
   * - 'tablet'     -> /icon_name.webp
   * - 'mobile'     -> /icon.webp
   * - 'responsive' -> /full_logo.webp (lg+), /icon_name.webp (sm..lg), /icon.webp (<sm)
   */
  mode?: DeviceMode | 'responsive';
  /**
   * Optional explicit variant override when a fixed asset is required
   * regardless of viewport width (e.g., full_logo.webp in Footer).
   */
  variant?: BuillyLogoVariant;
  size?: BuillyLogoSize;
  theme?: 'light' | 'dark';
  className?: string;
}

const SIZE_CLASSES: Record<BuillyLogoSize, Record<BuillyLogoVariant, string>> = {
  sm: {
    full: 'h-6 w-auto',
    icon_name: 'h-5 w-auto',
    icon: 'h-6 w-6',
  },
  md: {
    full: 'h-7 w-auto',
    icon_name: 'h-6 w-auto',
    icon: 'h-7 w-7',
  },
  lg: {
    full: 'h-8 w-auto',
    icon_name: 'h-7 w-auto',
    icon: 'h-8 w-8',
  },
};

const VARIANT_SRC: Record<BuillyLogoVariant, string> = {
  full: BUILLY_LOGO_ASSETS.full,
  icon_name: BUILLY_LOGO_ASSETS.iconName,
  icon: BUILLY_LOGO_ASSETS.icon,
};

export const BuillyLogo: React.FC<BuillyLogoProps> = ({
  mode = 'responsive',
  variant,
  size = 'md',
  theme = 'light',
  className = '',
}) => {
  const renderVariant = (v: BuillyLogoVariant, visibilityClass = 'inline-flex') => (
    <span
      className={`${visibilityClass} items-center shrink-0 ${
        theme === 'dark' ? 'bg-white/95 rounded-lg px-2 py-1 shadow-xs' : ''
      }`}
    >
      <img
        src={VARIANT_SRC[v]}
        alt="Builly"
        decoding="async"
        className={`${SIZE_CLASSES[size][v]} object-contain block shrink-0 select-none`}
      />
    </span>
  );

  if (variant) {
    return (
      <div className={`inline-flex items-center shrink-0 ${className}`}>
        {renderVariant(variant)}
      </div>
    );
  }

  if (mode === 'desktop') {
    return (
      <div className={`inline-flex items-center shrink-0 ${className}`}>
        {renderVariant('full')}
      </div>
    );
  }

  if (mode === 'tablet') {
    return (
      <div className={`inline-flex items-center shrink-0 ${className}`}>
        {renderVariant('icon_name')}
      </div>
    );
  }

  if (mode === 'mobile') {
    return (
      <div className={`inline-flex items-center shrink-0 ${className}`}>
        {renderVariant('icon')}
      </div>
    );
  }

  // Responsive mode across standard breakpoints: only a single variant is visible at any width
  return (
    <div className={`inline-flex items-center shrink-0 ${className}`}>
      {renderVariant('full', 'hidden lg:inline-flex')}
      {renderVariant('icon_name', 'hidden sm:inline-flex lg:hidden')}
      {renderVariant('icon', 'inline-flex sm:hidden')}
    </div>
  );
};
