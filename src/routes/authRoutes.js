// The endpoint that issues tokenconst 
express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { ApiError } = require("../utils/errors");
const asyncHandler = require("../utils/asyncHandler");

const router = express.Router();


// POST /auth/token
// Two grant types:
//   { "grant_type": "device",   "meter_id": "MTR-00001" }
//   { "grant_type": "password", "username": "sleea.colombo",
//                                "password": "Password123!" }

router.post("/token", asyncHandler(async (req, res) => {
  const { grant_type } = req.body;


  // device login 
  
  if (grant_type === "device") {
    const { meter_id } = req.body;
    if (!meter_id) {
      throw new ApiError(400, "BAD_REQUEST", "meter_id is required");
    }

    const { rows } = await pool.query(
      "SELECT id FROM solar_installations WHERE meter_id = $1",
      [meter_id]
    );
    if (!rows[0]) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Unknown meter");
    }

    const token = jwt.sign(
      {
        role: "device",
        installationId: rows[0].id,
        scopes: ["installation-write"],
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "24h" }
    );

    return res.json({
      access_token: token,
      token_type: "Bearer",
      expires_in: 86400,
    });
  }


  // user login

  if (grant_type === "password") {
    const { username, password } = req.body;
    if (!username || !password) {
      throw new ApiError(400, "BAD_REQUEST",
        "username and password are required");
    }

    const { rows } = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );
    if (!rows[0]) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Unknown user");
    }

    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Bad password");
    }

    const scopeMap = {
      national:   "analyst-read-national",
      provincial: "analyst-read-by-province",
      district:   "analyst-read-by-district",
    };

    const token = jwt.sign(
      {
        role:        rows[0].role,
        scopes:      [scopeMap[rows[0].role]],
        provinceId:  rows[0].province_id,
        districtId:  rows[0].district_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "24h" }
    );

    return res.json({
      access_token: token,
      token_type: "Bearer",
      expires_in: 86400,
    });
  }

  throw new ApiError(400, "BAD_REQUEST",
    "Unsupported grant_type. Use 'device' or 'password'.");
}));

module.exports = router;