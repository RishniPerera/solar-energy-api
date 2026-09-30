// Wraps an async route so thrown errors reach the error handler.
// Without this, async errors would crash the process instead of
// being caught by Express.
module.exports = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);