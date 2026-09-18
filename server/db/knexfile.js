const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const isVercel = !!process.env.VERCEL;
const useTidb = Boolean(process.env.TIDB_HOST);
const useSsl = process.env.DB_SSL === 'true' || useTidb;

const base = {
  client: 'mysql2',
  connection: {
    // Production on Vercel reaches TiDB Cloud (TIDB_*), not the legacy DB_HOST:3049 endpoint.
    host: (useTidb ? process.env.TIDB_HOST : process.env.DB_HOST) || 'localhost',
    port: parseInt(
      (useTidb ? process.env.TIDB_PORT : process.env.DB_PORT) || (useTidb ? '4000' : '3306'),
      10
    ),
    database:
      (useTidb ? process.env.TIDB_DATABASE : process.env.DB_NAME) || 'rent_space',
    user: (useTidb ? process.env.TIDB_USER : process.env.DB_USER) || 'root',
    password: (useTidb ? process.env.TIDB_PASSWORD : process.env.DB_PASSWORD) || '',
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
