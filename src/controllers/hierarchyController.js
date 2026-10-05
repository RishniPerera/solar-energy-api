// Geographic hierarchy: provinces -> districts -> grid_substations
// -> solar_installations
// List endpoints return { data, count }; single gets return { data }.
// Missing resources throw ApiError(404, "NOT_FOUND", ...).

const pool = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { ApiError } = require("../utils/errors");



// Provinces

exports.listProvinces = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, name FROM provinces ORDER BY name"
  );
  res.json({ data: rows, count: rows.length });
});

exports.getProvince = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, name FROM provinces WHERE id = $1", [req.params.id]
  );
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "Province not found");
  res.json({ data: rows[0] });
});



// Districts

exports.listDistrictsOfProvince = asyncHandler(async (req, res) => {
  // Ensure parent exists so we can 404 correctly
  const { rows: parent } = await pool.query(
    "SELECT id FROM provinces WHERE id = $1", [req.params.id]
  );
  if (!parent[0]) throw new ApiError(404, "NOT_FOUND", "Province not found");

  const { rows } = await pool.query(
    `SELECT id, name, province_id
       FROM districts
      WHERE province_id = $1
      ORDER BY name`,
    [req.params.id]
  );
  res.json({ data: rows, count: rows.length });
});

exports.getDistrict = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, name, province_id FROM districts WHERE id = $1",
    [req.params.id]
  );
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "District not found");
  res.json({ data: rows[0] });
});




// Grid Substations

exports.listSubstationsOfDistrict = asyncHandler(async (req, res) => {
  const { rows: parent } = await pool.query(
    "SELECT id FROM districts WHERE id = $1", [req.params.id]
  );
  if (!parent[0]) throw new ApiError(404, "NOT_FOUND", "District not found");

  const { rows } = await pool.query(
    `SELECT id, name, district_id
       FROM grid_substations
      WHERE district_id = $1
      ORDER BY name`,
    [req.params.id]
  );
  res.json({ data: rows, count: rows.length });
});

exports.getSubstation = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, name, district_id FROM grid_substations WHERE id = $1",
    [req.params.id]
  );
  if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "Grid substation not found");
  res.json({ data: rows[0] });
});




// Installations (scoped under a substation)

exports.listInstallationsOfSubstation = asyncHandler(async (req, res) => {
  const { rows: parent } = await pool.query(
    "SELECT id FROM grid_substations WHERE id = $1", [req.params.id]
  );
  if (!parent[0]) throw new ApiError(404, "NOT_FOUND", "Grid substation not found");

  const { rows } = await pool.query(
    `SELECT id, substation_id, meter_id, inverter_id, owner_name,
            capacity_kw, installed_at
       FROM solar_installations
      WHERE substation_id = $1
      ORDER BY id`,
    [req.params.id]
  );
  res.json({ data: rows, count: rows.length });
});