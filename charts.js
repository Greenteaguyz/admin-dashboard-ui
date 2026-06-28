// charts.js — CHART_DEFAULTS, registerChart, sliceRange. Implemented in task 7.1.
//
// Authoring note: written as an importable ES module (named exports below, used by
// the Vitest/jsdom suite) AND usable on pages via a plain <script>/<script type="module">
// include — every `window`/`document` access is guarded so importing in a non-DOM
// (test) context is side-effect-safe.
//
// Contract (design.md "AnalyticsPage" + "Chart Registry & Theme Integration" +
// invariant 3 "Chart registration discipline"):
//  - CHART_DEFAULTS is the shared ApexCharts base config: no animation, no toolbar,
//    DM Sans font, dashed grid lines (Req 7.8).
//  - registerChart stores each instance on window.GL_CHARTS under a unique key so
//    theme.js can iterate the registry blindly (Req 13.1, 13.2; Property 7).
//  - sliceRange is a pure trailing-window slice over a chronologically-ordered
//    { date, ... } series (Req 7.6, 7.7; Property 12).

// ---------------------------------------------------------------------------
// Theme-aware tooltip default
// ---------------------------------------------------------------------------

const DEFAULT_TOOLTIP_THEME = 'light';

/**
 * Resolve the theme currently applied to the document (set pre-paint by the
 * blocking inline <head> script). Anything other than 'dark' — including a
 * non-DOM/test context — resolves to the documented default ('light').
 * @returns {'light'|'dark'}
 */
function getCurrentTooltipTheme() {
  if (typeof document === 'undefined' || !document.documentElement) {
    return DEFAULT_TOOLTIP_THEME;
  }
  return document.documentElement.getAttribute('data-theme') === 'dark'
    ? 'dark'
    : 'light';
}

// ---------------------------------------------------------------------------
// Grid border color default
// ---------------------------------------------------------------------------

// Non-literal fallback used when no DOM is available (test/import context) or the
// token resolves empty. 'transparent' is a CSS keyword, not a color literal, so no
// hardcoded hex/rgb/hsl lives in this module (Req 1.3, 11.6). Pages override this
// at runtime via withDefaults() reading --border-color through getComputedStyle.
const GRID_BORDER_FALLBACK = 'transparent';

/**
 * Resolve the hairline grid color from the --border-color CSS token when a DOM is
 * available, falling back to a non-literal CSS keyword otherwise. ApexCharts cannot
 * read CSS vars itself, so the value is resolved at construction time.
 * @returns {string} a resolved color string or the non-literal fallback
 */
function getGridBorderColor() {
  if (typeof document !== 'undefined' && document.documentElement) {
    try {
      const resolved = getComputedStyle(document.documentElement)
        .getPropertyValue('--border-color')
        .trim();
      if (resolved) return resolved;
    } catch (_) {
      // getComputedStyle can throw in degenerate environments — fall through.
    }
  }
  return GRID_BORDER_FALLBACK;
}

// ---------------------------------------------------------------------------
// CHART_DEFAULTS — shared ApexCharts base configuration (Req 7.8)
// ---------------------------------------------------------------------------

/**
 * Global ApexCharts defaults merged into every chart on the dashboard:
 *  - chart.animations.enabled = false  → charts render instantly, no motion
 *  - chart.toolbar.show       = false  → no export/zoom toolbar (terminal density)
 *  - chart.fontFamily         = DM Sans → matches UI typeface token
 *  - grid.strokeDashArray     = 4       → dashed grid lines
 *  - grid.borderColor                   → hairline grid color resolved from the
 *                                          --border-color CSS token when a DOM is
 *                                          available; falls back to a non-literal
 *                                          CSS keyword in test/import contexts.
 *                                          Pages override this via withDefaults().
 *  - tooltip.theme                      → resolved from the document data-theme at
 *                                          load (default 'light'); theme.js keeps it
 *                                          in sync afterward via reThemeCharts.
 */
export const CHART_DEFAULTS = {
  chart: {
    animations: { enabled: false },
    toolbar: { show: false },
    fontFamily: "'DM Sans', sans-serif",
  },
  grid: {
    strokeDashArray: 4,
    borderColor: getGridBorderColor(),
  },
  tooltip: {
    theme: getCurrentTooltipTheme(),
  },
};

// ---------------------------------------------------------------------------
// Chart registry (Req 13.1, 13.2; Property 7)
// ---------------------------------------------------------------------------

/**
 * Ensure window.GL_CHARTS exists and return it. The registry is created lazily on
 * first use so any chart-initializing script can register without ordering issues.
 * In a non-DOM/test context (no `window`) a module-local fallback object is used.
 * @returns {Object<string, any>}
 */
function getRegistry() {
  if (typeof window !== 'undefined') {
    window.GL_CHARTS = window.GL_CHARTS || {};
    return window.GL_CHARTS;
  }
  // Non-browser fallback so registerChart never throws when imported by tests.
  getRegistry._fallback = getRegistry._fallback || {};
  return getRegistry._fallback;
}

/**
 * Register an ApexCharts instance on window.GL_CHARTS under a unique string key so
 * the theme manager can re-theme every chart (Req 13.1, 13.2). Normal usage is one
 * instance per key, which keeps "number of registry keys === number of charts
 * registered" (Property 7).
 *
 * If `key` already holds a *different* instance, the collision is surfaced via
 * console.warn rather than being applied silently, then the new instance is stored.
 * Registering the *same* instance under its existing key is an idempotent no-op.
 *
 * @param {string} key  unique identifier for the chart
 * @param {any} instance  the ApexCharts instance (or any chart-like object)
 * @returns {any} the registered instance
 */
export function registerChart(key, instance) {
  if (typeof key !== 'string' || key === '') {
    throw new TypeError('registerChart: key must be a non-empty string');
  }

  const registry = getRegistry();

  if (
    Object.prototype.hasOwnProperty.call(registry, key) &&
    registry[key] !== instance
  ) {
    // Do not silently overwrite a different instance — warn so duplicate-key bugs
    // are visible during development.
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(
        `registerChart: key "${key}" already holds a different chart instance; overwriting.`
      );
    }
  }

  registry[key] = instance;
  return instance;
}

// ---------------------------------------------------------------------------
// sliceRange — pure trailing-window slice (Req 7.6, 7.7; Property 12)
// ---------------------------------------------------------------------------

// Count-based windows for the day-granular ranges. 'ytd' is date-based (current
// calendar year) rather than a fixed count.
const RANGE_WINDOWS = { '7d': 7, '30d': 30, '90d': 90 };

/**
 * Slice a chronologically-ordered series down to a trailing window for the given
 * range. The input is an array of objects each carrying a `date` field as an ISO
 * 'YYYY-MM-DD' string (extra fields such as value/deposits/withdrawals are
 * preserved untouched).
 *
 *  - '7d' / '30d' / '90d' → the last N entries (N = 7 / 30 / 90), capped at the
 *    series length. Because these are suffixes of a sorted series, smaller windows
 *    are subsets of larger ones (7d ⊆ 30d ⊆ 90d).
 *  - 'ytd' → every entry whose date falls in the current calendar year. Since the
 *    series is chronologically ordered, these entries form a contiguous suffix.
 *
 * The function is pure with respect to its `series` argument (it returns a new
 * array and never mutates the input) and handles empty/short series gracefully
 * (returns [] or the whole series as appropriate). An unrecognized range returns a
 * shallow copy of the full series.
 *
 * Satisfies Property 12: the result is always a contiguous suffix of `series`, its
 * length is at most the requested window, every returned entry lies within the
 * requested period, and 7d ⊆ 30d ⊆ 90d.
 *
 * @param {Array<{date: string}>} series  chronologically-ordered series
 * @param {'7d'|'30d'|'90d'|'ytd'} range
 * @returns {Array<{date: string}>} a trailing window of the series
 */
export function sliceRange(series, range) {
  if (!Array.isArray(series) || series.length === 0) {
    return [];
  }

  if (range === 'ytd') {
    const currentYear = new Date().getFullYear();
    return series.filter((entry) => {
      if (!entry || typeof entry.date !== 'string') return false;
      return Number(entry.date.slice(0, 4)) === currentYear;
    });
  }

  const window = RANGE_WINDOWS[range];
  if (typeof window !== 'number') {
    // Unknown range: return a shallow copy of the full series (no slicing applied).
    return series.slice();
  }

  // slice(-N) returns the last N entries and naturally caps at the series length.
  return series.slice(-window);
}

// ---------------------------------------------------------------------------
// Page exposure for non-module <script> includes
// ---------------------------------------------------------------------------

// Expose on window so plain (non-module) page scripts can reach the helpers, while
// keeping the canonical named ES exports above for the test suite.
if (typeof window !== 'undefined') {
  window.GL_CHARTS = window.GL_CHARTS || {};
  window.GLCharts = {
    CHART_DEFAULTS,
    registerChart,
    sliceRange,
  };
}
