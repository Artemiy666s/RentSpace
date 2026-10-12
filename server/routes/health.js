const express = require('express');
const config = require('../config');
const { checkConnection } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { repairOrphanOccupiedRooms } = require('../services/orphanLeaseRepairService');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const dbOk = await checkConnection();
    res.json({
      status: 'ok',
      app: config.appName,
      db: dbOk ? 'connected' : 'disconnected',
    });
  })
);

function assertRepairKey(req, res) {
  const key = process.env.REPAIR_KEY;
  const provided = req.get('x-repair-key') || req.query.key;
  if (!key || !provided || provided !== key) {
    res.status(401).json({ success: false, error: 'unauthorized' });
    return false;
  }
  return true;
}

/** Dry-run / apply relink of orphan occupied map rooms to register contracts. */
router.post(
  '/repair-orphan-leases',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const body = req.body || {};
    const result = await repairOrphanOccupiedRooms({
      propertyId: body.propertyId ? Number(body.propertyId) : null,
      buildingId: body.buildingId ? Number(body.buildingId) : null,
      floorId: body.floorId ? Number(body.floorId) : null,
      roomNumbers: Array.isArray(body.roomNumbers) ? body.roomNumbers : null,
      dryRun: body.dryRun !== false && body.apply !== true,
    });
    res.json({ success: true, data: result });
  })
);

/** Inspect register contracts near a target area/rate (debug orphan mapping). */
router.post(
  '/diagnose-lease-matches',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const { db } = require('../db');
    const dayjs = require('dayjs');
    const body = req.body || {};
    const propertyId = Number(body.propertyId) || 1;
    const area = Number(body.area);
    const rate = body.rate != null ? Number(body.rate) : null;
    const asOf = dayjs().format('YYYY-MM-DD');
    let q = db('contracts as c')
      .join('tenants as t', 't.id', 'c.tenant_id')
      .join('contract_rooms as cr', 'cr.contract_id', 'c.id')
      .join('rooms as r', 'r.id', 'cr.room_id')
      .join('floors as f', 'f.id', 'r.floor_id')
      .join('buildings as b', 'b.id', 'r.building_id')
      .where('c.property_id', propertyId)
      .whereIn('c.status', ['active', 'expiring'])
      .whereNull('c.deleted_at')
      .whereNull('t.deleted_at')
      .where(function () {
        this.whereNull('cr.end_date').orWhere('cr.end_date', '>=', asOf);
      })
      .select(
        'c.id as contractId',
        'c.contract_number',
        'c.rate_without_vat as contractRate',
        't.name as tenantName',
        'cr.id as linkId',
        'cr.area as linkArea',
        'cr.rate_without_vat as linkRate',
        'r.id as roomId',
        'r.room_number',
        'r.status as roomStatus',
        'b.name as building',
        'f.name as floor'
      )
      .orderBy('t.name')
      .limit(80);

    if (Number.isFinite(area)) {
      q = q.whereRaw('ABS(cr.area - ?) <= ?', [area, Number(body.areaEps) || 1.5]);
    }
    if (rate != null && Number.isFinite(rate)) {
      q = q.whereRaw(
        'ABS(COALESCE(cr.rate_without_vat, c.rate_without_vat, 0) - ?) <= ?',
        [rate, Number(body.rateEps) || 1]
      );
    }
    if (body.tenantLike) {
      q = q.where('t.name', 'like', `%${body.tenantLike}%`);
    }
    if (body.buildingId) {
      q = q.where('r.building_id', Number(body.buildingId));
    }
    if (body.buildingLike) {
      q = q.where('b.name', 'like', `%${body.buildingLike}%`);
    }

    const rows = await q;

    // Also aggregate by contract total area
    const agg = await db('contracts as c')
      .join('tenants as t', 't.id', 'c.tenant_id')
      .join('contract_rooms as cr', 'cr.contract_id', 'c.id')
      .where('c.property_id', propertyId)
      .whereIn('c.status', ['active', 'expiring'])
      .whereNull('c.deleted_at')
      .whereNull('t.deleted_at')
      .where(function () {
        this.whereNull('cr.end_date').orWhere('cr.end_date', '>=', asOf);
      })
      .groupBy('c.id', 't.name', 'c.contract_number', 'c.rate_without_vat')
      .sum('cr.area as totalArea')
      .avg('cr.rate_without_vat as avgRate')
      .select('c.id as contractId', 't.name as tenantName', 'c.contract_number', 'c.rate_without_vat')
      .modify((qb) => {
        if (Number.isFinite(area)) {
          qb.havingRaw('ABS(SUM(cr.area) - ?) <= ?', [area, Number(body.areaEps) || 1.5]);
        }
      })
      .limit(40);

    res.json({ success: true, data: { links: rows, aggregates: agg } });
  })
);

/**
 * Temporary read-only audit: which contracts form each rent-debt chip.
 * Auth: ?key= or x-repair-key matching REPAIR_KEY, or one-shot TEMP_DEBT_AUDIT_KEY.
 */
router.get(
  '/debt-chip-audit',
  asyncHandler(async (req, res) => {
    const provided = req.get('x-repair-key') || req.query.key;
    const allowed =
      (process.env.REPAIR_KEY && provided === process.env.REPAIR_KEY) ||
      provided === (process.env.TEMP_DEBT_AUDIT_KEY || 'rs-debt-audit-20261012');
    if (!allowed) {
      res.status(401).json({ success: false, error: 'unauthorized' });
      return;
    }

    const { listRentRegister } = require('../services/managerDataService');
    const { maxDueRentMonth } = require('../utils/billingPeriod');
    const { db } = require('../db');

    const propertyId = Number(req.query.propertyId) || 2;
    const year = Number(req.query.year) || new Date().getFullYear();
    const dueThrough = maxDueRentMonth(year);
    const focusMonths = String(req.query.months || '2,3,4,5')
      .split(',')
      .map((x) => Number(x))
      .filter((m) => m >= 1 && m <= 12);

    const rows = await listRentRegister(propertyId, year, null, { ensureCharges: false });
    const debtors = rows.filter((r) => Number(r.debt || 0) > 0.005);

    const roundMoney = (v) => Math.round(Number(v || 0) * 100) / 100;
    const monthTotals = {};
    const contributors = {};

    for (const row of debtors) {
      let remaining = roundMoney(row.debt);
      const yearPaid = Object.values(row.months || {}).reduce(
        (s, x) => s + Number(x.paid || 0),
        0
      );
      for (let m = dueThrough; m >= 1 && remaining > 0.005; m -= 1) {
        const charged = Number(row.months?.[m]?.rent || 0);
        if (charged <= 0) continue;
        const slice = Math.min(charged, remaining);
        const debt = roundMoney(slice);
        if (debt <= 0.005) continue;
        monthTotals[m] = roundMoney((monthTotals[m] || 0) + debt);
        if (!contributors[m]) contributors[m] = [];
        contributors[m].push({
          contractId: row.contractId,
          tenantName: row.tenantName,
          contractLabel: row.contractLabel,
          slice: debt,
          monthCharge: charged,
          contractDebt: roundMoney(row.debt),
          yearPaid: roundMoney(yearPaid),
        });
        remaining = roundMoney(remaining - debt);
      }
    }

    const focus = {};
    for (const m of focusMonths) {
      focus[m] = {
        total: monthTotals[m] || 0,
        contributors: (contributors[m] || []).sort((a, b) => b.slice - a.slice),
      };
    }

    const [paySum, chargeSum] = await Promise.all([
      db('payments')
        .where({ property_id: propertyId, period_year: year, payment_type: 'rent' })
        .sum('amount as s')
        .count('* as c')
        .first(),
      db('rent_charges')
        .where({ property_id: propertyId, period_year: year })
        .whereNot('status', 'cancelled')
        .where('period_month', '<=', dueThrough)
        .sum('amount_with_vat as s')
        .count('* as c')
        .first(),
    ]);

    const near4891 = await db('rent_charges as rc')
      .join('tenants as t', 't.id', 'rc.tenant_id')
      .where({ 'rc.property_id': propertyId, 'rc.period_year': year })
      .whereNot('rc.status', 'cancelled')
      .whereRaw('ABS(rc.amount_with_vat - 4891) < 1')
      .groupBy('rc.contract_id', 't.name')
      .select('rc.contract_id as contractId', 't.name as tenantName')
      .sum('rc.amount_with_vat as sampleAmount')
      .count('* as months');

    res.json({
      success: true,
      data: {
        propertyId,
        year,
        dueThrough,
        totalDebt: roundMoney(debtors.reduce((s, r) => s + Number(r.debt), 0)),
        debtChips: Object.entries(monthTotals)
          .map(([month, amount]) => ({ month: Number(month), amount }))
          .sort((a, b) => b.month - a.month),
        focus,
        yearRentPayments: paySum,
        dueRentCharges: chargeSum,
        chargesNear4891: near4891,
        topDebtors: debtors
          .slice()
          .sort((a, b) => Number(b.debt) - Number(a.debt))
          .slice(0, 15)
          .map((r) => ({
            contractId: r.contractId,
            tenantName: r.tenantName,
            debt: roundMoney(r.debt),
            yearPaid: roundMoney(
              Object.values(r.months || {}).reduce((s, x) => s + Number(x.paid || 0), 0)
            ),
          })),
      },
    });
  })
);

module.exports = router;
