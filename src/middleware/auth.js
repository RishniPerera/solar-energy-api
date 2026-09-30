const jwt = require("jsonwebtoken");
const { ApiError } = require("../utils/errors");
const pool = require("../db");


// 1. Verify the JWT and attach the payload to req.auth.

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return next(new ApiError(401, "UNAUTHENTICATED",
      "Missing or malformed Authorization header"));
  }

  try {
    req.auth = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new ApiError(401, "INVALID_TOKEN", "JWT verification failed"));
  }
}


// 2. Require a specific scope (e.g. "installation-write").

function requireScope(scope) {
  return (req, res, next) => {
    if (!req.auth?.scopes?.includes(scope)) {
      return next(new ApiError(403, "FORBIDDEN",
        `Missing required scope: ${scope}`));
    }
    next();
  };
}


// 3. Write-path rule: a device may only write to its own installation.

function requireInstallationOwnership(req, res, next) {
  const installationId = parseInt(req.params.installationId, 10);

  if (req.auth?.role !== "device" || req.auth?.installationId !== installationId) {
    return next(new ApiError(403, "FORBIDDEN",
      "Device may only write to its own installation"));
  }
  next();
}

// 4. Read-path rule: enforce jurisdiction scope.
//    - national   : no restriction
//    - provincial : may read only within their province
//    - district   : may read only within their district

async function enforceJurisdiction(req, res, next) {
  try {
    const { role, provinceId, districtId } = req.auth || {};

    if (role === "national") return next();

    const installationId = req.params.installationId
      ? parseInt(req.params.installationId, 10)
      : null;

    // Case A: request targets a specific installation
    if (installationId) {
      const { rows } = await pool.query(
        `SELECT d.id AS district_id, d.province_id
           FROM solar_installations si
           JOIN grid_substations gs ON gs.id = si.substation_id
           JOIN districts d          ON d.id = gs.district_id
          WHERE si.id = $1`,
        [installationId]
      );

      if (!rows[0]) {
        return next(new ApiError(404, "NOT_FOUND", "Installation not found"));
      }

      const { district_id, province_id } = rows[0];

      if (role === "district" && district_id !== districtId) {
        return next(new ApiError(403, "FORBIDDEN",
          "Cross-district access denied"));
      }
      if (role === "provincial" && province_id !== provinceId) {
        return next(new ApiError(403, "FORBIDDEN",
          "Cross-province access denied"));
      }

      req.jurisdiction = { district_id, province_id };
      return next();
    }

    // Case B: request targets a list (province/district level). Attach
    // a filter object to req so the controller can apply it.
    req.jurisdiction = {
      provinceId: role === "provincial" ? provinceId : undefined,
      districtId: role === "district"   ? districtId : undefined,
    };
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = {
  authenticate,
  requireScope,
  requireInstallationOwnership,
  enforceJurisdiction,
};