const { db, checkConnection } = require('../server/db');

async function run() {
  if (!(await checkConnection())) {
    throw new Error('MySQL: не подключена');
  }
  const tenants = await db('tenants').count('* as c').first();
  const contracts = await db('contracts').count('* as c').first();
  const rooms = await db('rooms').count('* as c').first();
  const charges = await db('rent_charges').count('* as c').first();
  const planFact = await db('plan_fact_items').count('* as c').first();

  console.log('✓ MySQL connected');
  console.log(`  tenants: ${tenants.c}`);
  console.log(`  contracts: ${contracts.c}`);
  console.log(`  rooms: ${rooms.c}`);
  console.log(`  rent_charges: ${charges.c}`);
  console.log(`  plan_fact_items: ${planFact.c}`);

  if (Number(tenants.c) < 1) throw new Error('Нет арендаторов — выполните npm run import:kvartal');
  await db.destroy();
}

run().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
