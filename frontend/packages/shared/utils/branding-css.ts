/**
 * Branding CSS Generator
 *
 * Generates Critical CSS for Launch Screen based on branding configuration
 * Supports three theme selector strategies used across different apps
 */

export interface GradientColors {
  start: string;
  end: string;
}

export interface AppColors {
  admin: GradientColors;
  member: GradientColors;
  coach: GradientColors;
}

export interface TenantBranding {
  brandName: string;
  appSuffix?: {
    admin?: string;
    member?: string;
    coach?: string;
  };
  colors: AppColors;
}

export type AppType = 'admin' | 'member' | 'coach';

/**
 * Theme selector strategies used by different apps
 * - data-theme: admin-web uses html[data-theme="light"]
 * - theme-class: member-app uses html.theme-light
 * - dark-class: coach-app uses html.dark / html:not(.dark)
 */
export type ThemeSelector = 'data-theme' | 'theme-class' | 'dark-class';

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
 * Get light mode selector based on theme strategy
 */
function getLightModeSelector(themeSelector: ThemeSelector): string {
  switch (themeSelector) {
    case 'data-theme':
      return 'html[data-theme="light"]';
    case 'theme-class':
      return 'html.theme-light';
    case 'dark-class':
      return 'html:not(.dark)';
  }
}

/**
 * Get dark mode background color based on app type
 */
function getDarkBgColor(appType: AppType): string {
  // Coach app uses a slightly different dark background
  return appType === 'coach' ? '#000' : '#000';
}

/**
 * Get light mode background color based on app type
 */
function getLightBgColor(appType: AppType): string {
  switch (appType) {
    case 'admin':
      return '#f5f5f7';
    case 'member':
      return '#fff';
    case 'coach':
      return '#F2F2F7';
  }
}

/**
 * Generate Critical CSS for Launch Screen
 *
 * @param colors - Gradient colors for the logo icon
 * @param appType - App type for theme-specific styles
 * @param themeSelector - Theme selector strategy
 * @returns Minified CSS string
 */
export function generateLaunchScreenCSS(
  colors: GradientColors,
  appType: AppType,
  themeSelector: ThemeSelector
): string {
  const lightSelector = getLightModeSelector(themeSelector);
  const darkBg = getDarkBgColor(appType);
  const lightBg = getLightBgColor(appType);

  // Generate CSS with template
  const css = `
/* Base theme colors */
html,body{margin:0;padding:0;background-color:${darkBg};min-height:100vh;min-height:100dvh}
${lightSelector},${lightSelector} body{background-color:${lightBg}}

/* Apple-style Launch Screen */
#launch-screen{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:${darkBg};transition:opacity .4s cubic-bezier(.16,1,.3,1),visibility .4s}
${lightSelector} #launch-screen{background:${lightBg}}
#launch-screen.hide{opacity:0;visibility:hidden;pointer-events:none}
#launch-screen .logo{display:flex;align-items:center;gap:12px;animation:breathe 2s ease-in-out infinite}
#launch-screen .logo-icon{width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,${colors.start} 0%,${colors.end} 100%);display:flex;align-items:center;justify-content:center}
#launch-screen .logo-icon svg{width:28px;height:28px;color:#fff}
#launch-screen .logo-text{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif;font-size:${appType === 'coach' ? '26' : '28'}px;font-weight:600;letter-spacing:-.02em;color:#f5f5f7}
${lightSelector} #launch-screen .logo-text{color:#1d1d1f}
#launch-screen .loading-dots{display:flex;gap:6px;margin-top:32px}
#launch-screen .loading-dots span{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.3);animation:dotPulse 1.4s ease-in-out infinite}
${lightSelector} #launch-screen .loading-dots span{background:rgba(0,0,0,.2)}
#launch-screen .loading-dots span:nth-child(2){animation-delay:.2s}
#launch-screen .loading-dots span:nth-child(3){animation-delay:.4s}
@keyframes breathe{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.85;transform:scale(.98)}}
@keyframes dotPulse{0%,80%,100%{opacity:.3;transform:scale(1)}40%{opacity:1;transform:scale(1.2)}}
`;

  // Minify by removing newlines and extra spaces
  return css.replace(/\n/g, '').replace(/\s+/g, ' ').trim();
}

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
 * Get theme selector for a specific app
 */
export function getAppThemeSelector(appType: AppType): ThemeSelector {
  switch (appType) {
    case 'admin':
      return 'data-theme';
    case 'member':
      return 'theme-class';
    case 'coach':
      return 'dark-class';
  }
}

/**
 * Generate complete Critical CSS for an app
 */
export function generateAppCriticalCSS(branding: TenantBranding, appType: AppType): string {
  const colors = getAppColors(branding, appType);
  const themeSelector = getAppThemeSelector(appType);
  return generateLaunchScreenCSS(colors, appType, themeSelector);
}
