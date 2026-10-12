/**
 * Idempotent corrections for known bad auto-links.
 * Area-guessing previously mixed tenants on similar rooms; these fixes are explicit.
 */
const dayjs = require('dayjs');
const { db } = require('../db');
const { relinkRoomToContract } = require('./roomService');

function normalizeRoomNumber(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/а/g, 'a')
    .replace(/\s+/g, '');
}

let running = null;

async function fixMedvedskayaOn11a() {
  const asOf = dayjs().format('YYYY-MM-DD');

  const tenants = await db('tenants')
    .whereNull('deleted_at')
    .where('name', 'like', '%Медведск%')
    .select('id', 'name');
  if (!tenants.length) return { skipped: true, reason: 'tenant_not_found' };

  const tenantIds = tenants.map((t) => t.id);
  const contracts = await db('contracts')
    .whereIn('tenant_id', tenantIds)
    .whereNull('deleted_at')
    .whereIn('status', ['active', 'expiring'])
    .where(function () {
      this.where('contract_number', 'like', '%48/02-25%').orWhere(
        'contract_number',
        'like',
        '%48/02‑25%'
      );
    })
    .select('id', 'tenant_id', 'property_id', 'contract_number');

  let contract = contracts[0] || null;
  if (!contract) {
    // Fallback: Medvedskaya contract that already has a ~1 m² open link in the register.
    const byArea = await db('contracts as c')
      .join('contract_rooms as cr', 'cr.contract_id', 'c.id')
      .whereIn('c.tenant_id', tenantIds)
      .whereNull('c.deleted_at')
      .whereIn('c.status', ['active', 'expiring'])
      .where(function () {
        this.whereNull('cr.end_date').orWhere('cr.end_date', '>=', asOf);
      })
      .whereRaw('ABS(COALESCE(cr.area, 0) - 1) <= 0.35')
      .select('c.id', 'c.tenant_id', 'c.property_id', 'c.contract_number')
      .first();
    contract = byArea || null;
  }
  if (!contract) return { skipped: true, reason: 'contract_not_found' };

  const rooms = await db('rooms as r')
    .join('buildings as b', 'b.id', 'r.building_id')
    .whereNull('r.deleted_at')
    .where('r.property_id', contract.property_id)
    .whereRaw('ABS(COALESCE(r.rentable_area, r.area, 0) - 1) <= 0.35')
    .select('r.id', 'r.room_number', 'r.area', 'r.rentable_area', 'b.name as building_name');

  const targets = rooms.filter((r) => normalizeRoomNumber(r.room_number) === '11a');
  if (!targets.length) return { skipped: true, reason: 'room_11a_not_found' };

  // Prefer Советская 62 when several 11a exist.
  targets.sort((a, b) => {
    const score = (r) => (/советск/i.test(r.building_name) ? 0 : 1);
    return score(a) - score(b);
  });

  const room = targets[0];
  const active = await db('contract_rooms as cr')
    .join('contracts as c', 'c.id', 'cr.contract_id')
    .join('tenants as t', 't.id', 'c.tenant_id')
    .where('cr.room_id', room.id)
    .whereIn('c.status', ['active', 'expiring'])
    .whereNull('c.deleted_at')
    .where(function () {
      this.whereNull('cr.end_date').orWhere('cr.end_date', '>=', asOf);
    })
    .select('c.id as contract_id', 't.name as tenant_name')
    .first();

  if (active && Number(active.contract_id) === Number(contract.id)) {
    return {
      skipped: true,
      reason: 'already_linked',
      roomId: room.id,
      contractId: contract.id,
      tenantName: active.tenant_name,
    };
  }

  await relinkRoomToContract({
    roomId: room.id,
    contractId: contract.id,
    userId: null,
    organizationId: null,
    propertyId: contract.property_id,
    ip: null,
  });

  return {
    fixed: true,
    roomId: room.id,
    roomNumber: room.room_number,
    contractId: contract.id,
    contractNumber: contract.contract_number,
    previousTenant: active?.tenant_name || null,
  };
}

async function ensureKnownLeaseCorrections() {
  if (running) return running;
  running = (async () => {
    const results = [];
    try {
      results.push({ key: '11a-medvedskaya', ...(await fixMedvedskayaOn11a()) });
    } catch (err) {
      results.push({
        key: '11a-medvedskaya',
        error: err.message || String(err),
      });
    }
    if (results.some((r) => r.error)) running = null;
    return results;
  })();
  return running;
}

module.exports = {
  ensureKnownLeaseCorrections,
  fixMedvedskayaOn11a,
};
