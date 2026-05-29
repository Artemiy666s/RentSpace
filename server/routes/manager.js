const express = require('express');
const { db } = require('../db');
const { authenticate, requireRoles } = require('../middlewares/auth');
const { requireOrgAccess } = require('../middlewares/orgAccess');
const {
  listRoomsTable,
  listTenantsTable,
  listContractsTable,
  listChargesTable,
  listPaymentsTable,
  listRentRegister,
  getPlanFactMatrix,
  upsertPlanFactCell,
  createPlanFactMetric,
  deletePlanFactMetric,
  updatePlanFactMetric,
  updatePlanFactRow,
  getExpensesSummary,
} = require('../services/managerDataService');
const { checkMonth, closeMonth, getMonthReadiness } = require('../services/monthCloseService');
const { startNegotiation, updateNegotiation } = require('../services/negotiationService');
const { generateRentCharges } = require('../services/chargeService');
const {
  buildRentRegisterWorkbook,
  buildFullRentRegisterWorkbook,
  buildPlanFactWorkbook,
  buildMonthCloseReportWorkbook,
  buildMonthCloseHtml,
} = require('../services/reportService');
const asyncHandler = require('../utils/asyncHandler');
const { ok, fail } = require('../utils/response');
const {
  DATA_READ_ROLES,
  OPERATIONAL_ROLES,
  FINANCE_WRITE_ROLES,
  PLAN_FACT_EDIT_ROLES,
} = require('../constants/roles');

const router = express.Router();
router.use(authenticate, requireOrgAccess());

const managerRoles = DATA_READ_ROLES;

router.get(
  '/data/rooms',
  requireRoles(...managerRoles),
  asyncHandler(async (req, res) => {
    const orgId = req.user.role === 'super_admin' ? null : req.user.organizationId;
    ok(res, await listRoomsTable(req.query, orgId));
  })
);

router.get(
  '/data/tenants',
  requireRoles(...managerRoles),
  asyncHandler(async (req, res) => {
    const orgId = req.user.role === 'super_admin' ? null : req.user.organizationId;
    ok(res, await listTenantsTable(req.query, orgId));
  })
);

router.get(
  '/data/contracts',
  requireRoles(...managerRoles),
  asyncHandler(async (req, res) => {
    const orgId = req.user.role === 'super_admin' ? null : req.user.organizationId;
    ok(res, await listContractsTable(req.query, orgId));
  })
);

router.get(
  '/data/charges',
  requireRoles(...managerRoles),
  asyncHandler(async (req, res) => {
    const orgId = req.user.role === 'super_admin' ? null : req.user.organizationId;
    ok(res, await listChargesTable(req.query, orgId));
  })
);

router.get(
  '/data/payments',
  requireRoles(...managerRoles),
  asyncHandler(async (req, res) => {
    const orgId = req.user.role === 'super_admin' ? null : req.user.organizationId;
    ok(res, await listPaymentsTable(req.query, orgId));
  })
);

router.get(
  '/month-readiness',
  requireRoles(...managerRoles),
  asyncHandler(async (req, res) => {
    const propertyId = req.query.propertyId;
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    if (!propertyId) return fail(res, 'Укажите propertyId', 400);
    ok(res, await getMonthReadiness(propertyId, year, month));
  })
);

router.get(
  '/rent-register',
  requireRoles(...managerRoles),
  asyncHandler(async (req, res) => {
    const propertyId = req.query.propertyId;
    const year = Number(req.query.year) || new Date().getFullYear();
    const buildingId = req.query.buildingId;
    if (!propertyId) return fail(res, 'Укажите propertyId', 400);
    ok(res, {
      year,
      months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      rows: await listRentRegister(propertyId, year, buildingId),
    });
  })
);

router.get(
  '/rent-register/export/xlsx',
  requireRoles(...managerRoles),
  asyncHandler(async (req, res) => {
    const propertyId = req.query.propertyId;
    const year = Number(req.query.year) || new Date().getFullYear();
    const buildingId = req.query.buildingId;
    const full = req.query.full !== 'false';
    const months = req.query.months;
    const wb = full
      ? await buildFullRentRegisterWorkbook(propertyId, year, buildingId, months)
      : await buildRentRegisterWorkbook(propertyId, year, Number(req.query.month) || 1);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=rent-register.xlsx');
    await wb.xlsx.write(res);
  })
);

router.get(
  '/plan-fact/export/xlsx',
  requireRoles(...managerRoles),
  asyncHandler(async (req, res) => {
    const propertyId = req.query.propertyId;
    const year = Number(req.query.year) || new Date().getFullYear();
    if (!propertyId) return fail(res, 'Укажите propertyId', 400);
    const wb = await buildPlanFactWorkbook(propertyId, year);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=plan-fact.xlsx');
    await wb.xlsx.write(res);
  })
);

router.get(
  '/month-close/report/xlsx',
  requireRoles(...managerRoles),
  asyncHandler(async (req, res) => {
    const propertyId = req.query.propertyId;
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || 1;
    if (!propertyId) return fail(res, 'Укажите propertyId', 400);
    const wb = await buildMonthCloseReportWorkbook(propertyId, year, month);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=month-report-${year}-${month}.xlsx`);
    await wb.xlsx.write(res);
  })
);

router.get(
  '/month-close/report/pdf',
  requireRoles(...managerRoles),
  asyncHandler(async (req, res) => {
    const propertyId = req.query.propertyId;
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || 1;
    if (!propertyId) return fail(res, 'Укажите propertyId', 400);
    const property = await db('properties').where({ id: propertyId }).first();
    const check = await checkMonth(propertyId, year, month);
    const html = buildMonthCloseHtml(property?.name || 'Объект', year, month, check);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=month-report-${year}-${month}.html`);
    res.send(html);
  })
);

router.get(
  '/plan-fact',
  requireRoles(...managerRoles),
  asyncHandler(async (req, res) => {
    const propertyId = req.query.propertyId;
    const year = Number(req.query.year) || new Date().getFullYear();
    if (!propertyId) return fail(res, 'Укажите propertyId', 400);
    ok(res, await getPlanFactMatrix(Number(propertyId), year));
  })
);

function parsePlanFactNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const n = Number(String(val).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

router.put(
  '/plan-fact/plan',
  requireRoles(...PLAN_FACT_EDIT_ROLES),
  asyncHandler(async (req, res) => {
    const { propertyId, year, month, metricCode, planValue } = req.body;
    const result = await upsertPlanFactCell(req.user.organizationId, propertyId, year, month, metricCode, {
      planValue: parsePlanFactNumber(planValue),
    });
    ok(res, result);
  })
);

router.put(
  '/plan-fact/cell',
  requireRoles(...PLAN_FACT_EDIT_ROLES),
  asyncHandler(async (req, res) => {
    const { propertyId, year, month, metricCode, planValue, factValue, clearFact } = req.body;
    if (!propertyId || !year || !month || !metricCode) {
      return fail(res, 'Укажите propertyId, year, month, metricCode', 400);
    }
    const patch = {};
    if (planValue !== undefined) patch.planValue = parsePlanFactNumber(planValue);
    if (clearFact) patch.factValue = null;
    else if (factValue !== undefined) patch.factValue = parsePlanFactNumber(factValue);

    if (!Object.keys(patch).length) {
      return fail(res, 'Укажите planValue, factValue или clearFact', 400);
    }

    try {
      const result = await upsertPlanFactCell(
        req.user.organizationId,
        Number(propertyId),
        Number(year),
        Number(month),
        String(metricCode),
        patch
      );
      ok(res, result);
    } catch (e) {
      if (e.status === 400) return fail(res, e.message, 400);
      throw e;
    }
  })
);

router.post(
  '/plan-fact/metrics',
  requireRoles(...PLAN_FACT_EDIT_ROLES),
  asyncHandler(async (req, res) => {
    const { propertyId, year, name, unit } = req.body;
    if (!propertyId || !year || !name) {
      return fail(res, 'Укажите propertyId, year, name', 400);
    }
    const result = await createPlanFactMetric(req.user.organizationId, Number(propertyId), Number(year), {
      name,
      unit,
    });
    ok(res, result, 201);
  })
);

router.delete(
  '/plan-fact/metrics/:metricCode',
  requireRoles(...PLAN_FACT_EDIT_ROLES),
  asyncHandler(async (req, res) => {
    const propertyId = Number(req.query.propertyId);
    const year = Number(req.query.year);
    const metricCode = String(req.params.metricCode || '');
    if (!propertyId || !year || !metricCode) {
      return fail(res, 'Укажите propertyId, year, metricCode', 400);
    }
    const result = await deletePlanFactMetric(propertyId, year, metricCode);
    ok(res, result);
  })
);

router.put(
  '/plan-fact/metrics/:metricCode',
  requireRoles(...PLAN_FACT_EDIT_ROLES),
  asyncHandler(async (req, res) => {
    const propertyId = Number(req.body.propertyId);
    const year = Number(req.body.year);
    const metricCode = String(req.params.metricCode || '');
    if (!propertyId || !year || !metricCode) {
      return fail(res, 'Укажите propertyId, year, metricCode', 400);
    }
    try {
      const result = await updatePlanFactMetric(propertyId, year, metricCode, {
        name: req.body.name,
        unit: req.body.unit,
      });
      ok(res, result);
    } catch (e) {
      if (e.status === 400) return fail(res, e.message, 400);
      throw e;
    }
  })
);

router.put(
  '/plan-fact/row',
  requireRoles(...PLAN_FACT_EDIT_ROLES),
  asyncHandler(async (req, res) => {
    const { propertyId, year, metricCode, values } = req.body;
    if (!propertyId || !year || !metricCode) {
      return fail(res, 'Укажите propertyId, year, metricCode', 400);
    }
    const result = await updatePlanFactRow(
      req.user.organizationId,
      Number(propertyId),
      Number(year),
      String(metricCode),
      values
    );
    ok(res, result);
  })
);

router.get(
  '/expenses/summary',
  requireRoles(...managerRoles),
  asyncHandler(async (req, res) => {
    const propertyId = req.query.propertyId;
    const year = Number(req.query.year) || new Date().getFullYear();
    if (!propertyId) return fail(res, 'Укажите propertyId', 400);
    ok(res, await getExpensesSummary(propertyId, year));
  })
);

router.post(
  '/month-close/check',
  requireRoles(...OPERATIONAL_ROLES),
  asyncHandler(async (req, res) => {
    const { propertyId, year, month } = req.body;
    ok(res, await checkMonth(propertyId, year, month));
  })
);

router.post(
  '/month-close/close',
  requireRoles(...OPERATIONAL_ROLES),
  asyncHandler(async (req, res) => {
    const orgId = req.user.organizationId;
    const id = await closeMonth({
      propertyId: req.body.propertyId,
      organizationId: orgId,
      year: req.body.year,
      month: req.body.month,
      userId: req.user.id,
    });
    ok(res, { id, status: 'closed' });
  })
);

router.get(
  '/month-close/:year/:month',
  requireRoles(...managerRoles),
  asyncHandler(async (req, res) => {
    const row = await db('month_closings')
      .where({
        property_id: req.query.propertyId,
        period_year: req.params.year,
        period_month: req.params.month,
      })
      .first();
    ok(res, row || null);
  })
);

router.get(
  '/negotiations',
  requireRoles(...managerRoles),
  asyncHandler(async (req, res) => {
    let q = db('room_negotiations as n')
      .join('rooms as r', 'r.id', 'n.room_id')
      .select('n.*', 'r.room_number', 'r.building_id', 'r.floor_id');
    if (req.query.propertyId) {
      q = q.where('r.property_id', req.query.propertyId);
    }
    ok(res, await q.orderBy('n.updated_at', 'desc'));
  })
);

router.post(
  '/rooms/:roomId/negotiations',
  requireRoles(...OPERATIONAL_ROLES),
  asyncHandler(async (req, res) => {
    const room = await db('rooms').where({ id: req.params.roomId }).first();
    if (!room) return fail(res, 'Помещение не найдено', 404);
    const orgId = req.user.organizationId;
    const row = await startNegotiation({
      roomId: Number(req.params.roomId),
      organizationId: orgId,
      propertyId: room.property_id,
      userId: req.user.id,
      payload: req.body,
      ip: req.ip,
    });
    ok(res, row, 201);
  })
);

router.put(
  '/negotiations/:id',
  requireRoles(...OPERATIONAL_ROLES),
  asyncHandler(async (req, res) => {
    ok(res, await updateNegotiation(req.params.id, req.body));
  })
);

router.post(
  '/rent-charges/generate',
  requireRoles(...FINANCE_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const orgId = req.user.organizationId;
    const ids = await generateRentCharges({
      organizationId: orgId,
      propertyId: req.body.propertyId,
      year: req.body.year,
      month: req.body.month,
      userId: req.user.id,
    });
    ok(res, { created: ids.length, ids });
  })
);

module.exports = router;
