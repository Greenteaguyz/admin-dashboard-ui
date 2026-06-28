// render.js — KPI / delta / status-badge render helpers + computeAccountDistribution.
// Implemented in task 6.1.
//
// Authored as an importable ES module: pages include it via <script type="module">
// and tests `import` the named exports. All four functions are PURE — they take data
// and return either an HTML string (renderKpiRow / renderDelta / renderStatusBadge) or
// a plain data array (computeAccountDistribution). No DOM is touched here, so the
// renderers are trivially testable in jsdom-free contexts and composable by the
// Overview/Analytics page scripts (tasks 6.2 / 6.3 / 7.2).
//
// RETURN-TYPE CONTRACT (consumed by 6.2 / 6.3):
//   - renderKpiRow(kpiList)        -> HTML string (a .gl-kpi-row wrapper of .gl-kpi-card)
//   - renderDelta(kpi)             -> HTML string (a .gl-delta inline element)
//   - renderStatusBadge(status)    -> HTML string (a .gl-badge inline element)
//   - computeAccountDistribution() -> Array<{ label: string, value: number }> (percent)
// Pages drop these strings into a container (directly or via renderWithSkeleton, whose
// placeContent accepts HTML strings).

import { formatCurrency } from './utils.js';

// Thousands-separated integer formatter for non-currency KPI values (Req 4.3).
const INT_FORMATTER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

// Layer-1 categorical Bootstrap Icon per KPI id (Req 4.2). Unknown ids fall back to a
// neutral chart glyph so a new KPI never renders without an icon.
const KPI_ICON = {
  total_deposits: 'bi-arrow-down-circle',
  total_withdrawals: 'bi-arrow-up-circle',
  net_cash_position: 'bi-currency-dollar',
  active_accounts: 'bi-person-check',
  pending_transactions: 'bi-hourglass-split',
  txn_volume_24h: 'bi-activity',
};
const KPI_ICON_FALLBACK = 'bi-bar-chart';

// Status → semantic color token suffix (Req 5.2 / 14.3). Compared case-insensitively.
// Unknown statuses resolve to 'neutral' (a --text-muted dot) and still show their label.
const STATUS_COLOR = {
  active: 'success',
  completed: 'success',
  suspended: 'danger',
  failed: 'danger',
  pending: 'warning',
};

// Minimal HTML escaper for text interpolated into markup (labels, status text).
// Mock data is trusted, but escaping keeps these renderers safe if wired to real data.
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return ch;
    }
  });
}

/**
 * Resolves the delta COLOR token suffix for a KPI (Req 4.5–4.7).
 *   - total_withdrawals (colorOverride 'warning'): always 'warning', any direction.
 *   - pending_transactions (invertedSign): sign is inverted, so a decrease is "good"
 *     → 'success', an increase is "bad" → 'danger'.
 *   - all others: positive → 'success', negative → 'danger'.
 * Note: the ARROW direction always follows the literal numeric sign (see renderDelta);
 * only the color is affected by the inversion/override.
 */
function resolveDeltaColor(kpi) {
  if (kpi && kpi.colorOverride === 'warning') return 'warning';
  const positive = Number(kpi && kpi.delta) >= 0;
  const inverted = !!(kpi && kpi.invertedSign);
  const good = inverted ? !positive : positive;
  return good ? 'success' : 'danger';
}

/**
 * Renders a KPI Delta_Indicator as markup combining a directional arrow icon, a color
 * class, AND value text — never color alone (Property 8 / Req 4.4, 4.8, 14.1).
 *
 * Direction: arrow follows the literal sign of `kpi.delta` (>= 0 → bi-arrow-up,
 * < 0 → bi-arrow-down). Color: per resolveDeltaColor (success/warning/danger), so the
 * Pending-Transactions inversion shows a DOWN arrow in --success on a decrease, and
 * Total-Withdrawals shows --warning regardless of direction.
 *
 * Value text: percentage (deltaKind 'percent', default) or thousands-separated integer
 * (deltaKind 'absolute'); magnitude only, since the arrow conveys direction.
 *
 * Accessibility: the state is exposed as programmatically determinable text via both an
 * `aria-label` on the root and a `.gl-visually-hidden` span (Req 14.5).
 *
 * @param {{ id?: string, label?: string, delta: number, deltaKind?: 'percent'|'absolute',
 *           invertedSign?: boolean, colorOverride?: string }} kpi
 * @returns {string} HTML string
 */
export function renderDelta(kpi) {
  const delta = Number(kpi && kpi.delta);
  const safeDelta = Number.isFinite(delta) ? delta : 0;
  const up = safeDelta >= 0;

  const color = resolveDeltaColor(kpi);
  const arrowIcon = up ? 'bi-arrow-up' : 'bi-arrow-down';
  const directionWord = up ? 'up' : 'down';

  const magnitude = Math.abs(safeDelta);
  const isAbsolute = kpi && kpi.deltaKind === 'absolute';
  const valueText = isAbsolute
    ? INT_FORMATTER.format(Math.round(magnitude))
    : `${magnitude}%`;

  const labelPrefix = kpi && kpi.label ? `${escapeHtml(kpi.label)} ` : '';
  const ariaText = `${labelPrefix}${directionWord} ${escapeHtml(valueText)}`;

  return (
    `<span class="gl-delta gl-delta--${color}" data-direction="${directionWord}" aria-label="${ariaText}">` +
    `<i class="bi ${arrowIcon}" aria-hidden="true"></i>` +
    `<span class="gl-delta__value" aria-hidden="true">${escapeHtml(valueText)}</span>` +
    `<span class="gl-visually-hidden">${ariaText}</span>` +
    `</span>`
  );
}

/**
 * Renders a single KPI card (Req 4.2–4.4). Icon (top-right, --text-muted, 18px),
 * uppercase label, mono 28px/500 value (currency via formatCurrency, else
 * thousands-separated integer), and a delta row via renderDelta.
 * @param {object} kpi
 * @returns {string} HTML string
 */
function renderKpiCard(kpi) {
  const id = kpi && kpi.id ? String(kpi.id) : '';
  const icon = KPI_ICON[id] || KPI_ICON_FALLBACK;
  const label = kpi && kpi.label != null ? String(kpi.label) : '';

  const rawValue = Number(kpi && kpi.value);
  const safeValue = Number.isFinite(rawValue) ? rawValue : 0;
  const valueText = kpi && kpi.isCurrency
    ? formatCurrency(safeValue)
    : INT_FORMATTER.format(safeValue);

  return (
    `<div class="gl-kpi-card" data-kpi-id="${escapeHtml(id)}">` +
    `<i class="bi ${icon} gl-kpi-card__icon" aria-hidden="true"></i>` +
    `<div class="gl-kpi-card__label">${escapeHtml(label)}</div>` +
    `<div class="gl-kpi-card__value">${escapeHtml(valueText)}</div>` +
    `<div class="gl-kpi-card__delta">${renderDelta(kpi)}</div>` +
    `</div>`
  );
}

/**
 * Renders the KPI row: exactly one card per entry, in source order (Property 17 /
 * Req 4.1). Non-array input yields an empty row.
 * @param {Array<object>} kpiList
 * @returns {string} HTML string
 */
export function renderKpiRow(kpiList) {
  const list = Array.isArray(kpiList) ? kpiList : [];
  return `<div class="gl-kpi-row">${list.map(renderKpiCard).join('')}</div>`;
}

/**
 * Renders a Status_Badge combining a colored dot AND a text label (Property 9 /
 * Req 5.2, 5.3, 14.2, 14.3, 14.5). The label is the status text itself, so it alone
 * identifies the status and is programmatically determinable as element text content.
 * Color map: Active/Completed → --success, Suspended/Failed → --danger,
 * Pending → --warning; unknown → neutral (--text-muted) with the label preserved.
 * @param {string} status
 * @returns {string} HTML string
 */
export function renderStatusBadge(status) {
  const raw = status == null ? '' : String(status).trim();
  const color = STATUS_COLOR[raw.toLowerCase()] || 'neutral';
  const label = raw === '' ? 'Unknown' : raw;

  return (
    `<span class="gl-badge gl-badge--${color}" data-status="${escapeHtml(label)}">` +
    `<span class="gl-badge__dot" aria-hidden="true"></span>` +
    `<span class="gl-badge__label">${escapeHtml(label)}</span>` +
    `</span>`
  );
}

/**
 * Tallies an array of account objects by their `type` field and returns
 * [{ label, value }] where `value` is a PERCENTAGE. Reused by the Overview and
 * Analytics donut charts (Req 6.1, 6.2).
 *
 * Percentages are whole numbers allocated by the largest-remainder method so they sum
 * to exactly 100 (avoids ugly 99/101 donuts). Result order follows first-encountered
 * type order. Empty/invalid input, or input with no usable `type` fields, returns [].
 *
 * @param {Array<{ type?: string }>} accounts
 * @returns {Array<{ label: string, value: number }>}
 */
export function computeAccountDistribution(accounts) {
  if (!Array.isArray(accounts) || accounts.length === 0) return [];

  // Tally counts by type; Map preserves first-encountered insertion order.
  const counts = new Map();
  for (const acc of accounts) {
    if (!acc || acc.type === null || acc.type === undefined) continue;
    const type = String(acc.type);
    if (type.trim() === '') continue;
    counts.set(type, (counts.get(type) || 0) + 1);
  }

  const total = Array.from(counts.values()).reduce((sum, n) => sum + n, 0);
  if (total === 0) return [];

  // Largest-remainder allocation so whole-number percentages sum to exactly 100.
  const entries = Array.from(counts.entries()).map(([label, count]) => {
    const exact = (count / total) * 100;
    const floor = Math.floor(exact);
    return { label, value: floor, remainder: exact - floor };
  });

  const allocated = entries.reduce((sum, e) => sum + e.value, 0);
  let remaining = 100 - allocated;

  // Distribute the leftover percentage points to the largest fractional remainders.
  const byRemainder = entries
    .map((e, index) => ({ index, remainder: e.remainder }))
    .sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; i < remaining && i < byRemainder.length; i += 1) {
    entries[byRemainder[i].index].value += 1;
  }

  return entries.map((e) => ({ label: e.label, value: e.value }));
}
