const config = require('../config');

function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  if (config.env !== 'production') {
    console.error(err);
  }

  res.status(status).json({
    success: false,
    error: message,
    ...(config.env !== 'production' && err.stack ? { stack: err.stack } : {}),
  });
}

module.exports = errorHandler;
