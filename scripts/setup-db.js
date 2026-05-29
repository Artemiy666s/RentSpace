const mysql = require('mysql2/promise');

const ROOT_PASS = process.env.MYSQL_ROOT_PASSWORD || 'root';

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: ROOT_PASS,
  });

  await conn.query(
    "CREATE DATABASE IF NOT EXISTS rent_space CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  );
  await conn.query(
    "CREATE USER IF NOT EXISTS 'rent_space_user'@'localhost' IDENTIFIED BY 'secure_password'"
  );
  await conn.query(
    'GRANT ALL PRIVILEGES ON rent_space.* TO \'rent_space_user\'@\'localhost\''
  );
  await conn.query('FLUSH PRIVILEGES');

  const [rows] = await conn.query('SHOW DATABASES LIKE ?', ['rent_space']);
  console.log('Database rent_space:', rows.length ? 'OK' : 'MISSING');
  await conn.end();
  console.log('User rent_space_user@localhost — OK');
}

main().catch((e) => {
  console.error('Setup failed:', e.message);
  process.exit(1);
});
