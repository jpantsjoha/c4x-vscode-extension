'use strict';
const path = require('path');

const rows = [];
module.exports = { save: row => rows.push({ ...row, file: path.join('data', 'orders.json') }) };
