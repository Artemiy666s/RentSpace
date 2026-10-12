const { db } = require('../db');
const { invalidateRentRegisterCache } = require('./managerDataService');

function normContractNumber(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/ё/g, 'е');
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/**
 * Payments and charges for the same tenant + contract_number sometimes land on
 * different contract rows (including soft-deleted / legacy low ids).
 * Debt is per contract_id, so the charge row looks unpaid.
 *
 * Strategy:
 * - Group ALL contracts on the property (live + deleted) by tenant + contract_number
 * - Canonical = live row with most non-cancelled rent_charges this year
 * - Move payments / stray charges from every other row in the group onto canonical
 */
async function repairDuplicateContractPayments({
  propertyId,
  year = new Date().getFullYear(),
  dryRun = true,
  contractNumbers = null,
  limit = null,
} = {}) {
  const pid = Number(propertyId);
  if (!pid) {
    const err = new Error('propertyId required');
    err.status = 400;
    throw err;
  }

  const y = Number(year) || new Date().getFullYear();
  const numberFilter = Array.isArray(contractNumbers)
    ? contractNumbers.map(normContractNumber).filter(Boolean)
    : null;

  // Include deleted contracts — payments often still point at them.
  const contracts = await db('contracts as c')
    .join('tenants as t', 't.id', 'c.tenant_id')
    .where('c.property_id', pid)
    .whereNull('t.deleted_at')
    .select(
      'c.id',
      'c.tenant_id',
      'c.contract_number',
      'c.status',
      'c.deleted_at',
      'c.organization_id',
      't.name as tenant_name'
    );

  // Also pull contracts referenced by this year's payments on the property
  // (covers orphans where contract.property_id drifted or row was hard to find).
  const payContractIds = await db('payments')
    .where({ property_id: pid, period_year: y })
    .whereNotNull('contract_id')
    .distinct('contract_id')
    .pluck('contract_id');
  const knownIds = new Set(contracts.map((c) => Number(c.id)));
  const missingPayIds = payContractIds.map(Number).filter((id) => id && !knownIds.has(id));
  if (missingPayIds.length) {
    const extra = await db('contracts as c')
      .join('tenants as t', 't.id', 'c.tenant_id')
      .whereIn('c.id', missingPayIds)
      .select(
        'c.id',
        'c.tenant_id',
        'c.contract_number',
        'c.status',
        'c.deleted_at',
        'c.organization_id',
        't.name as tenant_name'
      );
    contracts.push(...extra);
  }

  const groups = new Map();
  for (const c of contracts) {
    const num = normContractNumber(c.contract_number);
    if (!num) continue;
    if (numberFilter && !numberFilter.includes(num)) continue;
    const key = `${c.tenant_id}::${num}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  const multi = [...groups.entries()].filter(([, rows]) => rows.length > 1);
  const groupsTotal = multi.length;
  const maxGroups = limit != null && Number(limit) > 0 ? Number(limit) : null;
  const planned = [];
  let paymentsMoved = 0;
  let chargesMoved = 0;
  let utilChargesMoved = 0;

  for (const [, rows] of multi) {
    if (maxGroups && planned.length >= maxGroups) break;
    const ids = rows.map((r) => r.id);
    const [chargeCounts, payCounts, utilCounts] = await Promise.all([
      db('rent_charges')
        .whereIn('contract_id', ids)
        .where({ period_year: y })
        .whereNot('status', 'cancelled')
        .groupBy('contract_id')
        .count('* as c')
        .sum('amount_with_vat as s')
        .select('contract_id'),
      db('payments')
        .whereIn('contract_id', ids)
        .where({ period_year: y })
        .groupBy('contract_id')
        .count('* as c')
        .sum('amount as s')
        .select('contract_id'),
      db('utility_charges')
        .whereIn('contract_id', ids)
        .where({ period_year: y })
        .groupBy('contract_id')
        .count('* as c')
        .sum('amount as s')
        .select('contract_id'),
    ]);

    const chargeMap = Object.fromEntries(
      chargeCounts.map((r) => [r.contract_id, { c: Number(r.c), s: Number(r.s || 0) }])
    );
    const payMap = Object.fromEntries(
      payCounts.map((r) => [r.contract_id, { c: Number(r.c), s: Number(r.s || 0) }])
    );
    const utilMap = Object.fromEntries(
      utilCounts.map((r) => [r.contract_id, { c: Number(r.c), s: Number(r.s || 0) }])
    );

    const enriched = rows.map((r) => ({
      ...r,
      live: !r.deleted_at,
      chargeCount: chargeMap[r.id]?.c || 0,
      chargeSum: chargeMap[r.id]?.s || 0,
      payCount: payMap[r.id]?.c || 0,
      paySum: payMap[r.id]?.s || 0,
      utilCount: utilMap[r.id]?.c || 0,
      utilSum: utilMap[r.id]?.s || 0,
    }));

    // Prefer live contracts with charges; never pick a deleted row as canonical.
    const live = enriched.filter((r) => r.live);
    const rankedLive = live
      .slice()
      .sort(
        (a, b) =>
          b.chargeCount - a.chargeCount ||
          b.chargeSum - a.chargeSum ||
          a.id - b.id
      );
    const canonical = rankedLive[0];
    if (!canonical) continue;

    const moveFrom = enriched.filter(
      (d) =>
        d.id !== canonical.id &&
        (d.payCount > 0 || d.chargeCount > 0 || d.utilCount > 0)
    );
    if (!moveFrom.length) continue;

    // Skip groups where nothing is on a non-canonical row with payments
    // and canonical already has all payments — unless charges need merging.
    const hasPayToMove = moveFrom.some((d) => d.payCount > 0);
    const hasChargeToMove = moveFrom.some((d) => d.chargeCount > 0 || d.utilCount > 0);
    if (!hasPayToMove && !hasChargeToMove) continue;

    const groupPlan = {
      tenantName: canonical.tenant_name,
      contractNumber: canonical.contract_number,
      canonicalId: canonical.id,
      canonical: {
        id: canonical.id,
        chargeCount: canonical.chargeCount,
        chargeSum: roundMoney(canonical.chargeSum),
        payCount: canonical.payCount,
        paySum: roundMoney(canonical.paySum),
      },
      duplicates: moveFrom.map((d) => ({
        id: d.id,
        deleted: !d.live,
        chargeCount: d.chargeCount,
        chargeSum: roundMoney(d.chargeSum),
        payCount: d.payCount,
        paySum: roundMoney(d.paySum),
        utilCount: d.utilCount,
        utilSum: roundMoney(d.utilSum),
      })),
      actions: [],
    };

    for (const dup of moveFrom) {
      const allPays = await db('payments')
        .where({ contract_id: dup.id })
        .select('id', 'payment_type', 'period_year', 'period_month', 'amount');
      if (allPays.length) {
        const rentPays = allPays.filter((p) => p.payment_type === 'rent');
        groupPlan.actions.push({
          type: 'move_payments',
          fromContractId: dup.id,
          toContractId: canonical.id,
          fromDeleted: !dup.live,
          count: allPays.length,
          rentCount: rentPays.length,
          rentSum: roundMoney(rentPays.reduce((s, p) => s + Number(p.amount || 0), 0)),
          sample: rentPays.slice(0, 5).map((p) => ({
            id: p.id,
            month: p.period_month,
            amount: Number(p.amount),
          })),
        });
        if (!dryRun) {
          await db('payments').where({ contract_id: dup.id }).update({
            contract_id: canonical.id,
            tenant_id: canonical.tenant_id,
            property_id: pid,
            updated_at: db.fn.now(),
          });
        }
        paymentsMoved += allPays.length;
      }

      const dupCharges = await db('rent_charges')
        .where({ contract_id: dup.id, period_year: y })
        .whereNot('status', 'cancelled')
        .select('id', 'period_month', 'amount_with_vat');
      if (dupCharges.length) {
        const existingMonths = new Set(
          (
            await db('rent_charges')
              .where({ contract_id: canonical.id, period_year: y })
              .whereNot('status', 'cancelled')
              .select('period_month')
          ).map((r) => Number(r.period_month))
        );
        const toMove = dupCharges.filter((c) => !existingMonths.has(Number(c.period_month)));
        const toCancel = dupCharges.filter((c) => existingMonths.has(Number(c.period_month)));
        if (toMove.length) {
          groupPlan.actions.push({
            type: 'move_rent_charges',
            fromContractId: dup.id,
            toContractId: canonical.id,
            count: toMove.length,
            sum: roundMoney(toMove.reduce((s, c) => s + Number(c.amount_with_vat || 0), 0)),
            months: toMove.map((c) => c.period_month),
          });
          if (!dryRun) {
            await db('rent_charges')
              .whereIn(
                'id',
                toMove.map((c) => c.id)
              )
              .update({
                contract_id: canonical.id,
                tenant_id: canonical.tenant_id,
                updated_at: db.fn.now(),
              });
          }
          chargesMoved += toMove.length;
        }
        if (toCancel.length) {
          groupPlan.actions.push({
            type: 'cancel_duplicate_rent_charges',
            fromContractId: dup.id,
            count: toCancel.length,
            months: toCancel.map((c) => c.period_month),
          });
          if (!dryRun) {
            await db('rent_charges')
              .whereIn(
                'id',
                toCancel.map((c) => c.id)
              )
              .update({
                status: 'cancelled',
                manual_adjustment: true,
                adjustment_reason: 'duplicate_contract_merge',
                updated_at: db.fn.now(),
              });
          }
        }
      }

      const dupUtils = await db('utility_charges')
        .where({ contract_id: dup.id, period_year: y })
        .select('id', 'period_month', 'amount');
      if (dupUtils.length) {
        groupPlan.actions.push({
          type: 'move_utility_charges',
          fromContractId: dup.id,
          toContractId: canonical.id,
          count: dupUtils.length,
          sum: roundMoney(dupUtils.reduce((s, c) => s + Number(c.amount || 0), 0)),
        });
        if (!dryRun) {
          await db('utility_charges')
            .whereIn(
              'id',
              dupUtils.map((c) => c.id)
            )
            .update({
              contract_id: canonical.id,
              tenant_id: canonical.tenant_id,
              updated_at: db.fn.now(),
            });
        }
        utilChargesMoved += dupUtils.length;
      }

      if (!dryRun && dup.live) {
        const [leftPay, leftRent, leftUtil, leftRooms] = await Promise.all([
          db('payments').where({ contract_id: dup.id }).count('* as c').first(),
          db('rent_charges')
            .where({ contract_id: dup.id })
            .whereNot('status', 'cancelled')
            .count('* as c')
            .first(),
          db('utility_charges').where({ contract_id: dup.id }).count('* as c').first(),
          db('contract_rooms').where({ contract_id: dup.id }).count('* as c').first(),
        ]);
        const empty =
          Number(leftPay?.c || 0) === 0 &&
          Number(leftRent?.c || 0) === 0 &&
          Number(leftUtil?.c || 0) === 0 &&
          Number(leftRooms?.c || 0) === 0;
        if (empty) {
          await db('contracts').where({ id: dup.id }).update({
            status: 'terminated',
            deleted_at: db.fn.now(),
            updated_at: db.fn.now(),
          });
          groupPlan.actions.push({
            type: 'soft_delete_duplicate_contract',
            contractId: dup.id,
          });
        }
      }
    }

    if (groupPlan.actions.length) planned.push(groupPlan);
  }

  if (!dryRun) {
    invalidateRentRegisterCache(pid);
  }

  return {
    propertyId: pid,
    year: y,
    dryRun,
    groupsTotal,
    groupsScanned: planned.length,
    groupsChanged: planned.length,
    paymentsMoved,
    chargesMoved,
    utilChargesMoved,
    planned,
  };
}

module.exports = {
  repairDuplicateContractPayments,
  normContractNumber,
};
