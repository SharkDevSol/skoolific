const errorHandler = (err, req, res, next) => {
  console.error('Unhandled error:', err?.message || err);
  console.error(err?.stack || '');

  if (res.headersSent) {
    return;
  }

  const statusCode = err.statusCode || 500;
  const message = err.statusCode ? err.message : 'Internal server error';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { details: err.message })
  });
};

const onUncaughtException = (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  console.error(err.stack);
};

const onUnhandledRejection = (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
};

module.exports = { errorHandler, onUncaughtException, onUnhandledRejection };
