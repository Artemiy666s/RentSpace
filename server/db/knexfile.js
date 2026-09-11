const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const dbHost = process.env.DB_HOST || process.env.TIDB_HOST || 'localhost';
const useSsl = process.env.DB_SSL === 'true';
const isVercel = !!process.env.VERCEL;

const base = {
  client: 'mysql2',
  connection: {
    host: dbHost,
    port: parseInt(process.env.DB_PORT || process.env.TIDB_PORT || '3306', 10),
    database: process.env.DB_NAME || process.env.TIDB_DATABASE || 'rent_space',
    user: process.env.DB_USER || process.env.TIDB_USER || 'root',
    password: process.env.DB_PASSWORD || process.env.TIDB_PASSWORD || '',
    charset: 'utf8mb4',
    ...(useSsl ? { ssl: { rejectUnauthorized: true } } : {}),
  },
  pool: isVercel ? { min: 0, max: 1 } : { min: 0, max: 10 },
  migrations: {
    directory: path.join(__dirname, '..', 'migrations'),
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: path.join(__dirname, '..', 'seeders'),
  },
};

module.exports = {
  development: { ...base },
  production: { ...base },
};
