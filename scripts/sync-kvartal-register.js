/**
 * Синхронизация реестра «аренда по счетам» ТРК «Квартал» в MySQL.
 * Usage: npm run sync:kvartal
 * Env: YEARS=2024,2025,2026 (optional)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { db, checkConnection } = require('../server/db');
const { syncKvartalRegister } = require('../server/services/kvartalRegisterService');

async function main() {
  if (!(await checkConnection())) {
    console.error('MySQL не подключена. Проверьте .env');
    process.exit(1);
  }

  const years = (process.env.YEARS || '2024,2025,2026')
    .split(',')
    .map((y) => Number(y.trim()))
    .filter((y) => y >= 2000 && y <= 2100);

  console.log('Синхронизация реестра ТРК «Квартал»…');
  console.log('Годы начислений:', years.join(', '));

  const result = await syncKvartalRegister({ years, removeDemo: true });

  const tenantCount = await db('tenants').where({ organization_id: result.organizationId }).whereNull('deleted_at').count('* as c');
  const contractCount = await db('contracts').where({ property_id: result.propertyId }).whereNull('deleted_at').count('* as c');
  const chargeCount = await db('rent_charges').where({ property_id: result.propertyId, period_year: years[0] }).count('* as c');

  console.log('\nГотово:', JSON.stringify(result.summary, null, 2));
  console.log(`В БД: арендаторов ${tenantCount[0].c}, договоров ${contractCount[0].c}, начислений за ${years[0]}: ${chargeCount[0].c}`);
  console.log('Проверьте раздел «Аренда по счетам».');

  await db.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
