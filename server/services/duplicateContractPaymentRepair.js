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
 * different contract rows. Debt is per contract_id, so the charge row looks unpaid.
 *
 * Strategy: within each (property, tenant, contract_number) group that has 2+
 * live contracts, pick the canonical row (most rent_charges, then lowest id),
 * and move payments (+ optional utility/rent charge leftovers) onto it.
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

  const contracts = await db('contracts as c')
    .join('tenants as t', 't.id', 'c.tenant_id')
    .where('c.property_id', pid)
    .whereNull('c.deleted_at')
    .whereNull('t.deleted_at')
    .select(
      'c.id',
      'c.tenant_id',
      'c.contract_number',
      'c.status',
      'c.organization_id',
      't.name as tenant_name'
    );

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
        .where({ period_year: y, payment_type: 'rent' })
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

    // Canonical = most rent charges this year; tie-break lower id (usually older/register row).
    const ranked = rows
      .map((r) => ({
        ...r,
        chargeCount: chargeMap[r.id]?.c || 0,
        chargeSum: chargeMap[r.id]?.s || 0,
        payCount: payMap[r.id]?.c || 0,
        paySum: payMap[r.id]?.s || 0,
        utilCount: utilMap[r.id]?.c || 0,
        utilSum: utilMap[r.id]?.s || 0,
      }))
      .sort(
        (a, b) =>
          b.chargeCount - a.chargeCount ||
          b.chargeSum - a.chargeSum ||
          a.id - b.id
      );

    const canonical = ranked[0];
    const duplicates = ranked.slice(1);
    if (!canonical.chargeCount && !duplicates.some((d) => d.payCount > 0)) {
      continue; // nothing useful to merge for this year
    }

    const moveFrom = duplicates.filter(
      (d) => d.payCount > 0 || d.chargeCount > 0 || d.utilCount > 0
    );
    if (!moveFrom.length) continue;

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
      if (dup.id === canonical.id) continue;

      const rentPays = await db('payments')
        .where({ contract_id: dup.id })
        .select('id', 'payment_type', 'period_year', 'period_month', 'amount');
      const utilPays = rentPays.filter((p) => p.payment_type === 'utilities');
      const onlyRent = rentPays.filter((p) => p.payment_type === 'rent');
      // Move ALL payment types for this contract to keep tenant ledger consistent.
      if (rentPays.length) {
        groupPlan.actions.push({
          type: 'move_payments',
          fromContractId: dup.id,
          toContractId: canonical.id,
          count: rentPays.length,
          rentCount: onlyRent.length,
          utilCount: utilPays.length,
          rentSum: roundMoney(onlyRent.reduce((s, p) => s + Number(p.amount || 0), 0)),
          sample: onlyRent.slice(0, 5).map((p) => ({
            id: p.id,
            month: p.period_month,
            amount: Number(p.amount),
          })),
        });
        if (!dryRun) {
          await db('payments').where({ contract_id: dup.id }).update({
            contract_id: canonical.id,
            tenant_id: canonical.tenant_id,
            updated_at: db.fn.now(),
          });
          paymentsMoved += rentPays.length;
        } else {
          paymentsMoved += rentPays.length;
        }
      }

      // If duplicate also has charges for this year, move them only when canonical
      // does not already have the same period (avoid double-counting).
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
            chargesMoved += toMove.length;
          } else {
            chargesMoved += toMove.length;
          }
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
          utilChargesMoved += dupUtils.length;
        } else {
          utilChargesMoved += dupUtils.length;
        }
      }

      // Soft-delete duplicate contract if it no longer holds payments/charges for any year
      // (only when applying). Keep it if still referenced elsewhere.
      if (!dryRun) {
        const [leftPay, leftRent, leftUtil, leftRooms] = await Promise.all([
          db('payments').where({ contract_id: dup.id }).count('* as c').first(),
          db('rent_charges').where({ contract_id: dup.id }).whereNot('status', 'cancelled').count('* as c').first(),
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
    groupsScanned: multi.length,
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
