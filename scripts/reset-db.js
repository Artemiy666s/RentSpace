const mysql = require('mysql2/promise');

async function main() {
  const c = await mysql.createConnection({ user: 'root', password: process.env.MYSQL_ROOT_PASSWORD || 'root' });
  await c.query('DROP DATABASE IF EXISTS rent_space');
  await c.query('CREATE DATABASE rent_space CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await c.query("CREATE USER IF NOT EXISTS 'rent_space_user'@'localhost' IDENTIFIED BY 'secure_password'");
  await c.query('GRANT ALL PRIVILEGES ON rent_space.* TO `rent_space_user`@`localhost`');
  await c.query('FLUSH PRIVILEGES');
  await c.end();
  console.log('Database reset OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
