/**
 * CLI: импорт Excel ТРК «Квартал» в MySQL
 * Usage: node scripts/import-kvartal.js [path-to.xlsx]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { db, checkConnection } = require('../server/db');
const {
  processExcelImport,
  resolveDefaultExcelPath,
} = require('../server/services/importService');

async function main() {
  const filePath = process.argv[2] || resolveDefaultExcelPath();
  if (!filePath) {
    console.error('Файл Excel не найден. Укажите путь или положите КВАРТАЛ_1АвтоматическиВосстановлено.xlsx в корень проекта.');
    process.exit(1);
  }

  if (!(await checkConnection())) {
    console.error('MySQL не подключена. Проверьте .env и выполните: npm run migrate && npm run seed');
    process.exit(1);
  }

  let org = await db('organizations').where({ status: 'active' }).first();
  if (!org) {
    const [id] = await db('organizations').insert({ name: 'RentSpace.by Demo', status: 'active' });
    org = { id };
  }

  let property = await db('properties').where({ organization_id: org.id, status: 'active' }).first();
  if (!property) {
    const [id] = await db('properties').insert({
      organization_id: org.id,
      name: 'ТРК «Квартал»',
      city: 'Речица',
      address: 'г. Речица',
      status: 'active',
    });
    property = { id };
  }

  const admin = await db('users').where({ role: 'super_admin' }).first();

  console.log('Импорт из:', filePath);
  console.log('Организация:', org.id, 'Объект:', property.id);

  const result = await processExcelImport(
    filePath,
    require('path').basename(filePath),
    org.id,
    property.id,
    admin?.id || null
  );

  console.log('\nИмпорт завершён:');
  console.log(JSON.stringify(result.summary, null, 2));

  if (result.summary.errors > 0) {
    const errors = await db('import_errors').where({ import_batch_id: result.batchId }).limit(10);
    console.log('\nПримеры ошибок:');
    errors.forEach((e) => console.log(`- [${e.sheet_name}] строка ${e.row_number}: ${e.error_message}`));
  }

  await db.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
