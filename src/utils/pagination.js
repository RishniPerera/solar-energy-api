/**
 * Shared pagination utilities for the Solar Energy API.
 *
 * Usage in a route:
 *   const { parsePagination, buildPagination } = require("../utils/pagination");
 *   ...
 *   const { page, limit, offset } = parsePagination(req.query);
 *   const { rows } = await db.query("SELECT ... LIMIT $1 OFFSET $2", [limit, offset]);
 *   const meta = buildPagination(req, { total, page, limit });
 *   res.json({ data: rows, pagination: meta });
 */

// Defaults and hard caps applied to every paginated collection.
const DEFAULTS = {
  page: 1,
  limit: 50,
  maxLimit: 200,
};

/**
 * Coerce a query-string value into a positive integer.
 * Anything missing, non-numeric, zero or negative falls back to `fallback`.
 *
 * @param {*} value            Raw query-string value (string | string[] | undefined)
 * @param {number} fallback    Value to use when `value` is not a usable integer
 * @returns {number}
 */
const toPositiveInt = (value, fallback) => {
  // Express can hand us an array when the key is repeated (?page=1&page=2).
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/**
 * Parse `page` and `limit` out of a query string, with defaults and a cap.
 *
 * @param {object} query                       Typically `req.query`
 * @param {object} [options]
 * @param {number} [options.defaultPage=1]
 * @param {number} [options.defaultLimit=50]
 * @param {number} [options.maxLimit=200]
 * @returns {{ page: number, limit: number, offset: number }}
 */
const parsePagination = (query = {}, options = {}) => {
  const defaultPage  = options.defaultPage  ?? DEFAULTS.page;
  const defaultLimit = options.defaultLimit ?? DEFAULTS.limit;
  const maxLimit     = options.maxLimit     ?? DEFAULTS.maxLimit;

  const page  = toPositiveInt(query.page, defaultPage);
  const limit = Math.min(toPositiveInt(query.limit, defaultLimit), maxLimit);
  const offset = (page - 1) * limit;

  return { page, limit, offset };
};

/**
 * Build a pagination envelope with full self/next/prev URLs.
 *
 * Existing query parameters are preserved; only `page` and `limit` are
 * rewritten, so filters and sorting survive across pages.
 *
 * @param {import("express").Request} req  Express request (needs protocol, host, baseUrl, path, query)
 * @param {object} meta
 * @param {number} meta.total              Total number of matching records
 * @param {number} meta.page               Current page (from parsePagination)
 * @param {number} meta.limit              Current page size (from parsePagination)
 * @returns {{
 *   self: string|null,
 *   next: string|null,
 *   prev: string|null,
 *   total: number,
 *   page: number,
 *   limit: number,
 *   totalPages: number
 * }}
 */
const buildPagination = (req, { total, page, limit }) => {
  const safeTotal = Math.max(0, Number(total) || 0);
  const totalPages = limit > 0 ? Math.ceil(safeTotal / limit) : 0;

  // Rebuild the current URL, then swap in the requested page.
  const linkFor = (targetPage) => {
    const params = new URLSearchParams(req.query || {});
    params.set("page", String(targetPage));
    params.set("limit", String(limit));

    const base = `${req.protocol}://${req.get("host")}${req.baseUrl}${req.path}`;
    return `${base}?${params.toString()}`;
  };

  return {
    self:       linkFor(page),
    next:       page < totalPages ? linkFor(page + 1) : null,
    prev:       page > 1          ? linkFor(page - 1) : null,
    total:      safeTotal,
    page,
    limit,
    totalPages,
  };
};

module.exports = { parsePagination, buildPagination, DEFAULTS };