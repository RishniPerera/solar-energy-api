const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const { notFound, errorHandler } = require("./utils/errors");
 


const app = express();

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

// Health / root
app.get("/", (req, res) => res.json({ message: "Solar Energy API is running" }));
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Routes
app.use("/auth", authRoutes);


// 404 + error handler (must be last)
app.use(notFound);
app.use(errorHandler);

module.exports = app;