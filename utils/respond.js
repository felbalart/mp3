// Every response (success or error) is { message, data }.

function ok(res, data, status = 200, message = 'OK') {
    return res.status(status).json({ message, data });
}

function fail(res, status, message, data = {}) {
    return res.status(status).json({ message, data });
}

// Mounted after all routes: any /api path that matched nothing.
function notFoundHandler(req, res) {
    return fail(res, 404, 'Endpoint not found');
}

// Mounted last: turns thrown errors into safe, human readable responses.
// Never forwards Mongoose/MongoDB error messages to the client.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    if (err && err.type === 'entity.parse.failed') {
        return fail(res, 400, 'Request body is not valid JSON');
    }
    if (err && err.code === 11000) {
        return fail(res, 400, 'A user with this email already exists');
    }
    if (err && (err.name === 'ValidationError' || err.name === 'CastError')) {
        return fail(res, 400, 'Request contains invalid data');
    }
    console.error(err);
    return fail(res, 500, 'Something went wrong on the server. Please try again later.');
}

// Used only around queries built from client-supplied where/sort/select:
// was the failure caused by those values (bad operator, mixed projection,
// value that cannot be cast, ...) rather than by the server/database?
function isClientQueryError(err) {
    if (!err) return false;
    // Connectivity problems are the server's fault
    if (/Network|ServerSelection|Timeout|NotConnected/i.test(err.name || '')) return false;
    if (/buffering timed out/i.test(err.message || '')) return false;
    // From the database itself, only "bad value"-style codes are the client's fault
    if (err.name === 'MongoServerError') return [2, 9, 31249, 31250, 31253, 31254].includes(err.code);
    // Everything else is thrown by Mongoose while casting/validating the query
    return true;
}

module.exports = { ok, fail, notFoundHandler, errorHandler, isClientQueryError };
