function sendSuccess(res, data, { statusCode = 200, meta } = {}) {
  const body = {
    success: true,
    data,
    ...(meta !== undefined ? { meta } : {}),
  };

  return res.status(statusCode).json(body);
}

function sendError(res, { statusCode = 500, message, code, errors }) {
  const body = {
    success: false,
    message,
    ...(code ? { code } : {}),
    ...(errors !== undefined ? { errors } : {}),
  };

  return res.status(statusCode).json(body);
}

export { sendError, sendSuccess };
