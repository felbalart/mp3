/*
 * Connect all of your endpoints together here.
 */
const { notFoundHandler } = require('../utils/respond');

module.exports = function (app, router) {
    app.use('/api', require('./home.js')(router));
    app.use('/api/users', require('./users.js'));
    app.use('/api/tasks', require('./tasks.js'));
    app.use('/api', notFoundHandler);
};
