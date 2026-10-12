const { db } = require('../db');
const { maxDueRentMonth } = require('../utils/billingPeriod');
const { invalidateRentRegisterCache } = require('./managerDataService');
const { repairDuplicateContractPayments } = require('./duplicateContractPaymentRepair');

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

async function cancelByIds(ids, dryRun, reason) {
  const unique = [...new Set(ids.map(Number).filter(Boolean))];
  if (!unique.length) return 0;
  if (!dryRun) {
    const chunk = 400;
    for (let i = 0; i < unique.length; i += chunk) {
      await db('rent_charges')
        .whereIn('id', unique.slice(i, i + chunk))
        .update({
          status: 'cancelled',
          manual_adjustment: true,
          adjustment_reason: reason,
          updated_at: db.fn.now(),
        });
    }
  }
  return unique.length;
}

/**
 * Clean rent_charges that inflate the dashboard chart.
 */
async function repairRentChargeHygiene({
  propertyId = 1,
  year = new Date().getFullYear(),
  dryRun = true,
  mergeLimit = 25,
} = {}) {
  const pid = Number(propertyId) || 1;
  const y = Number(year) || new Date().getFullYear();
  const dueThrough = maxDueRentMonth(y);
  const actions = [];

  // 1) Future months
  const future = await db('rent_charges')
    .where({ property_id: pid, period_year: y })
    .where('period_month', '>', dueThrough)
    .whereNot('status', 'cancelled')
    .select('id', 'period_month', 'amount_with_vat');
  const futureByMonth = {};
  for (const r of future) {
    const m = Number(r.period_month);
    futureByMonth[m] = (futureByMonth[m] || 0) + Number(r.amount_with_vat || 0);
  }
  actions.push({
    type: 'cancel_future_rent_charges',
    dueThrough,
    count: future.length,
    sum: roundMoney(future.reduce((s, r) => s + Number(r.amount_with_vat || 0), 0)),
    byMonth: Object.entries(futureByMonth).map(([month, sum]) => ({
      month: Number(month),
      sum: roundMoney(sum),
    })),
  });
  const futureN = await cancelByIds(
    future.map((r) => r.id),
    dryRun,
    'rent_charge_hygiene_future'
  );

  // 2) Soft-deleted contracts
  const onDeleted = await db('rent_charges as rc')
    .join('contracts as c', 'c.id', 'rc.contract_id')
    .where({ 'rc.property_id': pid, 'rc.period_year': y })
    .whereNotNull('c.deleted_at')
    .whereNot('rc.status', 'cancelled')
    .pluck('rc.id');
  actions.push({ type: 'cancel_charges_on_deleted_contracts', count: onDeleted.length });
  const deletedN = await cancelByIds(onDeleted, dryRun, 'rent_charge_hygiene_deleted_contract');

  // 3) Terminated/completed still not soft-deleted (no longer in register)
  const onTerminated = await db('rent_charges as rc')
    .join('contracts as c', 'c.id', 'rc.contract_id')
    .where({ 'rc.property_id': pid, 'rc.period_year': y })
    .whereNull('c.deleted_at')
    .whereIn('c.status', ['terminated', 'completed', 'archived'])
    .whereNot('rc.status', 'cancelled')
    .pluck('rc.id');
  actions.push({ type: 'cancel_charges_on_terminated_contracts', count: onTerminated.length });
  const termN = await cancelByIds(onTerminated, dryRun, 'rent_charge_hygiene_terminated');

  // 4) Zero rows
  const zeros = await db('rent_charges')
    .where({ property_id: pid, period_year: y })
    .whereNot('status', 'cancelled')
    .where('amount_with_vat', 0)
    .pluck('id');
  actions.push({ type: 'cancel_zero_rent_charges', count: zeros.length });
  const zeroN = await cancelByIds(zeros, dryRun, 'rent_charge_hygiene_zero');

  // 5) Identical duplicates (same contract, month, amount, area, room)
  const dups = await db('rent_charges as rc')
    .join('contracts as c', 'c.id', 'rc.contract_id')
    .where({ 'rc.property_id': pid, 'rc.period_year': y })
    .whereNull('c.deleted_at')
    .whereIn('c.status', ['active', 'expiring'])
    .whereNot('rc.status', 'cancelled')
    .where('rc.amount_with_vat', '>', 0)
    .where('rc.period_month', '<=', dueThrough)
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
  for (const row of dups) {
    const key = `${row.contract_id}:${row.period_month}:${Number(row.amount_with_vat)}:${Number(row.area)}:${row.room_id ?? 'n'}`;
    if (seen.has(key)) dupIds.push(row.id);
    else seen.set(key, row.id);
  }
  actions.push({ type: 'cancel_identical_duplicate_charges', count: dupIds.length });
  const dupN = await cancelByIds(dupIds, dryRun, 'rent_charge_hygiene_identical_dup');

  // 6) Limited merge of leftover live duplicate contract numbers
  const merge = await repairDuplicateContractPayments({
    propertyId: pid,
    year: y,
    dryRun,
    limit: mergeLimit,
  });
  actions.push({
    type: 'duplicate_contract_merge',
    groupsChanged: merge.groupsChanged,
    paymentsMoved: merge.paymentsMoved,
    sample: (merge.planned || []).slice(0, 15).map((p) => ({
      tenantName: p.tenantName,
      contractNumber: p.contractNumber,
      canonicalId: p.canonicalId,
      actionTypes: p.actions.map((a) => a.type),
    })),
  });

  let postMergeCancelled = 0;
  if (!dryRun) {
    const leftover = await db('rent_charges as rc')
      .join('contracts as c', 'c.id', 'rc.contract_id')
      .where({ 'rc.property_id': pid, 'rc.period_year': y })
      .whereNotNull('c.deleted_at')
      .whereNot('rc.status', 'cancelled')
      .pluck('rc.id');
    postMergeCancelled = await cancelByIds(leftover, false, 'rent_charge_hygiene_post_merge');
  }

  const monthTotalsAfter = await db('rent_charges as rc')
    .join('contracts as c', 'c.id', 'rc.contract_id')
    .where({ 'rc.property_id': pid, 'rc.period_year': y })
    .whereNull('c.deleted_at')
    .whereIn('c.status', ['active', 'expiring'])
    .whereNot('rc.status', 'cancelled')
    .where('rc.period_month', '<=', dueThrough)
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
    cancelledCount: futureN + deletedN + termN + zeroN + dupN + postMergeCancelled,
    actions,
    postMergeCancelled,
    monthTotalsAfter: monthTotalsAfter.map((r) => ({
      month: Number(r.period_month),
      count: Number(r.c),
      sum: roundMoney(r.s),
    })),
  };
}

module.exports = {
  repairRentChargeHygiene,
};
