/**
 * Resolve tenant/contract for map rooms from rent_charges.
 * Fast path: charges already on the map room_id (2–3 queries).
 * Optional byArea: match реестр charges by property+area (heavier; use off the hot map path).
 */
const dayjs = require('dayjs');
const { db } = require('../db');

function nearly(a, b, eps = 0.35) {
  return Math.abs(Number(a) - Number(b)) <= eps;
}

async function loadLeasesFromRoomCharges(roomIds, { byArea = false } = {}) {
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

  const [contracts, tenants] = await Promise.all([
    contractIds.length
      ? db('contracts as c')
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
      : Promise.resolve([]),
    tenantIds.length
      ? db('tenants').whereIn('id', tenantIds).whereNull('deleted_at').select('id', 'name')
      : Promise.resolve([]),
  ]);
  const contractMap = new Map(contracts.map((c) => [Number(c.contract_id), c]));
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

  if (!byArea) return out;

  // Batched area fallback (one query per property, not per room).
  const missing = ids.filter((id) => !out.has(id));
  if (!missing.length) return out;

  const roomRows = await db('rooms')
    .whereIn('id', missing)
    .whereNull('deleted_at')
    .select('id', 'property_id', 'area', 'rentable_area');
  if (!roomRows.length) return out;

  const byProperty = new Map();
  for (const room of roomRows) {
    const pid = Number(room.property_id);
    if (!byProperty.has(pid)) byProperty.set(pid, []);
    byProperty.get(pid).push(room);
  }

  for (const [propertyId, rooms] of byProperty) {
    const areas = rooms.map((r) => Number(r.rentable_area || r.area || 0)).filter((a) => a > 0);
    if (!areas.length) continue;
    const minA = Math.min(...areas) - 0.35;
    const maxA = Math.max(...areas) + 0.35;

    const candidates = await db('rent_charges as rc')
      .join('contracts as c', 'c.id', 'rc.contract_id')
      .join('tenants as t', 't.id', 'c.tenant_id')
      .where('rc.property_id', propertyId)
      .whereNot('rc.status', 'cancelled')
      .whereNull('c.deleted_at')
      .whereNull('t.deleted_at')
      .whereNotNull('rc.contract_id')
      .whereBetween('rc.area', [minA, maxA])
      .select(
        'rc.area as charge_area',
        't.id as tenant_id',
        't.name as tenant_name',
        'c.id as contract_id',
        'c.status as contract_status',
        'rc.period_year',
        'rc.period_month'
      )
      .orderBy('rc.period_year', 'desc')
      .orderBy('rc.period_month', 'desc')
      .limit(200);

    for (const room of rooms) {
      const area = Number(room.rentable_area || room.area || 0);
      const hits = candidates.filter((c) => nearly(c.charge_area, area, 0.35)).slice(0, 8);
      if (!hits.length) continue;
      const first = hits[0];
      const consistent = hits.every(
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

async function ensureLinksFromChargeLeases(roomIds, { byArea = false } = {}) {
  const leases = await loadLeasesFromRoomCharges(roomIds, { byArea });
  if (!leases.size) return leases;

  const asOf = dayjs().format('YYYY-MM-DD');
  const leaseRoomIds = [...leases.keys()];
  const roomRows = await db('rooms')
    .whereIn('id', leaseRoomIds)
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

  const contractIds = [
    ...new Set([...leases.values()].map((l) => Number(l.contract_id)).filter(Boolean)),
  ];
  const [openLinks, contracts] = await Promise.all([
    contractIds.length
      ? db('contract_rooms')
          .whereIn('contract_id', contractIds)
          .where(function () {
            this.whereNull('end_date').orWhere('end_date', '>=', asOf);
          })
      : Promise.resolve([]),
    contractIds.length
      ? db('contracts').whereIn('id', contractIds).select('id', 'start_date', 'rate_without_vat')
      : Promise.resolve([]),
  ]);
  const linksByContract = new Map();
  for (const link of openLinks) {
    const cid = Number(link.contract_id);
    if (!linksByContract.has(cid)) linksByContract.set(cid, []);
    linksByContract.get(cid).push(link);
  }
  const contractMap = new Map(contracts.map((c) => [Number(c.id), c]));

  const toClose = [];
  const toInsert = [];
  const statusUpdates = [];
  const touchedProperties = new Set();

  for (const [roomId, lease] of leases) {
    if (!lease.contract_id) continue;
    if (lease.contract_status && !['active', 'expiring'].includes(lease.contract_status)) {
      continue;
    }
    const room = byId.get(Number(roomId));
    if (!room) continue;
    const roomArea = Number(room.rentable_area || room.area || 0);
    const links = linksByContract.get(Number(lease.contract_id)) || [];
    if (links.some((l) => Number(l.room_id) === Number(roomId))) continue;

    for (const link of links) {
      if (!nearly(Number(link.area || 0), roomArea, 0.35)) continue;
      if (Number(link.room_id) === Number(roomId)) continue;
      toClose.push(link.id);
    }

    const contract = contractMap.get(Number(lease.contract_id));
    toInsert.push({
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
      statusUpdates.push(roomId);
    }
    touchedProperties.add(room.property_id);
  }

  if (toClose.length) {
    await db('contract_rooms').whereIn('id', toClose).update({
      end_date: asOf,
      updated_at: db.fn.now(),
    });
  }
  if (toInsert.length) {
    await db('contract_rooms').insert(toInsert);
  }
  if (statusUpdates.length) {
    await db('rooms').whereIn('id', statusUpdates).update({
      status: 'occupied',
      updated_at: db.fn.now(),
    });
  }
  if (touchedProperties.size) {
    const { invalidateRentRegisterCache } = require('./managerDataService');
    for (const propertyId of touchedProperties) {
      invalidateRentRegisterCache(propertyId);
    }
  }

  return leases;
}

module.exports = {
  loadLeasesFromRoomCharges,
  ensureLinksFromChargeLeases,
};
