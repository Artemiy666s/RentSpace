const dayjs = require('dayjs');
const { db } = require('../db');
const { ensureDueRentCharges } = require('./chargeService');
const { invalidateRentRegisterCache } = require('./managerDataService');
const { calcRentAmount } = require('../utils/rent');

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/**
 * Седлер: two rooms with different rates (paper 70.1@9 + 51.9@5).
 * Map rooms: 5а≈66.62 → rate 9, 5≈33.21 → rate 5.
 * Old charges billed both areas at rate 9 (1317.60) + Sept junk rows.
 */
async function repairSedlerCharges({ propertyId = 1, year = 2026, dryRun = true } = {}) {
  const pid = Number(propertyId) || 1;
  const y = Number(year) || dayjs().year();
  const actions = [];

  const tenant = await db('tenants').where('name', 'like', '%Седлер%').whereNull('deleted_at').first();
  if (!tenant) return { error: 'tenant_not_found', dryRun };

  const contract = await db('contracts')
    .where({ tenant_id: tenant.id, property_id: pid })
    .whereNull('deleted_at')
    .whereIn('status', ['active', 'expiring'])
    .orderBy('id', 'asc')
    .first();
  if (!contract) return { error: 'live_contract_not_found', dryRun, tenantId: tenant.id };

  const links = await db('contract_rooms as cr')
    .join('rooms as r', 'r.id', 'cr.room_id')
    .where('cr.contract_id', contract.id)
    .select('cr.id as linkId', 'cr.room_id', 'cr.area', 'cr.rate_without_vat', 'r.room_number', 'r.area as roomArea');

  for (const link of links) {
    const num = String(link.room_number || '').trim().toLowerCase().replace(/а/g, 'a');
    const wantRate = num === '5a' ? 9 : num === '5' ? 5 : null;
    const area = Number(link.roomArea || link.area || 0);
    if (wantRate == null) continue;
    const patch = {};
    if (Math.abs(Number(link.rate_without_vat || 0) - wantRate) > 0.01) {
      patch.rate_without_vat = wantRate;
      actions.push({
        type: 'set_room_rate',
        roomNumber: link.room_number,
        linkId: link.linkId,
        from: Number(link.rate_without_vat),
        to: wantRate,
      });
    }
    if (area > 0 && Math.abs(Number(link.area || 0) - area) > 0.05) {
      patch.area = area;
      actions.push({
        type: 'sync_room_area',
        roomNumber: link.room_number,
        linkId: link.linkId,
        from: Number(link.area),
        to: area,
      });
    }
    if (Object.keys(patch).length && !dryRun) {
      await db('contract_rooms').where({ id: link.linkId }).update(patch);
    }
    if (!dryRun) {
      await db('rooms').where({ id: link.room_id }).update({
        current_rate_without_vat: wantRate,
        updated_at: db.fn.now(),
      });
    }
  }

  const liveCharges = await db('rent_charges')
    .where({ contract_id: contract.id, period_year: y })
    .whereNot('status', 'cancelled')
    .select('id', 'period_month', 'amount_with_vat', 'area', 'rate_without_vat', 'room_id');

  const oldSum = roundMoney(liveCharges.reduce((s, r) => s + Number(r.amount_with_vat || 0), 0));
  actions.push({
    type: 'cancel_old_charges',
    count: liveCharges.length,
    sum: oldSum,
    byMonth: liveCharges.reduce((acc, r) => {
      const m = Number(r.period_month);
      acc[m] = (acc[m] || 0) + 1;
      return acc;
    }, {}),
  });

  if (!dryRun && liveCharges.length) {
    await db('rent_charges')
      .whereIn(
        'id',
        liveCharges.map((r) => r.id)
      )
      .update({
        status: 'cancelled',
        manual_adjustment: true,
        adjustment_reason: 'sedler_dual_rate_rebuild',
        updated_at: db.fn.now(),
      });
  }

  // Expected monthly after rebuild (for report)
  const refreshed = dryRun
    ? links.map((l) => {
        const num = String(l.room_number || '').trim().toLowerCase().replace(/а/g, 'a');
        return {
          room_number: l.room_number,
          area: Number(l.roomArea || l.area || 0),
          rate: num === '5a' ? 9 : 5,
        };
      })
    : await db('contract_rooms as cr')
        .join('rooms as r', 'r.id', 'cr.room_id')
        .where('cr.contract_id', contract.id)
        .select('r.room_number', 'cr.area', 'cr.rate_without_vat as rate');

  let expectedMonthly = 0;
  for (const row of refreshed) {
    const a = calcRentAmount({
      area: Number(row.area),
      rateWithoutVat: Number(row.rate || row.rate_without_vat),
      vatRate: Number(contract.vat_rate || 20),
      year: y,
      month: 1,
      startDate: '2000-01-01',
    });
    expectedMonthly = roundMoney(expectedMonthly + a.amountWithVat);
  }
  actions.push({ type: 'expected_monthly_with_vat', amount: expectedMonthly, rooms: refreshed });

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
    actions.push({ type: 'regenerated_charge_rows', count: created.length });
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
    newChargeSum: after
      ? roundMoney(after.reduce((s, r) => s + Number(r.amount_with_vat || 0), 0))
      : null,
    newCharges: after,
  };
}

module.exports = { repairSedlerCharges };
