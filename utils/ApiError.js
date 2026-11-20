class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} [statusCode=500]
   * @param {{ code?: string, errors?: unknown }} [options]
   */
  constructor(message, statusCode = 500, { code, errors } = {}) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export { ApiError };
