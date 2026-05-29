const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const useSsl = process.env.DB_SSL === 'true';
const isVercel = !!process.env.VERCEL;

const base = {
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    database: process.env.DB_NAME || 'rent_space',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
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
