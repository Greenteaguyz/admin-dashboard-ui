// theme.js — ThemeManager: applyTheme, toggleTheme, getStoredTheme, persistTheme,
// reThemeCharts.
//
// Authoring note: written as an importable ES module (named exports below, used by
// the Vitest/jsdom suite) AND usable on pages — it attaches `window.ThemeManager`
// and wires the topbar Theme_Toggle on DOMContentLoaded when a DOM is present.
//
// Contract (design.md "ThemeManager" + invariants):
//  - The blocking inline <head> script applies the persisted theme PRE-PAINT.
//    This module handles subsequent interactions only; it does NOT re-apply the
//    initial theme on load (it only syncs the toggle's visual indicator).
//  - All localStorage access is best-effort (try/catch); reads fall back to the
//    documented default (light), writes swallow errors (Req 2.4).

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'gl-theme';
const DEFAULT_THEME = 'light';
const VALID_THEMES = ['light', 'dark'];

// The shell topbar (built in task 3.1/6) exposes the Theme_Toggle via any of
// these hooks; we query defensively so the module is resilient to markup choice.
const TOGGLE_SELECTOR = '[data-theme-toggle], #theme-toggle, .theme-toggle';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** True when a value is one of the defined theme tokens. */
function isValidTheme(value) {
  return value === 'light' || value === 'dark';
}

/** Normalize any input to a valid theme, defaulting to light (Req 2.6). */
function normalizeTheme(theme) {
  return isValidTheme(theme) ? theme : DEFAULT_THEME;
}

/**
 * Resolve the theme currently applied to the document (set pre-paint by the
 * blocking inline <head> script). Anything other than 'dark' resolves to light.
 */
function getCurrentTheme() {
  if (typeof document === 'undefined' || !document.documentElement) {
    return DEFAULT_THEME;
  }
  return document.documentElement.getAttribute('data-theme') === 'dark'
    ? 'dark'
    : 'light';
}

/** Locate the topbar Theme_Toggle control, if present. */
function getToggleEl() {
  if (typeof document === 'undefined') return null;
  return document.querySelector(TOGGLE_SELECTOR);
}

/**
 * Sync the toggle's visual indicator to a theme: a sun icon (to switch to light)
 * while dark is active, a moon icon (to switch to dark) while light is active,
 * plus aria-pressed/aria-label so the state is programmatically determinable.
 */
function updateToggleVisual(theme) {
  const toggle = getToggleEl();
  if (!toggle) return;

  const isDark = theme === 'dark';
  toggle.setAttribute('aria-pressed', String(isDark));
  toggle.setAttribute(
    'aria-label',
    isDark ? 'Switch to light theme' : 'Switch to dark theme'
  );
  toggle.setAttribute('title', isDark ? 'Switch to light theme' : 'Switch to dark theme');
  toggle.setAttribute('data-active-theme', theme);

  // Swap the Bootstrap Icons glyph if an <i> icon is present inside the toggle.
  const icon = toggle.querySelector('i') || (toggle.matches('i') ? toggle : null);
  if (icon) {
    icon.classList.remove('bi-sun-fill', 'bi-moon-fill', 'bi-sun', 'bi-moon');
    icon.classList.add(isDark ? 'bi-sun-fill' : 'bi-moon-fill');
  }
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * Read the persisted theme.
 * @returns {'light'|'dark'|null} the stored theme, or null when unset/invalid/unreadable.
 */
export function getStoredTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isValidTheme(value) ? value : null;
  } catch (e) {
    // localStorage unavailable (e.g. SecurityError) — treat as unset.
    return null;
  }
}

/**
 * Persist the theme (best-effort). Storage failures are swallowed so the theme
 * still applies for the current session (Req 2.4).
 * @param {'light'|'dark'} theme
 */
export function persistTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, normalizeTheme(theme));
  } catch (e) {
    // best-effort: ignore quota/security errors, session state is unaffected.
  }
}

/**
 * Apply a theme: set the data-theme attribute on <html>, update the toggle's
 * visual indicator, and re-theme all registered charts. Does NOT persist.
 * @param {'light'|'dark'} theme
 */
export function applyTheme(theme) {
  const next = normalizeTheme(theme);
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.setAttribute('data-theme', next);
  }
  updateToggleVisual(next);
  reThemeCharts(next);
}

/**
 * Flip the active theme between light and dark, apply it, and persist it.
 * Activating twice returns to the original theme (involution — Property 3).
 * @returns {'light'|'dark'} the newly active theme.
 */
export function toggleTheme() {
  const next = getCurrentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  persistTheme(next);
  return next;
}

/**
 * Re-theme every chart in the registry by updating its tooltip theme. Iterates
 * `window.GL_CHARTS` (defaulting to an empty object). Each chart is wrapped in a
 * try/catch so one failing instance cannot block the rest. An empty/missing
 * registry is a no-op (Req 2.8, 13.4).
 * @param {'light'|'dark'} theme
 */
export function reThemeCharts(theme) {
  const registry = (typeof window !== 'undefined' && window.GL_CHARTS) || {};
  for (const key of Object.keys(registry)) {
    const chart = registry[key];
    try {
      if (chart && typeof chart.updateOptions === 'function') {
        // Third arg false suppresses redraw animation (Req 13.3).
        chart.updateOptions({ tooltip: { theme } }, false, false);
      }
    } catch (e) {
      // Resilience: a single chart failure must not block the others.
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`reThemeCharts: failed to update chart "${key}"`, e);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Page wiring (interactions only — guarded so importing in a non-DOM/test
// context is side-effect-safe)
// ---------------------------------------------------------------------------

/**
 * Bind the Theme_Toggle click handler and sync its visual to the theme already
 * applied pre-paint. Intentionally does NOT re-apply the initial theme.
 */
function initThemeManager() {
  const toggle = getToggleEl();
  if (toggle && !toggle.dataset.glThemeBound) {
    toggle.addEventListener('click', toggleTheme);
    toggle.dataset.glThemeBound = 'true';
  }
  // Sync the toggle visual to the current (pre-painted) theme.
  updateToggleVisual(getCurrentTheme());
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeManager);
  } else {
    initThemeManager();
  }
}

// Expose for non-module page scripts (e.g. Settings "Dark Mode" toggle sync).
if (typeof window !== 'undefined') {
  window.ThemeManager = {
    applyTheme,
    toggleTheme,
    getStoredTheme,
    persistTheme,
    reThemeCharts,
  };
}
