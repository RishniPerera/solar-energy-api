/**
 * Shared error utilities for the Solar Energy API.
 *
 * Usage in a route:
 *   const { ApiError, sendError } = require("../utils/errors");
 *   ...
 *   if (!user) throw new ApiError(404, "User not found");
 *
 * Usage in an error-handling middleware:
 *   app.use((err, req, res, next) => sendError(res, err));
 */

// Consistent error contract used across the whole API.
// Every 4xx/5xx response has the same JSON shape:
//   { error: { code, message, detail?, timestamp, path } }

class ApiError extends Error {
  constructor(status, code, message, detail = undefined) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;

    // Keeps `instanceof ApiError` working if ever transpiled
    Object.setPrototypeOf(this, ApiError.prototype);

    // Cleaner stack traces (omits this constructor frame)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }
}

// 404 fallback for unmatched routes
const notFound = (req, res, next) =>
  next(new ApiError(404, "NOT_FOUND",
    `Resource not found: ${req.method} ${req.originalUrl}`));

// Central error middleware — MUST be registered last in app.js
const errorHandler = (err, req, res, next) => {
  const status  = err.status || 500;
  const isKnown = err instanceof ApiError;

  // Log unexpected errors server-side; ApiErrors are expected and quiet.
  if (!isKnown) console.error(err);

  res.status(status).json({
    error: {
      code:      isKnown ? err.code : "INTERNAL_ERROR",
      message:   isKnown ? err.message : "Unexpected error",
      detail:    isKnown ? err.detail : undefined,
      timestamp: new Date().toISOString(),
      path:      req.originalUrl,
    },
  });
};

module.exports = { ApiError, notFound, errorHandler };