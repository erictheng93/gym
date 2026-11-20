---
name: GymNexus
description: Luxury fitness club and boutique studio management system
colors:
  primary: "#10b981"
  primary-hover: "#059669"
  primary-glow: "rgba(16, 185, 129, 0.25)"
  accent: "#0ea5e9"
  neutral-bg: "#090a0f"
  neutral-surface: "#12141d"
  neutral-elevated: "#171a24"
  neutral-text: "#f8fafc"
  neutral-text-muted: "#94a3b8"
  border-subtle: "rgba(255, 255, 255, 0.08)"
  border-strong: "rgba(255, 255, 255, 0.16)"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, sans-serif"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  heading:
    fontFamily: "Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, sans-serif"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, sans-serif"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "28px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
---

# GymNexus Design System

## Overview
GymNexus embodies an **Obsidian Luxury & Precision Performance** aesthetic. Crafted to exceed the quality standards of Awwwards Site of the Year and FWA of the Day, the design balances dark obsidian mineral depth with crisp typographic hierarchy, organic tactile glassmorphism, and responsive sound/haptic feedback.

Every screen adheres to the **Craft Floor** standards: zero generic AI anti-patterns, zero overshooting cartoon bounces, zero cheap text gradients, and full accessibility compliance (WCAG 2.1 AA/AAA with prefers-reduced-motion respect).

## Colors
- **Deep Obsidian Ground**: `#090a0f` for deepest root canvas, transitioning to `#0f1118` and `#12141d` for elevated structural surfaces.
- **Emerald Accent**: Primary brand vitality `#10b981` (hover `#059669`), paired with subtle specular edge illumination (`rgba(16, 185, 129, 0.25)`).
- **Sky Titanium Secondary**: `#0ea5e9` for technical diagnostics and scheduling data.
- **Amber Gold Alert**: `#f59e0b` for warnings and attention states.
- **Crimson Red Critical**: `#ef4444` for cancellations, danger actions, and error states.
- **Specular Border Gradients**: Multi-stop borders `linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.02) 100%)` replicating physical chamfered metallic edges.

## Typography
- **Primary Typeface**: `Plus Jakarta Sans`, accompanied by native Apple SF Pro and system fallbacks.
- **Display Weights**: 700 / 800 with tight tracking (`-0.03em` to `-0.02em`).
- **Body Measure**: Standard reading measure 60–75ch for editorial balance.
- **Tabular Numerals**: All metrics, financial amounts, and time values enforce `font-variant-numeric: tabular-nums` for rock-solid visual column alignment.

## Layout
- **Visual Rhythm**: Strict 8-point base grid system (`4px`, `8px`, `16px`, `24px`, `32px`, `48px`).
- **Responsive Scaffolding**: Fluid grid with adaptive margins (16px mobile, 24px tablet, 32px desktop).
- **Sticky Glass Headers**: `backdrop-filter: blur(20px) saturate(180%)` with specular bottom borders that preserve spatial continuity during scroll.

## Elevation & Depth
- **True Physical Deceleration**: Motion uses Apple-grade exponential deceleration curves:
  - `--ease-out`: `cubic-bezier(0.16, 1, 0.3, 1)`
  - `--ease-fluid`: `cubic-bezier(0.16, 1, 0.3, 1)`
  - `--ease-gentle`: `cubic-bezier(0.25, 1, 0.5, 1)`
  - **Prohibited**: Dated bouncy easing (`cubic-bezier(..., >1)`) or spring overshoots.
- **Layered Ambient Shadows**: Multi-layered soft Gaussian drop shadows simulating real studio lighting rather than single harsh offsets.
- **Tactile Micro-Interactions**: Active click press states (`transform: scale(0.97)` to `scale(0.99)`) paired with synthesized Web Audio micro-clicks and Web Vibration haptics.

## Shapes
- **Corner Radii Hierarchy**:
  - `sm` (8px): Tags, badges, inner sub-controls.
  - `md` (12px): Standard form inputs, buttons.
  - `lg` (16px): Cards, content modules.
  - `xl` (20px): Floating panels, modal sheets.
  - `2xl` (28px): Mobile navigation bars, hero containers.
  - `full` (9999px): Avatars, pill chips, status badges.
- **Full Contours**: Never use asymmetrical single-side borders (`border-left: 4px`) on rounded containers; status is communicated via full border tints, specular glow, and leading status badges.

## Components
- **Buttons**:
  - Primary: High-contrast emerald fill with inner specular highlight and active spring compression.
  - Secondary: Frosted obsidian glass with subtle 1px border.
  - Ghost: Minimal footprint with hover illumination.
- **Cards**:
  - Deep obsidian frosted glass background with `border: 1px solid rgba(255, 255, 255, 0.08)`.
  - Balanced padding and clear typographic hierarchy without nested cards.
- **Command Palette (`⌘K`)**:
  - Centered floating glass overlay with keyboard navigation, fuzzy search, and Web Audio acoustic clicks.
- **Sensory Feedback**:
  - Sound Effects (`useSoundEffects`): Web Audio API pure procedural synthesized acoustics (switch, click, pop, chime, complete).
  - Haptic Feedback (`useHapticFeedback`): Web Vibration API precision patterns (selection, light, medium, heavy, success, warning, error).

## Do's and Don'ts
- **DO**:
  - Use high-contrast solid typography with intentional font weights.
  - Respect `@media (prefers-reduced-motion: reduce)` across all animated elements.
  - Maintain consistent design token references across all apps (`admin-web`, `member-app`, `coach-app`, `packages/ui`).
  - Use exponential deceleration easing curves (`cubic-bezier(0.16, 1, 0.3, 1)`).
- **DON'T**:
  - **DON'T** use cheap gradient text (`background-clip: text` on headings).
  - **DON'T** use decorative two-axis grid line backgrounds (codex grid AI slop).
  - **DON'T** use single-side border tabs (`border-left: 4px`) on rounded cards.
  - **DON'T** use bouncy or elastic overshooting easing curves.
  - **DON'T** import ad-hoc fonts in page files; always use the unified typography token system.
  - **DON'T** use generic purple-to-indigo gradients.
