// utils.js — DataUtils: formatCurrency, formatDate/parseDate, renderWithSkeleton,
// buildErrorState, MOCK_ERROR_MODE.
// Formatting helpers implemented in task 4.1.
// (task 4.2 will add MOCK_ERROR_MODE, renderWithSkeleton, and buildErrorState below.)
//
// Authored as an importable ES module: pages include it via <script type="module">
// and tests `import` the named exports. The three formatters have no DOM dependency.

// Supported date layouts (see design "DataUtils" + Requirement 9.3).
const SUPPORTED_DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const DEFAULT_DATE_FORMAT = 'YYYY-MM-DD';

// Single reusable formatter — USD, '$' prefix, comma grouping, exactly 2 decimals.
const USD_FORMATTER = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/**
 * Formats a number as USD currency: '$' prefix, thousands separators, exactly two
 * decimal places (e.g. 1234.5 -> "$1,234.50"). Satisfies Property 1 for finite
 * non-negative numbers.
 * @param {number} amount
 * @returns {string}
 */
export function formatCurrency(amount) {
  return USD_FORMATTER.format(amount);
}

// Best-effort read of the persisted date-format preference. Storage access can throw
// (SecurityError) or be unavailable (non-browser/test contexts) — fall back to null.
function getStoredDateFormat() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      return localStorage.getItem('gl-dateformat');
    }
  } catch (_e) {
    /* best-effort: ignore and fall back */
  }
  return null;
}

// Resolves the effective format: explicit arg → persisted gl-dateformat → default.
// Any unsupported value resolves to the documented default ('YYYY-MM-DD').
function resolveFormat(format) {
  if (SUPPORTED_DATE_FORMATS.includes(format)) return format;
  const stored = getStoredDateFormat();
  if (SUPPORTED_DATE_FORMATS.includes(stored)) return stored;
  return DEFAULT_DATE_FORMAT;
}

// Validates a (year, month, day) triple as a real calendar date (rejects e.g. Feb 30).
function isValidYMD(y, m, d) {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(y, m - 1, d);
  return probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d;
}

// Extracts calendar {y, m, d} from a Date or ISO string without timezone drift.
// - Date objects use local components (round-trips with parseDate's local-midnight Date).
// - 'YYYY-MM-DD' strings are treated as calendar dates (no UTC off-by-one).
// - Full ISO strings ('...THH:MM:SSZ') use the UTC calendar day of the instant.
// Returns null for null/undefined/empty/unparseable input (Req 13.4).
function extractDateParts(date) {
  if (date === null || date === undefined) return null;

  if (date instanceof Date) {
    if (Number.isNaN(date.getTime())) return null;
    return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
  }

  if (typeof date === 'string') {
    const s = date.trim();
    if (s === '') return null;

    // Date-only: parse the calendar fields directly to avoid UTC shifting.
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (dateOnly) {
      const y = Number(dateOnly[1]);
      const m = Number(dateOnly[2]);
      const d = Number(dateOnly[3]);
      return isValidYMD(y, m, d) ? { y, m, d } : null;
    }

    // Full ISO datetime (with zone designator): use the instant's UTC calendar day.
    const t = Date.parse(s);
    if (Number.isNaN(t)) return null;
    const dt = new Date(t);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  }

  return null;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function pad4(n) {
  return String(n).padStart(4, '0');
}

/**
 * Formats a Date (or ISO 8601 string) per the given/persisted gl-dateformat preference.
 * Supported formats: 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD' (default 'YYYY-MM-DD').
 * Empty/null/undefined/unparseable input returns '' (Req 13.4). Date-only strings are
 * parsed as calendar dates so the rendered day never shifts due to UTC.
 * @param {Date|string|null|undefined} date
 * @param {string} [format]
 * @returns {string}
 */
export function formatDate(date, format) {
  const parts = extractDateParts(date);
  if (!parts) return '';

  const fmt = resolveFormat(format);
  const YYYY = pad4(parts.y);
  const MM = pad2(parts.m);
  const DD = pad2(parts.d);

  switch (fmt) {
    case 'DD/MM/YYYY':
      return `${DD}/${MM}/${YYYY}`;
    case 'MM/DD/YYYY':
      return `${MM}/${DD}/${YYYY}`;
    case 'YYYY-MM-DD':
    default:
      return `${YYYY}-${MM}-${DD}`;
  }
}

/**
 * Parses a formatted date string back into a Date at day granularity — the inverse of
 * formatDate for the given format. Returns a local-midnight Date so that
 * parseDate(formatDate(d, fmt), fmt) equals d to day granularity (Property 2).
 * Returns null for null/undefined/empty/malformed input.
 * @param {string|null|undefined} str
 * @param {string} [format]
 * @returns {Date|null}
 */
export function parseDate(str, format) {
  if (typeof str !== 'string') return null;
  const s = str.trim();
  if (s === '') return null;

  const fmt = resolveFormat(format);
  let y;
  let m;
  let d;
  let match;

  switch (fmt) {
    case 'DD/MM/YYYY':
      match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
      if (!match) return null;
      d = Number(match[1]);
      m = Number(match[2]);
      y = Number(match[3]);
      break;
    case 'MM/DD/YYYY':
      match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
      if (!match) return null;
      m = Number(match[1]);
      d = Number(match[2]);
      y = Number(match[3]);
      break;
    case 'YYYY-MM-DD':
    default:
      match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      if (!match) return null;
      y = Number(match[1]);
      m = Number(match[2]);
      d = Number(match[3]);
      break;
  }

  if (!isValidYMD(y, m, d)) return null;
  return new Date(y, m - 1, d);
}

/* ==========================================================================
 * Data-loading lifecycle (task 4.2) — MOCK_ERROR_MODE, renderWithSkeleton,
 * buildErrorState. Requirements 11.1–11.5.
 *
 * These functions touch the DOM (skeleton + error markup), so every DOM access
 * is guarded for non-browser/test contexts. renderWithSkeleton returns a Promise
 * that resolves once the terminal state ('data' | 'error') is rendered, so jsdom
 * property tests (Properties 14 & 15) can await the lifecycle deterministically.
 * ======================================================================== */

// When true, every container driven by renderWithSkeleton is forced to its error
// terminal state regardless of whether the data function would have succeeded.
// Flip this to `true` to force error states across all containers for QA (Req 11.4).
export const MOCK_ERROR_MODE = false;

// Default skeleton shimmer duration before the terminal state renders (Req 11.2).
// Tests override via opts.delay (e.g. { delay: 0 }) to avoid real timers.
const SKELETON_DELAY_MS = 600;

// Default number of shimmer rows to stack while loading.
const SKELETON_ROWS = 4;

// Builds the CSS-only skeleton markup. Each row carries both `.gl-skeleton`
// (shimmer base) and `.gl-skeleton-row` (height + spacing) from components.css.
function buildSkeletonMarkup(rows) {
  const count = Number.isInteger(rows) && rows > 0 ? rows : SKELETON_ROWS;
  let html = '<div class="gl-skeleton-loader" aria-busy="true" aria-live="polite">';
  for (let i = 0; i < count; i += 1) {
    html += '<div class="gl-skeleton gl-skeleton-row"></div>';
  }
  html += '</div>';
  return html;
}

// Places content into a container, accepting either an HTML string or a DOM node.
function placeContent(containerEl, content) {
  if (content === null || content === undefined) {
    containerEl.innerHTML = '';
    return;
  }
  if (typeof content === 'string') {
    containerEl.innerHTML = content;
    return;
  }
  if (typeof content === 'object' && content.nodeType) {
    containerEl.innerHTML = '';
    containerEl.appendChild(content);
    return;
  }
  // Fallback: coerce anything else to text so the container is never left stale.
  containerEl.textContent = String(content);
}

/**
 * Builds the error-state DOM consumed when a data container fails to load
 * (Req 11.3). Returns an **HTMLElement** (not a string) so the "Retry?" link can
 * be wired to `onRetry` via a real event listener; renderWithSkeleton appends it.
 * In a non-DOM context (no `document`) this returns `null`.
 *
 * Structure (styled by `.gl-error-state` in components.css):
 *   <div class="gl-error-state" role="alert">
 *     <i class="bi bi-exclamation-triangle gl-error-icon" aria-hidden="true"></i>
 *     <span class="gl-error-message">ERR — Failed to load {message}. <a class="gl-error-retry">Retry?</a></span>
 *   </div>
 *
 * @param {string} message  short description of what failed to load
 * @param {Function} [onRetry]  invoked when the "Retry?" link is activated
 * @returns {HTMLElement|null}
 */
export function buildErrorState(message, onRetry) {
  if (typeof document === 'undefined' || !document) return null;

  const container = document.createElement('div');
  container.className = 'gl-error-state';
  container.setAttribute('role', 'alert');

  const icon = document.createElement('i');
  icon.className = 'bi bi-exclamation-triangle gl-error-icon';
  icon.setAttribute('aria-hidden', 'true');

  const msg = document.createElement('span');
  msg.className = 'gl-error-message';
  const safeMessage =
    message === null || message === undefined || String(message).trim() === ''
      ? 'data'
      : String(message);
  msg.textContent = `ERR — Failed to load ${safeMessage}. `;

  const retry = document.createElement('a');
  retry.className = 'gl-error-retry';
  retry.setAttribute('href', '#');
  retry.setAttribute('role', 'button');
  retry.textContent = 'Retry?';
  retry.addEventListener('click', (ev) => {
    if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
    if (typeof onRetry === 'function') onRetry();
  });

  msg.appendChild(retry);
  container.appendChild(icon);
  container.appendChild(msg);
  return container;
}

/**
 * Manages the loading → (data | error) lifecycle for a data container (Req 11.1).
 *
 * Lifecycle:
 *   1. Immediately renders the CSS-only skeleton shimmer (Req 11.2).
 *   2. After `delay` ms: if MOCK_ERROR_MODE is true OR dataFn() throws/rejects,
 *      renders the error state via buildErrorState (Req 11.3, 11.4); otherwise
 *      replaces the skeleton with renderFn(data) output (Req 11.5).
 *   3. dataFn may return a value or a Promise (resolved/awaited transparently).
 *      The "Retry?" link re-invokes this same flow.
 *
 * Exactly one terminal state is reached per call (Property 14). Returns a Promise
 * that resolves to the terminal state token: 'data' or 'error'.
 *
 * @param {HTMLElement} containerEl  the container to drive
 * @param {Function} dataFn  produces the data (value or Promise); may throw/reject
 * @param {Function} renderFn  maps resolved data → HTML string or DOM node
 * @param {{ delay?: number, skeletonRows?: number }} [opts]
 * @returns {Promise<'data'|'error'>}
 */
export function renderWithSkeleton(containerEl, dataFn, renderFn, opts = {}) {
  if (!containerEl) return Promise.resolve('error');

  const options = opts || {};
  const delay =
    typeof options.delay === 'number' && options.delay >= 0 ? options.delay : SKELETON_DELAY_MS;
  const rows =
    typeof options.skeletonRows === 'number' ? options.skeletonRows : SKELETON_ROWS;

  // Step 1: render the skeleton immediately (synchronously, before the delay).
  containerEl.innerHTML = buildSkeletonMarkup(rows);

  return new Promise((resolve) => {
    const showError = (message) => {
      const node = buildErrorState(message, () => {
        // Retry re-invokes the same flow against the same container/opts.
        renderWithSkeleton(containerEl, dataFn, renderFn, options);
      });
      placeContent(containerEl, node);
      resolve('error');
    };

    const runAfterDelay = async () => {
      // Step 2a: MOCK_ERROR_MODE forces the error terminal state (Property 15).
      if (MOCK_ERROR_MODE) {
        showError('mock error mode');
        return;
      }

      // Step 2b: resolve the data (sync value or Promise); failures → error state.
      let data;
      try {
        data = typeof dataFn === 'function' ? dataFn() : undefined;
        if (data && typeof data.then === 'function') {
          data = await data;
        }
      } catch (err) {
        showError(err && err.message ? err.message : 'data unavailable');
        return;
      }

      // Step 3: render success content; a renderFn failure also degrades to error.
      try {
        const output = typeof renderFn === 'function' ? renderFn(data) : '';
        placeContent(containerEl, output);
        resolve('data');
      } catch (err) {
        showError(err && err.message ? err.message : 'render failed');
      }
    };

    if (delay === 0) {
      // Still asynchronous so the skeleton is observable before the terminal state.
      Promise.resolve().then(runAfterDelay);
    } else {
      setTimeout(runAfterDelay, delay);
    }
  });
}
