/**
 * Branding Types
 *
 * TypeScript type definitions for tenant branding configuration
 */

/**
 * Gradient color configuration
 */
export interface GradientColors {
  /** Start color (hex format, e.g., "#0a84ff") */
  start: string;
  /** End color (hex format, e.g., "#5e5ce6") */
  end: string;
}

/**
 * App-specific suffix configuration
 */
export interface AppSuffix {
  /** Suffix for admin-web (default: "") */
  admin?: string;
  /** Suffix for member-app (default: "") */
  member?: string;
  /** Suffix for coach-app (default: "Coach") */
  coach?: string;
}

/**
 * App-specific color configuration
 */
export interface AppColors {
  /** Admin web colors */
  admin: GradientColors;
  /** Member app colors */
  member: GradientColors;
  /** Coach app colors */
  coach: GradientColors;
}

/**
 * Complete tenant branding configuration
 */
export interface TenantBranding {
  /** Brand name displayed in Launch Screen (default: "GymNexus") */
  brandName: string;
  /** App-specific suffixes */
  appSuffix?: AppSuffix;
  /** App-specific gradient colors */
  colors: AppColors;
}

/**
 * Default branding configuration
 */
export const DEFAULT_BRANDING: TenantBranding = {
  brandName: 'GymNexus',
  appSuffix: {
    admin: '',
    member: '',
    coach: 'Coach'
  },
  colors: {
    admin: { start: '#0a84ff', end: '#5e5ce6' },
    member: { start: '#30d158', end: '#34c759' },
    coach: { start: '#007AFF', end: '#5856D6' }
  }
};

/**
 * App type enum
 */
export type AppType = 'admin' | 'member' | 'coach';

/**
 * Get full brand name for a specific app
 */
export function getFullBrandName(branding: TenantBranding, appType: AppType): string {
  const suffix = branding.appSuffix?.[appType] || DEFAULT_BRANDING.appSuffix![appType];
  return suffix ? `${branding.brandName} ${suffix}` : branding.brandName;
}

/**
 * Get colors for a specific app
 */
export function getAppColors(branding: TenantBranding, appType: AppType): GradientColors {
  return branding.colors[appType] || DEFAULT_BRANDING.colors[appType];
}

/**
 * Validate hex color format
 */
export function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

/**
 * Validate branding configuration
 */
export function validateBranding(branding: Partial<TenantBranding>): string[] {
  const errors: string[] = [];

  if (branding.brandName !== undefined) {
    if (typeof branding.brandName !== 'string') {
      errors.push('brandName must be a string');
    } else if (branding.brandName.length < 1 || branding.brandName.length > 50) {
      errors.push('brandName must be between 1 and 50 characters');
    }
  }

  if (branding.colors) {
    for (const appType of ['admin', 'member', 'coach'] as AppType[]) {
      const colors = branding.colors[appType];
      if (colors) {
        if (colors.start && !isValidHexColor(colors.start)) {
          errors.push(`colors.${appType}.start must be a valid hex color (e.g., #0a84ff)`);
        }
        if (colors.end && !isValidHexColor(colors.end)) {
          errors.push(`colors.${appType}.end must be a valid hex color (e.g., #5e5ce6)`);
        }
      }
    }
  }

  if (branding.appSuffix) {
    for (const appType of ['admin', 'member', 'coach'] as AppType[]) {
      const suffix = branding.appSuffix[appType];
      if (suffix !== undefined && typeof suffix !== 'string') {
        errors.push(`appSuffix.${appType} must be a string`);
      } else if (suffix && suffix.length > 20) {
        errors.push(`appSuffix.${appType} must be at most 20 characters`);
      }
    }
  }

  return errors;
}

/**
 * Merge partial branding with defaults
 */
export function mergeBranding(partial: Partial<TenantBranding>): TenantBranding {
  return {
    brandName: partial.brandName || DEFAULT_BRANDING.brandName,
    appSuffix: {
      admin: partial.appSuffix?.admin ?? DEFAULT_BRANDING.appSuffix!.admin,
      member: partial.appSuffix?.member ?? DEFAULT_BRANDING.appSuffix!.member,
      coach: partial.appSuffix?.coach ?? DEFAULT_BRANDING.appSuffix!.coach
    },
    colors: {
      admin: {
        start: partial.colors?.admin?.start || DEFAULT_BRANDING.colors.admin.start,
        end: partial.colors?.admin?.end || DEFAULT_BRANDING.colors.admin.end
      },
      member: {
        start: partial.colors?.member?.start || DEFAULT_BRANDING.colors.member.start,
        end: partial.colors?.member?.end || DEFAULT_BRANDING.colors.member.end
      },
      coach: {
        start: partial.colors?.coach?.start || DEFAULT_BRANDING.colors.coach.start,
        end: partial.colors?.coach?.end || DEFAULT_BRANDING.colors.coach.end
      }
    }
  };
}
