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

module.exports = router;
