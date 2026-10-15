'use strict';
const repository = require('../store/repository');
const { price } = require('./pricing');

module.exports = { place: item => repository.save({ item, total: price(item) }) };
