// users-logic.js — applyFilters, paginate, resolveTab. Implemented in task 9.1.
//
// Authoring note: written as an importable ES module (named exports below, used by
// the Vitest/jsdom suite) AND usable on pages via a plain <script type="module">
// include. Every function here is PURE — no DOM, no globals, no side effects — so
// importing in a non-DOM (test) context is completely safe.
//
// Contract (design.md "UsersPage" + Properties 10, 11, 13; Req 8.4–8.8):
//  - applyFilters composes search + status + type with AND logic (Property 10).
//  - paginate slices a list into fixed-size pages and reports label bounds
//    (Property 11).
//  - resolveTab maps a URL hash to a tab name, defaulting to 'members'
//    (Property 13 / Req 8.4).

// ---------------------------------------------------------------------------
// applyFilters — AND-composed search + status + type (Req 8.5, 8.6, 8.7; Property 10)
// ---------------------------------------------------------------------------

// Sentinel values that mean "no constraint" for the status / type dropdowns.
// 'All' is the visible UI option; empty/undefined/null also impose no constraint.
const NO_CONSTRAINT = new Set(['All', '', undefined, null]);

// Default fields searched when the caller does not pass `searchFields`. These cover
// BOTH record shapes used on the Users page:
//   - Members:      holder (account holder name) OR accountId
//   - Transactions: txnId OR account
// A record only carries the fields relevant to its shape; missing fields are simply
// skipped, so the same default works for members and transactions alike.
const DEFAULT_SEARCH_FIELDS = ['holder', 'accountId', 'txnId', 'account'];

/**
 * Return the subset of `records` that satisfy ALL active filters simultaneously
 * (AND composition). The result preserves the input order and is independent of the
 * order in which the individual filters are conceptually applied (Property 10).
 *
 * Filter semantics:
 *  - search: case-insensitive substring match. A record matches if ANY of its
 *    `searchFields` contains the query as a substring (case-insensitive). An
 *    empty/whitespace-only/undefined query imposes no constraint.
 *  - status: 'All' (or empty/undefined/null) imposes no constraint; otherwise the
 *    record matches only when `record.status` is exactly equal to the value.
 *  - type:   'All' (or empty/undefined/null) imposes no constraint; otherwise the
 *    record matches only when `record.type` is exactly equal to the value.
 *
 * @param {Array<Object>} records  the records to filter
 * @param {Object} [filters]
 * @param {string} [filters.search]  case-insensitive substring query
 * @param {string} [filters.status]  exact status match, or 'All'/empty for any
 * @param {string} [filters.type]    exact type match, or 'All'/empty for any
 * @param {string[]} [filters.searchFields]  fields the search query matches
 *   against; defaults to common member + transaction id/name fields.
 * @returns {Array<Object>} matching records in original input order
 */
export function applyFilters(records, filters = {}) {
  if (!Array.isArray(records)) {
    return [];
  }

  const { search, status, type } = filters;
  const searchFields = Array.isArray(filters.searchFields)
    ? filters.searchFields
    : DEFAULT_SEARCH_FIELDS;

  // Normalize the search query once. Treat null/undefined/whitespace-only as "no
  // search constraint" so an empty box never hides rows.
  const query =
    typeof search === 'string' ? search.trim().toLowerCase() : '';
  const hasSearch = query.length > 0;

  const hasStatus = !NO_CONSTRAINT.has(status);
  const hasType = !NO_CONSTRAINT.has(type);

  // No active filters → return every record (order preserved).
  if (!hasSearch && !hasStatus && !hasType) {
    return records.filter(() => true);
  }

  return records.filter((record) => {
    if (record == null) return false;

    // status (exact match)
    if (hasStatus && record.status !== status) {
      return false;
    }

    // type (exact match)
    if (hasType && record.type !== type) {
      return false;
    }

    // search (case-insensitive substring across the designated fields)
    if (hasSearch) {
      const matches = searchFields.some((field) => {
        const fieldValue = record[field];
        if (fieldValue == null) return false;
        return String(fieldValue).toLowerCase().includes(query);
      });
      if (!matches) return false;
    }

    return true;
  });
}

// ---------------------------------------------------------------------------
// paginate — fixed-size pages + label bounds (Req 8.8; Property 11)
// ---------------------------------------------------------------------------

/**
 * Slice `records` into a single page of at most `pageSize` items and report the
 * "Showing X–Y of Z" label bounds.
 *
 * Returned shape:
 *   {
 *     pageItems:  Object[]  // at most `pageSize` items (Property 11)
 *     start:      number    // 1-based index of first item on the page (X); 0 when empty
 *     end:        number    // 1-based index of last item on the page (Y); 0 when empty
 *     total:      number    // total number of records (Z)
 *     totalPages: number    // number of pages; 0 for an empty list (documented choice)
 *   }
 *
 * Invariants (Property 11):
 *  - pageItems.length <= pageSize
 *  - for a non-empty list: 1 <= start <= end <= total
 *  - concatenating pages 1..totalPages in order reconstructs `records` exactly,
 *    with no overlaps or gaps
 *
 * Edge-case choices (documented):
 *  - Empty list → { pageItems: [], start: 0, end: 0, total: 0, totalPages: 0 }.
 *    We pick totalPages = 0 (not 1) so totalPages always equals
 *    ceil(total / pageSize) and the "page i of totalPages" UI shows nothing to page
 *    through.
 *  - Out-of-range pageNum is CLAMPED into [1, totalPages]: a pageNum below 1 clamps
 *    to the first page; a pageNum above totalPages clamps to the LAST page. This
 *    keeps the user on a populated page rather than showing an empty page, and
 *    guarantees the concatenation/coverage invariant holds for every valid
 *    1..totalPages request.
 *  - Non-integer / NaN pageNum is floored toward a sensible page (defaults to 1).
 *
 * @param {Array<Object>} records  the (already-filtered) records to page
 * @param {number} pageNum  requested 1-based page number
 * @param {number} [pageSize=10]  items per page
 * @returns {{pageItems: Object[], start: number, end: number, total: number, totalPages: number}}
 */
export function paginate(records, pageNum, pageSize = 10) {
  const list = Array.isArray(records) ? records : [];
  const total = list.length;

  // Guard pageSize: must be a positive integer; fall back to the default of 10.
  const size =
    Number.isFinite(pageSize) && pageSize >= 1 ? Math.floor(pageSize) : 10;

  const totalPages = Math.ceil(total / size); // 0 when total === 0

  // Empty list → documented empty-state shape.
  if (total === 0) {
    return { pageItems: [], start: 0, end: 0, total: 0, totalPages: 0 };
  }

  // Clamp the requested page into [1, totalPages]. Non-finite → page 1.
  const requested = Number.isFinite(pageNum) ? Math.floor(pageNum) : 1;
  const page = Math.min(Math.max(requested, 1), totalPages);

  const startIndex = (page - 1) * size; // 0-based slice start
  const pageItems = list.slice(startIndex, startIndex + size);

  const start = startIndex + 1; // 1-based label bound (X)
  const end = startIndex + pageItems.length; // 1-based label bound (Y)

  return { pageItems, start, end, total, totalPages };
}

// ---------------------------------------------------------------------------
// resolveTab — hash → tab name (Req 8.4; Property 13)
// ---------------------------------------------------------------------------

// The only recognized tabs. Anything else resolves to the default.
const VALID_TABS = new Set(['members', 'transactions']);
const DEFAULT_TAB = 'members';

/**
 * Map a URL hash fragment to a Users-page tab name. Accepts the hash with or without
 * a leading '#', and is case-insensitive. Recognized values:
 *   '#members'      | 'members'      → 'members'
 *   '#transactions' | 'transactions' → 'transactions'
 * Any missing, empty, or unrecognized value resolves to the default 'members' tab
 * (Property 13 / Req 8.4). This function never throws.
 *
 * @param {string} [hash]  e.g. location.hash ('#transactions') or a bare name
 * @returns {'members'|'transactions'}
 */
export function resolveTab(hash) {
  if (typeof hash !== 'string') {
    return DEFAULT_TAB;
  }

  // Strip a single leading '#', trim whitespace, normalize case.
  const name = hash.replace(/^#/, '').trim().toLowerCase();

  return VALID_TABS.has(name) ? name : DEFAULT_TAB;
}

// ---------------------------------------------------------------------------
// Page exposure for non-module <script> includes
// ---------------------------------------------------------------------------

// Expose on window so plain (non-module) page scripts can reach the helpers, while
// keeping the canonical named ES exports above for the test suite.
if (typeof window !== 'undefined') {
  window.GLUsers = {
    applyFilters,
    paginate,
    resolveTab,
  };
}
