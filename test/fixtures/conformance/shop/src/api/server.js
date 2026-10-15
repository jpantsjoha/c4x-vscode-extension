'use strict';
const http = require('http');
const orders = require('../orders/service');

module.exports = { start: () => http.createServer((req, res) => res.end(String(orders.place('book')))) };
