/**
 * Загрузка реестра арендаторов ТРК «Квартал» (обёртка над sync:kvartal).
 * Usage: npm run seed:tenants
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { db, checkConnection } = require('../server/db');
const { syncKvartalRegister } = require('../server/services/kvartalRegisterService');

async function main() {
  if (!(await checkConnection())) {
    console.error('MySQL не подключена. Проверьте .env');
    process.exit(1);
  }

  const result = await syncKvartalRegister({ years: [2024, 2025, 2026], removeDemo: true });
  console.log('Реестр арендаторов загружен:', result.summary);
  await db.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
