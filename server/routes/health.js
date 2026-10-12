const express = require('express');
const config = require('../config');
const { checkConnection } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { repairOrphanOccupiedRooms } = require('../services/orphanLeaseRepairService');
const { ensureKnownLeaseCorrections } = require('../services/knownLeaseCorrections');

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

/** Apply explicit known lease corrections (11а → Медведская, etc.). */
router.post(
  '/repair-known-leases',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const data = await ensureKnownLeaseCorrections();
    res.json({ success: true, data });
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

/** Counts charges vs payments — diagnose missing rent «Опл.» rows. */
router.get(
  '/payment-audit',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const { db } = require('../db');
    const propertyId = Number(req.query.propertyId) || null;
    const year = Number(req.query.year) || new Date().getFullYear();

    let chargesQ = db('rent_charges')
      .where({ period_year: year })
      .whereNot('status', 'cancelled');
    let payQ = db('payments').where({ period_year: year, payment_type: 'rent' });
    let utilQ = db('utility_charges').where({ period_year: year });
    let utilPayQ = db('payments').where({ period_year: year, payment_type: 'utilities' });
    if (propertyId) {
      chargesQ = chargesQ.andWhere({ property_id: propertyId });
      payQ = payQ.andWhere({ property_id: propertyId });
      utilQ = utilQ.andWhere({ property_id: propertyId });
      utilPayQ = utilPayQ.andWhere({ property_id: propertyId });
    }

    const [rentCharges, rentPayments, utilCharges, utilPayments, rentByMonth, payByMonth] =
      await Promise.all([
        chargesQ.clone().count('* as c').sum('amount_with_vat as s').first(),
        payQ.clone().count('* as c').sum('amount as s').first(),
        utilQ.clone().count('* as c').sum('amount as s').first(),
        utilPayQ.clone().count('* as c').sum('amount as s').first(),
        chargesQ
          .clone()
          .groupBy('period_month')
          .sum('amount_with_vat as total')
          .count('* as rows')
          .select('period_month')
          .orderBy('period_month'),
        payQ
          .clone()
          .groupBy('period_month')
          .sum('amount as total')
          .count('* as rows')
          .select('period_month')
          .orderBy('period_month'),
      ]);

    res.json({
      success: true,
      data: {
        propertyId,
        year,
        rentCharges,
        rentPayments,
        utilCharges,
        utilPayments,
        rentByMonth,
        payByMonth,
      },
    });
  })
);

/**
 * Backfill rent payments = charges for months 1..throughMonth where payment is missing/zero.
 * Dry-run by default; pass apply=true to write.
 */
router.post(
  '/backfill-rent-paid',
  asyncHandler(async (req, res) => {
    if (!assertRepairKey(req, res)) return;
    const { db } = require('../db');
    const { invalidateRentRegisterCache } = require('../services/managerDataService');
    const body = req.body || {};
    const propertyId = Number(body.propertyId);
    const year = Number(body.year) || new Date().getFullYear();
    const throughMonth = Math.min(12, Math.max(1, Number(body.throughMonth) || 5));
    const apply = body.apply === true || body.dryRun === false;
    if (!propertyId) {
      res.status(400).json({ success: false, error: 'propertyId required' });
      return;
    }

    const charges = await db('rent_charges')
      .where({ property_id: propertyId, period_year: year })
      .whereNot('status', 'cancelled')
      .where('period_month', '<=', throughMonth)
      .where('amount_with_vat', '>', 0)
      .select(
        'id',
        'organization_id',
        'property_id',
        'tenant_id',
        'contract_id',
        'period_month',
        'amount_with_vat'
      );

    const existing = await db('payments')
      .where({ property_id: propertyId, period_year: year, payment_type: 'rent' })
      .where('period_month', '<=', throughMonth)
      .select('id', 'contract_id', 'period_month', 'amount');

    const paidKey = new Map();
    for (const p of existing) {
      const key = `${p.contract_id}-${p.period_month}`;
      paidKey.set(key, (paidKey.get(key) || 0) + Number(p.amount || 0));
    }

    const planned = [];
    for (const c of charges) {
      if (!c.contract_id) continue;
      const key = `${c.contract_id}-${c.period_month}`;
      const already = paidKey.get(key) || 0;
      const charged = Number(c.amount_with_vat || 0);
      if (already + 0.005 >= charged) continue;
      const amount = Math.round((charged - already) * 100) / 100;
      planned.push({
        contractId: c.contract_id,
        tenantId: c.tenant_id,
        month: c.period_month,
        amount,
        charged,
        alreadyPaid: already,
      });
      paidKey.set(key, already + amount);
    }

    const property = await db('properties').where({ id: propertyId }).first();
    const organizationId = property?.organization_id || charges[0]?.organization_id || null;

    let inserted = 0;
    if (apply) {
      for (const row of planned) {
        await db('payments').insert({
          organization_id: organizationId,
          property_id: propertyId,
          tenant_id: row.tenantId,
          contract_id: row.contractId,
          payment_date: `${year}-${String(row.month).padStart(2, '0')}-10`,
          amount: row.amount,
          payment_type: 'rent',
          period_year: year,
          period_month: row.month,
          purpose: `Арендная оплата (backfill до ${throughMonth}.${year})`,
        });
        inserted += 1;
      }
      invalidateRentRegisterCache(propertyId);
    }

    res.json({
      success: true,
      data: {
        propertyId,
        year,
        throughMonth,
        apply,
        planned: planned.length,
        inserted,
        sample: planned.slice(0, 20),
        totalAmount: Math.round(planned.reduce((s, r) => s + r.amount, 0) * 100) / 100,
      },
    });
  })
);

module.exports = router;
