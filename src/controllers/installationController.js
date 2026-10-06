const pool = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { ApiError } = require("../utils/errors");

const SELECT_INSTALLATION = `
  SELECT id, substation_id, meter_id, inverter_id, owner_name,
         capacity_kw, installed_at
    FROM solar_installations
   WHERE id = $1
`;



// GET /installations/:id — atomic resource

exports.getInstallation = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(SELECT_INSTALLATION, [req.params.id]);
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "Installation not found");
  res.json({ data: rows[0] });
});



// GET /installations/:id/composite — composite resource
// Returns installation + geographic context + last reading + recent readings

exports.getComposite = asyncHandler(async (req, res) => {
  const id = req.params.id;

  const { rows: inst } = await pool.query(SELECT_INSTALLATION, [id]);
  if (!inst[0]) throw new ApiError(404, "NOT_FOUND", "Installation not found");

  const { rows: context } = await pool.query(
    `SELECT gs.id   AS substation_id, gs.name AS substation_name,
            d.id    AS district_id,   d.name  AS district_name,
            p.id    AS province_id,   p.name  AS province_name
       FROM grid_substations gs
       JOIN districts d ON d.id = gs.district_id
       JOIN provinces p ON p.id = d.province_id
      WHERE gs.id = $1`,
    [inst[0].substation_id]
  );

  const { rows: last } = await pool.query(
    `SELECT id, recorded_at, power_kw, energy_kwh, voltage
       FROM generation_readings
      WHERE installation_id = $1
      ORDER BY recorded_at DESC
      LIMIT 1`,
    [id]
  );

  const { rows: recent } = await pool.query(
    `SELECT id, recorded_at, power_kw, energy_kwh, voltage
       FROM generation_readings
      WHERE installation_id = $1
      ORDER BY recorded_at DESC
      LIMIT 10`,
    [id]
  );

  res.json({
    data: {
      installation: inst[0],
      context: context[0],
      last_reading: last[0] || null,
      recent_readings: recent,
    },
  });
});



// GET /installations/:id/last-reading — derived (operational view)

exports.getLastReading = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, installation_id, recorded_at, power_kw, energy_kwh, voltage
       FROM generation_readings
      WHERE installation_id = $1
      ORDER BY recorded_at DESC
      LIMIT 1`,
    [req.params.id]
  );
  if (!rows[0]) {
    throw new ApiError(404, "NOT_FOUND", "No readings for this installation");
  }
  res.json({ data: rows[0] });
});




// GET /districts/:id/generation-summary — processing resource (stretch)
// Aggregates current power and today's total energy across a district.

exports.getDistrictSummary = asyncHandler(async (req, res) => {
  const districtId = parseInt(req.params.id, 10);

  const { rows: d } = await pool.query(
    "SELECT id, name FROM districts WHERE id = $1", [districtId]
  );
  if (!d[0]) throw new ApiError(404, "NOT_FOUND", "District not found");



  // Current total power: latest reading per installation, summed
  const { rows: current } = await pool.query(
    `SELECT
        COALESCE(SUM(lr.power_kw), 0)::numeric AS total_power_kw,
        COUNT(DISTINCT si.id)                  AS installation_count
       FROM solar_installations si
       JOIN grid_substations gs ON gs.id = si.substation_id
       LEFT JOIN LATERAL (
         SELECT power_kw
           FROM generation_readings gr
          WHERE gr.installation_id = si.id
          ORDER BY recorded_at DESC
          LIMIT 1
       ) lr ON true
      WHERE gs.district_id = $1`,
    [districtId]
  );

  // Today's total energy: sum of per-interval energy contributions
  const { rows: today } = await pool.query(
    `SELECT COALESCE(SUM(gr.power_kw * 0.25), 0)::numeric AS total_energy_kwh
       FROM generation_readings gr
       JOIN solar_installations si ON si.id = gr.installation_id
       JOIN grid_substations gs    ON gs.id = si.substation_id
      WHERE gs.district_id = $1
        AND gr.recorded_at >= date_trunc('day', now())`,
    [districtId]
  );

  res.json({
    data: {
      district: d[0],
      current_total_power_kw: current[0].total_power_kw,
      installation_count: current[0].installation_count,
      today_total_energy_kwh: today[0].total_energy_kwh,
      generated_at: new Date().toISOString(),
    },
  });
});


// ---------------------------------------------------------------------
// POST /installations — create a new installation
//   201 + Location on success, 400 on validation, 409 on duplicate meter_id
// ---------------------------------------------------------------------
exports.createInstallation = asyncHandler(async (req, res) => {
  const {
    substation_id, meter_id, inverter_id, owner_name,
    capacity_kw, installed_at,
  } = req.body || {};

  const missing = [];
  if (!substation_id) missing.push("substation_id");
  if (!meter_id)      missing.push("meter_id");
  if (capacity_kw === undefined) missing.push("capacity_kw");
  if (!installed_at)  missing.push("installed_at");

  if (missing.length > 0) {
    throw new ApiError(400, "VALIDATION_ERROR",
      "Missing required fields", { missing });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO solar_installations
         (substation_id, meter_id, inverter_id, owner_name, capacity_kw, installed_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, substation_id, meter_id, inverter_id, owner_name,
                 capacity_kw, installed_at`,
      [substation_id, meter_id, inverter_id || null, owner_name || null,
       capacity_kw, installed_at]
    );

    const created  = rows[0];
    const location = `${req.protocol}://${req.get("host")}${req.baseUrl}${req.path}/${created.id}`;
    res.status(201).set("Location", location).json({ data: created });
  } catch (e) {
    if (e.code === "23505") {
      throw new ApiError(409, "DUPLICATE_METER_ID",
        "An installation already exists with that meter_id");
    }
    throw e;
  }
});

// ---------------------------------------------------------------------
// PUT /installations/:id — FULL replacement
//   Client must send every field. Missing fields → 400.
//   PUT is idempotent: applying it twice has the same effect.
// ---------------------------------------------------------------------
exports.replaceInstallation = asyncHandler(async (req, res) => {
  const {
    substation_id, meter_id, inverter_id, owner_name,
    capacity_kw, installed_at,
  } = req.body || {};

  const missing = [];
  if (!substation_id) missing.push("substation_id");
  if (!meter_id)      missing.push("meter_id");
  if (capacity_kw === undefined) missing.push("capacity_kw");
  if (!installed_at)  missing.push("installed_at");

  if (missing.length > 0) {
    throw new ApiError(400, "VALIDATION_ERROR",
      "PUT requires a complete representation", { missing });
  }

  const { rows } = await pool.query(
    `UPDATE solar_installations
        SET substation_id = $1,
            meter_id      = $2,
            inverter_id   = $3,
            owner_name    = $4,
            capacity_kw   = $5,
            installed_at  = $6
      WHERE id = $7
      RETURNING id, substation_id, meter_id, inverter_id, owner_name,
                capacity_kw, installed_at`,
    [substation_id, meter_id, inverter_id || null, owner_name || null,
     capacity_kw, installed_at, req.params.id]
  );

  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "Installation not found");
  res.json({ data: rows[0] });
});

// ---------------------------------------------------------------------
// PATCH /installations/:id — PARTIAL update
//   Only fields present in the body are updated. Everything else is
//   left untouched. Never use PUT for this — that's what PATCH is for.
// ---------------------------------------------------------------------
exports.patchInstallation = asyncHandler(async (req, res) => {
  const ALLOWED = [
    "substation_id", "inverter_id", "owner_name",
    "capacity_kw", "installed_at",
  ];

  const sets   = [];
  const params = [];
  let p = 1;

  for (const key of ALLOWED) {
    if (key in req.body) {
      sets.push(`${key} = $${p++}`);
      params.push(req.body[key]);
    }
  }

  if (sets.length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR",
      "No updatable fields supplied",
      { allowed: ALLOWED });
  }

  params.push(req.params.id);

  const { rows } = await pool.query(
    `UPDATE solar_installations
        SET ${sets.join(", ")}
      WHERE id = $${p}
      RETURNING id, substation_id, meter_id, inverter_id, owner_name,
                capacity_kw, installed_at`,
    params
  );

  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "Installation not found");
  res.json({ data: rows[0] });
});

// ---------------------------------------------------------------------
// DELETE /installations/:id — 204 No Content
//   Cascade removes its readings (ON DELETE CASCADE in schema).
// ---------------------------------------------------------------------
exports.deleteInstallation = asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query(
    "DELETE FROM solar_installations WHERE id = $1",
    [req.params.id]
  );

  if (rowCount === 0) {
    throw new ApiError(404, "NOT_FOUND", "Installation not found");
  }

  res.status(204).end();
});