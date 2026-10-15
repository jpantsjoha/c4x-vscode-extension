'use strict';
// Test files are excluded from the check by default: this import would
// otherwise be an undeclared orders -> api dependency.
const server = require('../api/server');

module.exports = { server };
