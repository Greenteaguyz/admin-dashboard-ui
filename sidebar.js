// sidebar.js — SidebarManager
//
// Public surface (per design.md "SidebarManager (js/sidebar.js)"):
//   toggleSidebar()            flip collapsed/expanded, update DOM, persist to gl-sidebar
//   getStoredSidebar()         -> 'collapsed' | 'expanded' | null
//   persistSidebar(state)      best-effort write to gl-sidebar (try/catch)
//   isValidSidebarState(value) -> boolean
//
// Authoring contract (Requirements 3.3, 3.6):
//   - Importable ES module: tests `import { ... } from '../js/sidebar.js'`.
//   - Also usable via a <script> tag: the API is mirrored on the global object and
//     the collapse control is wired on DOMContentLoaded. All DOM access is guarded
//     by `typeof document !== 'undefined'` so importing in a non-DOM context is safe.
//   - This module does NOT apply initial state. The blocking inline <head> script in
//     each shell page already applied the persisted state pre-paint (design invariant 2).
//   - Invalid/missing stored value resolves to 'expanded' (Req 3.6).

'use strict';

export const SIDEBAR_STORAGE_KEY = 'gl-sidebar';
export const SIDEBAR_COLLAPSED = 'collapsed';
export const SIDEBAR_EXPANDED = 'expanded';

// CSS hook used by the pre-paint blocking <head> script (documentElement.classList).
const COLLAPSED_CLASS = 'sidebar-collapsed';

/**
 * A value is a valid sidebar state only when it is exactly 'collapsed' or 'expanded'.
 * @param {*} value
 * @returns {boolean}
 */
export function isValidSidebarState(value) {
  return value === SIDEBAR_COLLAPSED || value === SIDEBAR_EXPANDED;
}

/**
 * Read the persisted sidebar state from localStorage.
 * Best-effort: returns null when storage is unavailable, the key is missing, or the
 * stored value is not a recognized token.
 * @returns {'collapsed' | 'expanded' | null}
 */
export function getStoredSidebar() {
  try {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return isValidSidebarState(stored) ? stored : null;
  } catch (e) {
    // Storage may be disabled (SecurityError) — treat as "nothing stored".
    return null;
  }
}

/**
 * Persist a sidebar state to localStorage. Best-effort: a write failure
 * (QuotaExceededError / SecurityError) is swallowed so it never breaks interaction.
 * Invalid states are ignored.
 * @param {'collapsed' | 'expanded'} state
 */
export function persistSidebar(state) {
  if (!isValidSidebarState(state)) return;
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, state);
  } catch (e) {
    // Best-effort persistence: session state still applies even if the write fails.
  }
}

/**
 * Resolve an arbitrary stored value to a concrete state, defaulting safely.
 * Invalid or missing values resolve to 'expanded' (Req 3.6).
 * @param {*} value
 * @returns {'collapsed' | 'expanded'}
 */
export function resolveSidebarState(value) {
  return isValidSidebarState(value) ? value : SIDEBAR_EXPANDED;
}

/**
 * Read the sidebar state currently reflected in the DOM. Reads the `data-sidebar`
 * attribute first, then falls back to the pre-paint `sidebar-collapsed` class.
 * Absence of both resolves to 'expanded' (Req 3.6).
 * @returns {'collapsed' | 'expanded'}
 */
function getCurrentSidebarState() {
  if (typeof document === 'undefined' || !document.documentElement) {
    return SIDEBAR_EXPANDED;
  }
  const root = document.documentElement;
  const attr = root.getAttribute('data-sidebar');
  if (isValidSidebarState(attr)) return attr;
  return root.classList.contains(COLLAPSED_CLASS) ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;
}

/**
 * Apply a sidebar state to the DOM: set the `data-sidebar` attribute on
 * documentElement and keep the pre-paint `sidebar-collapsed` class in sync so the
 * rendered state stays consistent with the blocking <head> script's contract.
 * @param {'collapsed' | 'expanded'} state
 */
function applySidebarState(state) {
  if (typeof document === 'undefined' || !document.documentElement) return;
  const root = document.documentElement;
  root.setAttribute('data-sidebar', state);
  root.classList.toggle(COLLAPSED_CLASS, state === SIDEBAR_COLLAPSED);
}

/**
 * Flip the sidebar between expanded and collapsed: update the DOM and persist the
 * new state to localStorage (best-effort).
 * @returns {'collapsed' | 'expanded'} the new state
 */
export function toggleSidebar() {
  const next =
    getCurrentSidebarState() === SIDEBAR_COLLAPSED ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED;
  applySidebarState(next);
  persistSidebar(next);
  return next;
}

/**
 * Bind the sidebar collapse/expand control to `toggleSidebar`. Defensive: a missing
 * control is a no-op. Does NOT apply initial state (handled pre-paint).
 */
function bindSidebarControl() {
  if (typeof document === 'undefined') return;
  const control = document.querySelector(
    '[data-sidebar-toggle], .sidebar-toggle, #sidebar-toggle'
  );
  if (!control) return;
  control.addEventListener('click', (event) => {
    event.preventDefault();
    toggleSidebar();
  });
}

// --- Browser wiring (guarded; skipped in non-DOM contexts) -------------------
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindSidebarControl);
  } else {
    // Module evaluated after DOMContentLoaded (e.g. type=module/deferred) — wire now.
    bindSidebarControl();
  }
}

// Mirror the API on the global object for plain <script>-tag / inline-page usage.
if (typeof window !== 'undefined') {
  window.SidebarManager = {
    toggleSidebar,
    getStoredSidebar,
    persistSidebar,
    isValidSidebarState,
    resolveSidebarState,
  };
}
