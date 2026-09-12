'use strict';

const { migrate } = require('./index');
const { config } = require('../config');

migrate();
console.log('Schema applied to ' + config.db.file);
