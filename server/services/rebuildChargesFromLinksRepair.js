const dayjs = require('dayjs');
const { db } = require('../db');
const { ensureDueRentCharges } = require('./chargeService');
const { invalidateRentRegisterCache } = require('./managerDataService');

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/**
 * Cancel year rent charges for a live contract and regenerate from open contract_rooms.
 * Use when ledger charges don't match linked map rooms (ghost areas / duplicate months).
 */
async function rebuildChargesFromLinks({
  propertyId = 1,
  year = 2026,
  tenantLike,
  contractId = null,
  dryRun = true,
  reason = 'rebuild_charges_from_links',
} = {}) {
  const pid = Number(propertyId) || 1;
  const y = Number(year) || dayjs().year();
  const cid = contractId ? Number(contractId) : null;
  if (!tenantLike && !cid) return { error: 'tenantLike_or_contractId_required', dryRun };

  let contract;
  let tenant;
  if (cid) {
    contract = await db('contracts')
      .where({ id: cid, property_id: pid })
      .whereNull('deleted_at')
      .whereIn('status', ['active', 'expiring'])
      .first();
    if (!contract) return { error: 'live_contract_not_found', dryRun, contractId: cid };
    tenant = await db('tenants').where({ id: contract.tenant_id }).first();
  } else {
    tenant = await db('tenants').where('name', 'like', `%${tenantLike}%`).whereNull('deleted_at').first();
    if (!tenant) return { error: 'tenant_not_found', dryRun, tenantLike };

    contract = await db('contracts')
      .where({ tenant_id: tenant.id, property_id: pid })
      .whereNull('deleted_at')
      .whereIn('status', ['active', 'expiring'])
      .orderBy('id', 'asc')
      .first();
    if (!contract) return { error: 'live_contract_not_found', dryRun, tenantLike };
  }

  const links = await db('contract_rooms as cr')
    .join('rooms as r', 'r.id', 'cr.room_id')
    .where('cr.contract_id', contract.id)
    .where(function () {
      this.whereNull('cr.end_date').orWhere('cr.end_date', '>=', dayjs().format('YYYY-MM-DD'));
    })
    .select('r.room_number', 'cr.area', 'cr.rate_without_vat', 'cr.room_id');

  const liveCharges = await db('rent_charges')
    .where({ contract_id: contract.id, period_year: y })
    .whereNot('status', 'cancelled')
    .select('id', 'period_month', 'amount_with_vat', 'area', 'room_id');

  const oldSum = roundMoney(liveCharges.reduce((s, r) => s + Number(r.amount_with_vat || 0), 0));
  const actions = [
    {
      type: 'snapshot_links',
      links: links.map((l) => ({
        roomNumber: l.room_number,
        roomId: l.room_id,
        area: Number(l.area),
        rate: Number(l.rate_without_vat),
      })),
    },
    {
      type: 'cancel_old_charges',
      count: liveCharges.length,
      sum: oldSum,
    },
  ];

  if (!dryRun && liveCharges.length) {
    await db('rent_charges')
      .whereIn(
        'id',
        liveCharges.map((r) => r.id)
      )
      .update({
        status: 'cancelled',
        manual_adjustment: true,
        adjustment_reason: reason,
        updated_at: db.fn.now(),
      });
  }

  let created = [];
  if (!dryRun) {
    created = await ensureDueRentCharges({
      organizationId: contract.organization_id,
      propertyId: pid,
      fromDate: `${y}-01-01`,
      contractId: contract.id,
      onlyLastDue: false,
      userId: null,
    });
    actions.push({ type: 'regenerated', count: created.length });
    invalidateRentRegisterCache(pid);
  }

  const after = dryRun
    ? null
    : await db('rent_charges')
        .where({ contract_id: contract.id, period_year: y })
        .whereNot('status', 'cancelled')
        .select('period_month', 'amount_with_vat', 'area', 'rate_without_vat', 'room_id');

  return {
    dryRun,
    tenantId: tenant.id,
    tenantName: tenant.name,
    contractId: contract.id,
    actions,
    oldSum,
    newSum: after ? roundMoney(after.reduce((s, r) => s + Number(r.amount_with_vat || 0), 0)) : null,
    newCharges: after,
  };
}

module.exports = { rebuildChargesFromLinks };
