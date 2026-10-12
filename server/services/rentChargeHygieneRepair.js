const { db } = require('../db');
const { maxDueRentMonth } = require('../utils/billingPeriod');
const { invalidateRentRegisterCache } = require('./managerDataService');
const { repairDuplicateContractPayments } = require('./duplicateContractPaymentRepair');

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/**
 * Clean rent_charges that inflate the dashboard:
 * - months after billing due-through (e.g. Nov/Dec before 15th)
 * - charges on soft-deleted contracts
 * - identical duplicate rows for the same contract+month+amount+area
 * - then merge remaining live duplicate contract numbers
 */
async function repairRentChargeHygiene({
  propertyId = 1,
  year = new Date().getFullYear(),
  dryRun = true,
} = {}) {
  const pid = Number(propertyId) || 1;
  const y = Number(year) || new Date().getFullYear();
  const dueThrough = maxDueRentMonth(y);
  const actions = [];
  let cancelledIds = [];

  // 1) Future months (and current month before the 15th)
  const future = await db('rent_charges')
    .where({ property_id: pid, period_year: y })
    .where('period_month', '>', dueThrough)
    .whereNot('status', 'cancelled')
    .select('id', 'contract_id', 'period_month', 'amount_with_vat');
  if (future.length) {
    actions.push({
      type: 'cancel_future_rent_charges',
      dueThrough,
      count: future.length,
      sum: roundMoney(future.reduce((s, r) => s + Number(r.amount_with_vat || 0), 0)),
      byMonth: Object.entries(
        future.reduce((acc, r) => {
          const m = Number(r.period_month);
          acc[m] = (acc[m] || 0) + Number(r.amount_with_vat || 0);
          return acc;
        }, {})
      ).map(([month, sum]) => ({ month: Number(month), sum: roundMoney(sum) })),
    });
    cancelledIds.push(...future.map((r) => r.id));
  }

  // 2) Charges on soft-deleted contracts
  const onDeleted = await db('rent_charges as rc')
    .join('contracts as c', 'c.id', 'rc.contract_id')
    .where({ 'rc.property_id': pid, 'rc.period_year': y })
    .whereNotNull('c.deleted_at')
    .whereNot('rc.status', 'cancelled')
    .select('rc.id', 'rc.contract_id', 'rc.period_month', 'rc.amount_with_vat');
  if (onDeleted.length) {
    actions.push({
      type: 'cancel_charges_on_deleted_contracts',
      count: onDeleted.length,
      sum: roundMoney(onDeleted.reduce((s, r) => s + Number(r.amount_with_vat || 0), 0)),
    });
    cancelledIds.push(...onDeleted.map((r) => r.id));
  }

  // 3) Zero-amount junk rows
  const zeros = await db('rent_charges')
    .where({ property_id: pid, period_year: y })
    .whereNot('status', 'cancelled')
    .where('amount_with_vat', 0)
    .select('id', 'contract_id', 'period_month');
  if (zeros.length) {
    actions.push({ type: 'cancel_zero_rent_charges', count: zeros.length });
    cancelledIds.push(...zeros.map((r) => r.id));
  }

  // 4) Identical duplicates on same live contract + month + amount + area
  const liveCharges = await db('rent_charges as rc')
    .join('contracts as c', 'c.id', 'rc.contract_id')
    .where({ 'rc.property_id': pid, 'rc.period_year': y })
    .whereNull('c.deleted_at')
    .whereNot('rc.status', 'cancelled')
    .where('rc.period_month', '<=', dueThrough)
    .where('rc.amount_with_vat', '>', 0)
    .select(
      'rc.id',
      'rc.contract_id',
      'rc.period_month',
      'rc.amount_with_vat',
      'rc.area',
      'rc.room_id'
    )
    .orderBy(['rc.contract_id', 'rc.period_month', 'rc.id']);

  const seen = new Map();
  const dupIds = [];
  for (const row of liveCharges) {
    if (cancelledIds.includes(row.id)) continue;
    const key = [
      row.contract_id,
      row.period_month,
      Number(row.amount_with_vat),
      Number(row.area),
      row.room_id == null ? 'n' : row.room_id,
    ].join(':');
    if (seen.has(key)) dupIds.push(row.id);
    else seen.set(key, row.id);
  }
  if (dupIds.length) {
    actions.push({ type: 'cancel_identical_duplicate_charges', count: dupIds.length });
    cancelledIds.push(...dupIds);
  }

  cancelledIds = [...new Set(cancelledIds.map(Number))];

  if (!dryRun && cancelledIds.length) {
    // batch update
    const chunk = 500;
    for (let i = 0; i < cancelledIds.length; i += chunk) {
      const slice = cancelledIds.slice(i, i + chunk);
      await db('rent_charges').whereIn('id', slice).update({
        status: 'cancelled',
        manual_adjustment: true,
        adjustment_reason: 'rent_charge_hygiene',
        updated_at: db.fn.now(),
      });
    }
  }

  // 5) Merge remaining live duplicate contract numbers (e.g. Ласица)
  const merge = await repairDuplicateContractPayments({
    propertyId: pid,
    year: y,
    dryRun,
  });

  // 6) After merge, cancel charges still sitting on newly soft-deleted contracts
  let postMergeCancelled = 0;
  if (!dryRun) {
    const leftover = await db('rent_charges as rc')
      .join('contracts as c', 'c.id', 'rc.contract_id')
      .where({ 'rc.property_id': pid, 'rc.period_year': y })
      .whereNotNull('c.deleted_at')
      .whereNot('rc.status', 'cancelled')
      .select('rc.id');
    if (leftover.length) {
      await db('rent_charges')
        .whereIn(
          'id',
          leftover.map((r) => r.id)
        )
        .update({
          status: 'cancelled',
          manual_adjustment: true,
          adjustment_reason: 'rent_charge_hygiene_post_merge',
          updated_at: db.fn.now(),
        });
      postMergeCancelled = leftover.length;
    }
  }

  // Totals by month after (or projected)
  const remaining = await db('rent_charges as rc')
    .join('contracts as c', 'c.id', 'rc.contract_id')
    .where({ 'rc.property_id': pid, 'rc.period_year': y })
    .whereNull('c.deleted_at')
    .whereIn('c.status', ['active', 'expiring'])
    .whereNot('rc.status', 'cancelled')
    .modify((qb) => {
      if (dryRun && cancelledIds.length) qb.whereNotIn('rc.id', cancelledIds);
    })
    .groupBy('rc.period_month')
    .select('rc.period_month')
    .sum('rc.amount_with_vat as s')
    .count('* as c')
    .orderBy('rc.period_month');

  if (!dryRun) {
    invalidateRentRegisterCache(pid);
  }

  return {
    propertyId: pid,
    year: y,
    dryRun,
    dueThrough,
    cancelledCount: cancelledIds.length + postMergeCancelled,
    actions,
    postMergeCancelled,
    duplicateMerge: {
      groupsChanged: merge.groupsChanged,
      paymentsMoved: merge.paymentsMoved,
      planned: (merge.planned || []).map((p) => ({
        tenantName: p.tenantName,
        contractNumber: p.contractNumber,
        canonicalId: p.canonicalId,
        actionTypes: p.actions.map((a) => a.type),
      })),
    },
    monthTotalsAfter: remaining.map((r) => ({
      month: Number(r.period_month),
      count: Number(r.c),
      sum: roundMoney(r.s),
    })),
  };
}

module.exports = {
  repairRentChargeHygiene,
};
