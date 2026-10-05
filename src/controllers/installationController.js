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