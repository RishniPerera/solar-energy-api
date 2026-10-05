const crypto = require("crypto");
const pool = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { ApiError } = require("../utils/errors");
const { parsePagination, buildPagination } = require("../utils/pagination");

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

// Confirm the installation exists, else 404. Also returns the
// installation's district/province so jurisdiction middleware can use it.
async function assertInstallationExists(installationId) {
  const { rows } = await pool.query(
    "SELECT id FROM solar_installations WHERE id = $1",
    [installationId]
  );
  if (!rows[0]) {
    throw new ApiError(404, "NOT_FOUND", "Installation not found");
  }
}

// Build a stable ETag from the response-shaping inputs. Any change to
// page, filters, sort, or the underlying data (via `latestAt` and
// `total`) produces a different ETag.
function makeETag({ installationId, total, latestAt, page, limit, order, from, to }) {
  const fingerprint = JSON.stringify({
    installationId, total, latestAt, page, limit, order,
    from: from || null,
    to:   to   || null,
  });
  return `"${crypto.createHash("sha1").update(fingerprint).digest("hex")}"`;
}

// ---------------------------------------------------------------------
// GET /installations/:installationId/readings
//   Query: page, limit, from, to, sort=recorded_at | -recorded_at
//   Headers: If-None-Match supported → 304 when fresh
// ---------------------------------------------------------------------
exports.listReadings = asyncHandler(async (req, res) => {
  const installationId = parseInt(req.params.installationId, 10);
  await assertInstallationExists(installationId);

  const { page, limit, offset } = parsePagination(req.query);

  const { from, to, sort } = req.query;
  // sort=recorded_at (ascending) or sort=-recorded_at (descending, default)
  const order = sort === "recorded_at" ? "ASC" : "DESC";

  // -- Build the WHERE clause with parameterised values
  const where  = ["installation_id = $1"];
  const params = [installationId];
  let p = 2;

  if (from) { where.push(`recorded_at >= $${p++}`); params.push(from); }
  if (to)   { where.push(`recorded_at <= $${p++}`); params.push(to); }

  const whereSql = where.join(" AND ");

  // -- Count for pagination envelope (uses the same filters)
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total,
            MAX(recorded_at) AS latest_at
       FROM generation_readings
      WHERE ${whereSql}`,
    params
  );
  const total    = countRes.rows[0].total;
  const latestAt = countRes.rows[0].latest_at
    ? new Date(countRes.rows[0].latest_at).toISOString()
    : null;

  // -- Data page
  const dataRes = await pool.query(
    `SELECT id, installation_id, recorded_at, power_kw, energy_kwh, voltage
       FROM generation_readings
      WHERE ${whereSql}
      ORDER BY recorded_at ${order}
      LIMIT $${p++} OFFSET $${p++}`,
    [...params, limit, offset]
  );

  // -- Conditional GET support
  const etag = makeETag({
    installationId, total, latestAt, page, limit, order, from, to,
  });

  if (req.headers["if-none-match"] === etag) {
    return res.status(304).end();
  }

  res.set("ETag", etag);
  if (latestAt) res.set("Last-Modified", new Date(latestAt).toUTCString());

  res.json({
    data: dataRes.rows,
    pagination: buildPagination(req, { total, page, limit }),
    filters: {
      from: from || null,
      to:   to   || null,
      sort: order,
    },
  });
});

// ---------------------------------------------------------------------
// GET /installations/:installationId/readings/:readingId
// ---------------------------------------------------------------------
exports.getReading = asyncHandler(async (req, res) => {
  const { installationId, readingId } = req.params;

  const { rows } = await pool.query(
    `SELECT id, installation_id, recorded_at, power_kw, energy_kwh, voltage
       FROM generation_readings
      WHERE id = $1 AND installation_id = $2`,
    [readingId, installationId]
  );

  if (!rows[0]) {
    throw new ApiError(404, "NOT_FOUND", "Reading not found");
  }

  const reading = rows[0];
  const etag = `"r-${reading.id}-${new Date(reading.recorded_at).getTime()}"`;

  if (req.headers["if-none-match"] === etag) {
    return res.status(304).end();
  }

  res.set("ETag", etag);
  res.set("Last-Modified", new Date(reading.recorded_at).toUTCString());
  res.json({ data: reading });
});

// ---------------------------------------------------------------------
// POST /installations/:installationId/readings
//   Device writes a single reading for its own installation.
//   - 201 + Location on success
//   - 400 on validation error
//   - 406 if client demands a representation other than JSON
//   - 409 on duplicate (installation_id, recorded_at)
// ---------------------------------------------------------------------
exports.createReading = asyncHandler(async (req, res) => {
  // --- Content negotiation: this endpoint produces JSON only.
  // If a client explicitly asks for something else (Accept: application/xml),
  // return 406 rather than silently ignoring the request.
  if (!req.accepts("json")) {
    throw new ApiError(406, "NOT_ACCEPTABLE",
      "This endpoint produces application/json only");
  }

  const installationId = parseInt(req.params.installationId, 10);
  await assertInstallationExists(installationId);

  // --- Validation
  const { recorded_at, power_kw, energy_kwh, voltage } = req.body || {};
  const missing = [];
  if (!recorded_at)              missing.push("recorded_at");
  if (power_kw   === undefined)  missing.push("power_kw");
  if (energy_kwh === undefined)  missing.push("energy_kwh");
  if (voltage    === undefined)  missing.push("voltage");

  if (missing.length > 0) {
    throw new ApiError(400, "VALIDATION_ERROR",
      "Missing required fields", { missing });
  }

  const when = new Date(recorded_at);
  if (Number.isNaN(when.getTime())) {
    throw new ApiError(400, "VALIDATION_ERROR",
      "recorded_at must be a valid ISO 8601 timestamp");
  }

  // --- Insert. UNIQUE (installation_id, recorded_at) gives idempotency.
  try {
    const { rows } = await pool.query(
      `INSERT INTO generation_readings
         (installation_id, recorded_at, power_kw, energy_kwh, voltage)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, installation_id, recorded_at, power_kw, energy_kwh, voltage`,
      [installationId, when, power_kw, energy_kwh, voltage]
    );

    const created  = rows[0];
    const location = `${req.protocol}://${req.get("host")}${req.baseUrl}/${created.id}`;

    res.status(201).set("Location", location).json({ data: created });
  } catch (e) {
    // 23505 = unique_violation
    if (e.code === "23505") {
      throw new ApiError(409, "DUPLICATE_READING",
        "A reading already exists for this installation at that timestamp");
    }
    throw e;
  }
});