const express = require("express");
const ctrl = require("../controllers/installationController");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// Derived/processing resource: aggregate generation for a district
router.get("/districts/:id/generation-summary",
  authenticate,
  ctrl.getDistrictSummary);

module.exports = router;