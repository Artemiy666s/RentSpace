/**
 * Resolve tenant/contract for map rooms from rent_charges already posted on them.
 * Used when contract_rooms still point at реестр rooms but charges were written to the map room.
 */
const { db } = require('../db');

async function loadLeasesFromRoomCharges(roomIds) {
  const ids = [...new Set((roomIds || []).map((id) => Number(id)).filter(Boolean))];
  const out = new Map();
  if (!ids.length) return out;

  const rows = await db('rent_charges as rc')
    .whereIn('rc.room_id', ids)
    .whereNot('rc.status', 'cancelled')
    .where(function () {
      this.where(function () {
        this.whereNotNull('rc.contract_id').andWhere('rc.contract_id', '>', 0);
      }).orWhere(function () {
        this.whereNotNull('rc.tenant_id').andWhere('rc.tenant_id', '>', 0);
      });
    })
    .select(
      'rc.room_id',
      'rc.contract_id',
      'rc.tenant_id',
      'rc.period_year',
      'rc.period_month',
      'rc.amount_with_vat'
    )
    .orderBy('rc.period_year', 'desc')
    .orderBy('rc.period_month', 'desc')
    .orderBy('rc.id', 'desc');

  const latestByRoom = new Map();
  for (const row of rows) {
    const rid = Number(row.room_id);
    if (!latestByRoom.has(rid)) latestByRoom.set(rid, row);
  }

  for (const [roomId, charge] of latestByRoom) {
    if (charge.contract_id) {
      const row = await db('contracts as c')
        .join('tenants as t', 't.id', 'c.tenant_id')
        .where('c.id', charge.contract_id)
        .whereNull('c.deleted_at')
        .whereNull('t.deleted_at')
        .select(
          't.id as tenant_id',
          't.name as tenant_name',
          'c.id as contract_id',
          'c.status as contract_status'
        )
        .first();
      if (row) {
        out.set(roomId, row);
        continue;
      }
    }
    if (charge.tenant_id) {
      const tenant = await db('tenants')
        .where({ id: charge.tenant_id })
        .whereNull('deleted_at')
        .select('id', 'name', 'status')
        .first();
      if (tenant) {
        out.set(roomId, {
          tenant_id: tenant.id,
          tenant_name: tenant.name,
          contract_id: charge.contract_id || null,
          contract_status: null,
        });
      }
    }
  }

  return out;
}

module.exports = { loadLeasesFromRoomCharges };
