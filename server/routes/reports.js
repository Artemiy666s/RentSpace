const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middlewares/auth');
const { requireOrgAccess } = require('../middlewares/orgAccess');
const { buildRentRegisterWorkbook, buildFreeRoomsWorkbook } = require('../services/reportService');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');

const router = express.Router();
router.use(authenticate, requireOrgAccess());

router.get(
  '/plan-fact',
  asyncHandler(async (req, res) => {
    const rows = await db('plan_fact_items').where({
      property_id: req.query.propertyId,
      period_year: req.query.year || 2026,
    });
    ok(res, rows);
  })
);

router.get(
  '/monthly',
  asyncHandler(async (req, res) => {
    const propertyId = req.query.propertyId;
    const year = Number(req.query.year) || 2026;
    const month = Number(req.query.month) || 1;
    const charges = await db('rent_charges')
      .where({ property_id: propertyId, period_year: year, period_month: month })
      .whereNot('status', 'cancelled');
    const payments = await db('payments')
      .where({ property_id: propertyId, period_year: year, period_month: month });
    const expenses = await db('expenses')
      .where({ property_id: propertyId, period_year: year, period_month: month });
    ok(res, { charges, payments, expenses });
  })
);

router.get(
  '/free-rooms',
  asyncHandler(async (req, res) => {
    const rooms = await db('rooms')
      .where({ property_id: req.query.propertyId })
      .whereIn('status', ['free', 'negotiation', 'reserved'])
      .whereNull('deleted_at');
    ok(res, rooms);
  })
);

router.get(
  '/:type/export/xlsx',
  asyncHandler(async (req, res) => {
    const propertyId = req.query.propertyId;
    const year = Number(req.query.year) || 2026;
    const month = Number(req.query.month) || 1;
    let wb;
    if (req.params.type === 'rent-register') {
      wb = await buildRentRegisterWorkbook(propertyId, year, month);
    } else if (req.params.type === 'free-rooms') {
      wb = await buildFreeRoomsWorkbook(propertyId);
    } else {
      wb = await buildRentRegisterWorkbook(propertyId, year, month);
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=report-${req.params.type}.xlsx`);
    await wb.xlsx.write(res);
  })
);

module.exports = router;
