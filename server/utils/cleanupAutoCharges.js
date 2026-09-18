const { db } = require('../db');
const { cacheDelPrefix } = require('./ttlCache');

let ran = false;

/**
 * 18.09 автогенерация создала начисления с created_by=null и раздула долги (апр/май и т.д.).
 * Однократно снимаем только эти записи; импорт/ручные с userId не трогаем.
 */
async function cleanupSep18AutoCharges() {
  if (ran) return { deleted: 0 };
  ran = true;

  const from = '2026-09-18 00:00:00';
  const to = '2026-09-19 00:00:00';

  const rows = await db('rent_charges')
    .whereNull('created_by')
    .where('created_at', '>=', from)
    .where('created_at', '<', to)
    .whereNot('status', 'cancelled')
    .select('id', 'property_id');

  if (!rows.length) return { deleted: 0 };

  const ids = rows.map((r) => r.id);
  const propertyIds = [...new Set(rows.map((r) => r.property_id).filter(Boolean))];

  await db('rent_charges').whereIn('id', ids).del();

  for (const pid of propertyIds) {
    cacheDelPrefix(`rent-register:${pid}:`);
    cacheDelPrefix(`rent-register:v2:${pid}:`);
  }
  cacheDelPrefix('rent-register:');

  return { deleted: ids.length, propertyIds };
}

module.exports = { cleanupSep18AutoCharges };
