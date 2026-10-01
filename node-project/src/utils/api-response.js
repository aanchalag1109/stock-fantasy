class ApiResponse {
  static success(res, data = {}, message = null, statusCode = 200) {
    const response = { success: true };
    if (message) response.message = message;
    return res.status(statusCode).json(Object.assign(response, data));
  }

  static error(res, message = 'An error occurred', statusCode = 500, errors = null) {
    const response = {
      success: false,
      message
    };
    if (errors) response.errors = errors;
    return res.status(statusCode).json(response);
  }

  static raw(res, data, statusCode = 200) {
    return res.status(statusCode).json(data);
  }
}

module.exports = ApiResponse;
