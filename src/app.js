const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const swaggerUi   = require("swagger-ui-express");
const swaggerSpec = require("./swagger");
require("dotenv").config();

// Route modules
const authRoutes = require("./routes/authRoutes");
const hierarchyRoutes = require("./routes/hierarchyRoutes");
const installationRoutes = require("./routes/installationRoutes");
const districtRoutes = require("./routes/districtRoutes");
// Error contract
const { notFound, errorHandler } = require("./utils/errors");

const app = express();

// Global middleware
app.use(cors());
app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));

// OpenAPI / Swagger UI
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/openapi.json", (req, res) => res.json(swaggerSpec));

// Root + health (public — no auth)
app.get("/", (req, res) =>
  res.json({
    message: "Solar Energy API is running",
    docs: "/docs",
  })
);

// Health
app.get("/health", (req, res) =>
  res.json({ status: "ok", timestamp: new Date().toISOString() })
);

// Routes
app.use("/auth", authRoutes);  // POST /auth/token
app.use("/", hierarchyRoutes);  // /provinces, /districts, /grid-substations
app.use("/", installationRoutes);  // /installations/* and /installations/:id/readings/*
app.use("/", districtRoutes);    // /districts/:id/generation-summary

// 404 + error handler (must be last)
app.use(notFound);
app.use(errorHandler);

module.exports = app;