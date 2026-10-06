const express = require("express");
const ctrl = require("../controllers/hierarchyController");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// --- Provinces -------------------------------------------------------------
router.get("/provinces",
  authenticate, ctrl.listProvinces);

router.get("/provinces/:id",
  authenticate, ctrl.getProvince);

router.get("/provinces/:id/districts",
  authenticate, ctrl.listDistrictsOfProvince);

// --- Districts -------------------------------------------------------------
router.get("/districts/:id",
  authenticate, ctrl.getDistrict);

router.get("/districts/:id/grid-substations",
  authenticate, ctrl.listSubstationsOfDistrict);

// --- Grid Substations ------------------------------------------------------
router.get("/grid-substations/:id",
  authenticate, ctrl.getSubstation);

router.get("/grid-substations/:id/installations",
  authenticate, ctrl.listInstallationsOfSubstation);

module.exports = router;