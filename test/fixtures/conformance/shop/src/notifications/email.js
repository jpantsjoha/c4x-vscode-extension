'use strict';
const mailer = require('../mailer');

module.exports = { send: to => mailer.deliver(to, 'Your order') };
