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

  // 5b) Stub contracts: live, no rooms, only late-year charges (typical orphan-repair junk)
  const liveContracts = await db('contracts')
    .where({ property_id: pid })
    .whereNull('deleted_at')
    .whereIn('status', ['active', 'expiring'])
    .select('id', 'tenant_id', 'contract_number');
  const roomCounts = await db('contract_rooms')
    .whereIn(
      'contract_id',
      liveContracts.map((c) => c.id)
    )
    .groupBy('contract_id')
    .count('* as c')
    .select('contract_id');
  const roomMap = Object.fromEntries(roomCounts.map((r) => [r.contract_id, Number(r.c)]));
  const chargeMeta = await db('rent_charges')
    .where({ property_id: pid, period_year: y })
    .whereNot('status', 'cancelled')
    .whereIn(
      'contract_id',
      liveContracts.map((c) => c.id)
    )
    .groupBy('contract_id')
    .select('contract_id')
    .count('* as c')
    .min('period_month as min_m')
    .max('period_month as max_m')
    .sum('amount_with_vat as s');
  const byContract = Object.fromEntries(chargeMeta.map((r) => [r.contract_id, r]));
  const liveByKey = new Map();
  for (const c of liveContracts) {
    const key = `${c.tenant_id}::${String(c.contract_number || '')
      .trim()
      .toLowerCase()}`;
    if (!liveByKey.has(key)) liveByKey.set(key, []);
    liveByKey.get(key).push(c);
  }
  const stubChargeIds = [];
  const stubContractIds = [];
  for (const c of liveContracts) {
    const meta = byContract[c.id];
    if (!meta) continue;
    const rooms = roomMap[c.id] || 0;
    const minM = Number(meta.min_m);
    const count = Number(meta.c);
    if (!(minM >= 9 && count <= 4)) continue;
    const key = `${c.tenant_id}::${String(c.contract_number || '')
      .trim()
      .toLowerCase()}`;
    const siblings = liveByKey.get(key) || [];
    const hasOlderSibling = siblings.some((s) => {
      if (s.id === c.id) return false;
      const sm = byContract[s.id];
      return sm && Number(sm.min_m) < 9;
    });
    // Empty-room late stubs, or late-only duplicate of an older live contract.
    if (rooms === 0 || hasOlderSibling) stubContractIds.push(c.id);
  }
  if (stubContractIds.length) {
    const stubCharges = await db('rent_charges')
      .where({ property_id: pid, period_year: y })
      .whereIn('contract_id', stubContractIds)
      .whereNot('status', 'cancelled')
      .select('id', 'amount_with_vat');
    stubChargeIds.push(...stubCharges.map((r) => r.id));
    actions.push({
      type: 'cancel_empty_stub_late_charges',
      contractCount: stubContractIds.length,
      count: stubChargeIds.length,
      sum: roundMoney(stubCharges.reduce((s, r) => s + Number(r.amount_with_vat || 0), 0)),
      contractIds: stubContractIds.slice(0, 40),
    });
    if (!dryRun) {
      await cancelByIds(stubChargeIds, false, 'rent_charge_hygiene_empty_stub');
      await db('contracts').whereIn('id', stubContractIds).update({
        status: 'terminated',
        deleted_at: db.fn.now(),
        updated_at: db.fn.now(),
      });
    }
  } else {
    actions.push({ type: 'cancel_empty_stub_late_charges', contractCount: 0, count: 0 });
  }

  // 5b2) Legacy contract-level charge (room_id null) + per-room charge same month → drop null.
  // Otherwise ensureDueRentCharges keeps recreating room rows beside the null one (exact ×2).
  const nullBesideRoomIds = [];
  const byContractMonth = new Map();
  for (const row of dups) {
    const key = `${row.contract_id}:${row.period_month}`;
    if (!byContractMonth.has(key)) byContractMonth.set(key, []);
    byContractMonth.get(key).push(row);
  }
  for (const rows of byContractMonth.values()) {
    const hasRoom = rows.some((r) => r.room_id != null);
    if (!hasRoom) continue;
    for (const r of rows) {
      if (r.room_id == null) nullBesideRoomIds.push(r.id);
    }
  }
  actions.push({
    type: 'cancel_null_room_beside_room_charges',
    count: nullBesideRoomIds.length,
    sum: roundMoney(
      nullBesideRoomIds.reduce((s, id) => {
        const row = dups.find((r) => r.id === id);
        return s + Number(row?.amount_with_vat || 0);
      }, 0)
    ),
  });
  const nullBesideN = await cancelByIds(
    nullBesideRoomIds,
    dryRun,
    'rent_charge_hygiene_null_beside_room'
  );
  const nullBesideSet = new Set(nullBesideRoomIds.map(Number));

  // 5c) Same contract: more charge rows in Sept than in earlier months → drop extras.
  // Prefer keeping rows with room_id (and newer/higher amount) so ensureDue does not recreate.
  const septExtraIds = [];
  const byContractCharges = new Map();
  for (const row of dups) {
    if (nullBesideSet.has(Number(row.id))) continue;
    if (!byContractCharges.has(row.contract_id)) byContractCharges.set(row.contract_id, []);
    byContractCharges.get(row.contract_id).push(row);
  }
  for (const [, rows] of byContractCharges) {
    const earlyCounts = {};
    for (let m = 1; m <= 8; m++) earlyCounts[m] = 0;
    const septRows = [];
    for (const r of rows) {
      const m = Number(r.period_month);
      if (m >= 1 && m <= 8) earlyCounts[m] += 1;
      if (m === 9) septRows.push(r);
    }
    const earlyMax = Math.max(0, ...Object.values(earlyCounts));
    if (earlyMax >= 1 && septRows.length > earlyMax) {
      septRows.sort((a, b) => {
        const aRoom = a.room_id != null ? 1 : 0;
        const bRoom = b.room_id != null ? 1 : 0;
        if (bRoom !== aRoom) return bRoom - aRoom;
        const amt = Number(b.amount_with_vat) - Number(a.amount_with_vat);
        if (amt !== 0) return amt;
        return Number(b.id) - Number(a.id);
      });
      const drop = septRows.slice(earlyMax);
      septExtraIds.push(...drop.map((r) => r.id));
    }
  }
  actions.push({
    type: 'cancel_extra_september_rows',
    count: septExtraIds.length,
    sum: roundMoney(
      septExtraIds.reduce((s, id) => {
        const row = dups.find((r) => r.id === id);
        return s + Number(row?.amount_with_vat || 0);
      }, 0)
    ),
  });
  const septExtraN = await cancelByIds(septExtraIds, dryRun, 'rent_charge_hygiene_extra_sept');
  // 6) Optional limited merge of leftover live duplicate contract numbers
  let postMergeCancelled = 0;
  if (Number(mergeLimit) > 0) {
    const merge = await repairDuplicateContractPayments({
      propertyId: pid,
      year: y,
      dryRun,
      limit: Number(mergeLimit),
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

    if (!dryRun) {
      const leftover = await db('rent_charges as rc')
        .join('contracts as c', 'c.id', 'rc.contract_id')
        .where({ 'rc.property_id': pid, 'rc.period_year': y })
        .whereNotNull('c.deleted_at')
        .whereNot('rc.status', 'cancelled')
        .pluck('rc.id');
      postMergeCancelled = await cancelByIds(leftover, false, 'rent_charge_hygiene_post_merge');
    }
  } else {
    actions.push({ type: 'duplicate_contract_merge', skipped: true });
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
    cancelledCount:
      futureN +
      deletedN +
      termN +
      zeroN +
      dupN +
      stubChargeIds.length +
      nullBesideN +
      septExtraN +
      postMergeCancelled,
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
