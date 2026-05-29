const knex = require('knex');
const config = require('../config');
const knexConfig = require('./knexfile');

const env = config.env === 'production' ? 'production' : 'development';
const db = knex(knexConfig[env]);

async function checkConnection() {
  try {
    await db.raw('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

module.exports = { db, checkConnection };
