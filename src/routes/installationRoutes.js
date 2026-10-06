const express = require("express");
const ctrl = require("../controllers/installationController");
const readings = require("../controllers/readingsController");
const {
  authenticate,
  requireScope,
  requireInstallationOwnership,
  enforceJurisdiction,
} = require("../middleware/auth");

const router = express.Router();



// READ PATH — jurisdiction enforced, no cross-jurisdiction leakage
// Atomic installation
router.get("/installations/:id",
  authenticate,
  enforceJurisdiction,
  ctrl.getInstallation);

// Composite (installation + context + last reading + recent readings)
router.get("/installations/:id/composite",
  authenticate,
  enforceJurisdiction,
  ctrl.getComposite);

// Derived — last known reading (operational view)
router.get("/installations/:id/last-reading",
  authenticate,
  enforceJurisdiction,
  ctrl.getLastReading);



// READINGS SUB-COLLECTION (scoped under an installation)

// History: paginated + filtered + sorted + conditional GET
router.get("/installations/:installationId/readings",
  authenticate,
  enforceJurisdiction,
  readings.listReadings);

// Single reading
router.get("/installations/:installationId/readings/:readingId",
  authenticate,
  enforceJurisdiction,
  readings.getReading);



// WRITE PATH — device writes its own reading
//   requires:
//     - a JWT with scope "installation-write"
//     - the JWT's installationId to match the URL parameter


router.post("/installations/:installationId/readings",
  authenticate,
  requireScope("installation-write"),
  requireInstallationOwnership,
  readings.createReading);


  
// INSTALLATION CRUD — administrative writes
//   Note: for coursework scope, any authenticated user may manage installations.
//   In production this would require an admin scope.


router.post("/installations",
  authenticate,
  ctrl.createInstallation);

router.put("/installations/:id",
  authenticate,
  ctrl.replaceInstallation);

router.patch("/installations/:id",
  authenticate,
  ctrl.patchInstallation);

router.delete("/installations/:id",
  authenticate,
  ctrl.deleteInstallation);

module.exports = router;