/**
 * Resolve tenant/contract for map rooms from rent_charges.
 * Covers cases where contract_rooms still point at реестр rooms but charges
 * (and the room card «Начислено») already sit on the map contour.
 */
const dayjs = require('dayjs');
const { db } = require('../db');

function nearly(a, b, eps = 0.35) {
  return Math.abs(Number(a) - Number(b)) <= eps;
}

async function loadLeasesFromRoomCharges(roomIds) {
  const ids = [...new Set((roomIds || []).map((id) => Number(id)).filter(Boolean))];
  const out = new Map();
  if (!ids.length) return out;

  const rows = await db('rent_charges')
    .whereIn('room_id', ids)
    .whereNot('status', 'cancelled')
    .where(function () {
      this.where(function () {
        this.whereNotNull('contract_id').andWhere('contract_id', '>', 0);
      }).orWhere(function () {
        this.whereNotNull('tenant_id').andWhere('tenant_id', '>', 0);
      });
    })
    .select('room_id', 'contract_id', 'tenant_id', 'period_year', 'period_month', 'area')
    .orderBy('period_year', 'desc')
    .orderBy('period_month', 'desc')
    .orderBy('id', 'desc');

  const latestByRoom = new Map();
  for (const row of rows) {
    const rid = Number(row.room_id);
    if (!latestByRoom.has(rid)) latestByRoom.set(rid, row);
  }

  const contractIds = [
    ...new Set(
      [...latestByRoom.values()].map((r) => Number(r.contract_id)).filter(Boolean)
    ),
  ];
  const tenantIds = [
    ...new Set(
      [...latestByRoom.values()].map((r) => Number(r.tenant_id)).filter(Boolean)
    ),
  ];

  const contracts = contractIds.length
    ? await db('contracts as c')
        .join('tenants as t', 't.id', 'c.tenant_id')
        .whereIn('c.id', contractIds)
        .whereNull('c.deleted_at')
        .whereNull('t.deleted_at')
        .select(
          'c.id as contract_id',
          'c.status as contract_status',
          't.id as tenant_id',
          't.name as tenant_name'
        )
    : [];
  const contractMap = new Map(contracts.map((c) => [Number(c.contract_id), c]));

  const tenants = tenantIds.length
    ? await db('tenants')
        .whereIn('id', tenantIds)
        .whereNull('deleted_at')
        .select('id', 'name')
    : [];
  const tenantMap = new Map(tenants.map((t) => [Number(t.id), t]));

  for (const [roomId, charge] of latestByRoom) {
    const fromContract = charge.contract_id
      ? contractMap.get(Number(charge.contract_id))
      : null;
    if (fromContract) {
      out.set(roomId, {
        tenant_id: fromContract.tenant_id,
        tenant_name: fromContract.tenant_name,
        contract_id: fromContract.contract_id,
        contract_status: fromContract.contract_status,
      });
      continue;
    }
    const tenant = charge.tenant_id ? tenantMap.get(Number(charge.tenant_id)) : null;
    if (tenant) {
      out.set(roomId, {
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        contract_id: charge.contract_id || null,
        contract_status: null,
      });
    }
  }

  // Fallback: charges on another room_id, same property + area (реестр vs contour).
  const missing = ids.filter((id) => !out.has(id));
  if (missing.length) {
    const roomRows = await db('rooms')
      .whereIn('id', missing)
      .whereNull('deleted_at')
      .select('id', 'property_id', 'area', 'rentable_area');

    for (const room of roomRows) {
      const area = Number(room.rentable_area || room.area || 0);
      if (!(area > 0) || !room.property_id) continue;

      const candidates = await db('rent_charges as rc')
        .join('contracts as c', 'c.id', 'rc.contract_id')
        .join('tenants as t', 't.id', 'c.tenant_id')
        .where('rc.property_id', room.property_id)
        .whereNot('rc.status', 'cancelled')
        .whereNull('c.deleted_at')
        .whereNull('t.deleted_at')
        .whereNotNull('rc.contract_id')
        .whereRaw('ABS(COALESCE(rc.area, 0) - ?) <= 0.35', [area])
        .select(
          't.id as tenant_id',
          't.name as tenant_name',
          'c.id as contract_id',
          'c.status as contract_status'
        )
        .orderBy('rc.period_year', 'desc')
        .orderBy('rc.period_month', 'desc')
        .limit(8);

      if (!candidates.length) continue;
      const first = candidates[0];
      const consistent = candidates.every(
        (c) =>
          Number(c.contract_id) === Number(first.contract_id) &&
          Number(c.tenant_id) === Number(first.tenant_id)
      );
      if (!consistent) continue;
      out.set(Number(room.id), {
        tenant_id: first.tenant_id,
        tenant_name: first.tenant_name,
        contract_id: first.contract_id,
        contract_status: first.contract_status,
      });
    }
  }

  return out;
}

async function ensureLinksFromChargeLeases(roomIds) {
  const leases = await loadLeasesFromRoomCharges(roomIds);
  if (!leases.size) return leases;

  const asOf = dayjs().format('YYYY-MM-DD');
  const roomRows = await db('rooms')
    .whereIn('id', [...leases.keys()])
    .whereNull('deleted_at')
    .select(
      'id',
      'property_id',
      'area',
      'rentable_area',
      'current_rate_without_vat',
      'status'
    );
  const byId = new Map(roomRows.map((r) => [Number(r.id), r]));

  for (const [roomId, lease] of leases) {
    if (!lease.contract_id) continue;
    if (lease.contract_status && !['active', 'expiring'].includes(lease.contract_status)) {
      continue;
    }
    const room = byId.get(Number(roomId));
    if (!room) continue;
    const roomArea = Number(room.rentable_area || room.area || 0);

    const openLinks = await db('contract_rooms')
      .where({ contract_id: lease.contract_id })
      .where(function () {
        this.whereNull('end_date').orWhere('end_date', '>=', asOf);
      });
    if (openLinks.some((l) => Number(l.room_id) === Number(roomId))) continue;

    for (const link of openLinks) {
      if (!nearly(Number(link.area || 0), roomArea, 0.35)) continue;
      if (Number(link.room_id) === Number(roomId)) continue;
      await db('contract_rooms').where({ id: link.id }).update({
        end_date: asOf,
        updated_at: db.fn.now(),
      });
    }

    const contract = await db('contracts').where({ id: lease.contract_id }).first();
    await db('contract_rooms').insert({
      contract_id: lease.contract_id,
      room_id: roomId,
      area: roomArea,
      rate_without_vat: Number(
        room.current_rate_without_vat || contract?.rate_without_vat || 0
      ),
      start_date: contract?.start_date || asOf,
      end_date: null,
    });

    if (!['occupied', 'debt'].includes(room.status)) {
      await db('rooms').where({ id: roomId }).update({
        status: 'occupied',
        updated_at: db.fn.now(),
      });
    }
    const { invalidateRentRegisterCache } = require('./managerDataService');
    invalidateRentRegisterCache(room.property_id);
  }

  return leases;
}

module.exports = {
  loadLeasesFromRoomCharges,
  ensureLinksFromChargeLeases,
};
