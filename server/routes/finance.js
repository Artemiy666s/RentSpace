const express = require('express');
const { db } = require('../db');
const { authenticate, requireRoles } = require('../middlewares/auth');
const { requireOrgAccess } = require('../middlewares/orgAccess');
const { generateRentCharges } = require('../services/chargeService');
const {
  buildRentChargesWorkbook,
  buildPaymentsWorkbook,
  buildExpensesWorkbook,
} = require('../services/reportService');
const asyncHandler = require('../utils/asyncHandler');
const { ok, fail } = require('../utils/response');
const { FINANCE_WRITE_ROLES } = require('../constants/roles');

const router = express.Router();
router.use(authenticate, requireOrgAccess());

// Rent charges
router.get(
  '/rent-charges',
  asyncHandler(async (req, res) => {
    let q = db('rent_charges as rc')
      .join('tenants as t', 't.id', 'rc.tenant_id')
      .select('rc.*', 't.name as tenant_name');
    if (req.user.role !== 'super_admin') q = q.where('rc.organization_id', req.user.organizationId);
    if (req.query.propertyId) q = q.where('rc.property_id', req.query.propertyId);
    if (req.query.year) q = q.where('rc.period_year', req.query.year);
    if (req.query.month) q = q.where('rc.period_month', req.query.month);
    ok(res, await q.orderBy(['rc.period_year', 'rc.period_month'], 'desc'));
  })
);

router.get(
  '/rent-charges/export/xlsx',
  asyncHandler(async (req, res) => {
    const orgId = req.user.role === 'super_admin' ? null : req.user.organizationId;
    const wb = await buildRentChargesWorkbook(
      req.query.propertyId,
      Number(req.query.year),
      Number(req.query.month),
      orgId
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename=rent-charges.xlsx');
    await wb.xlsx.write(res);
    res.end();
  })
);

router.post(
  '/rent-charges/generate',
  requireRoles(...FINANCE_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const orgId = req.user.organizationId || req.body.organizationId;
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

router.put(
  '/rent-charges/:id/adjust',
  requireRoles(...FINANCE_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    if (!req.body.adjustmentReason) return fail(res, 'Укажите причину корректировки');
    await db('rent_charges').where({ id: req.params.id }).update({
      amount_without_vat: req.body.amountWithoutVat,
      vat_amount: req.body.vatAmount,
      amount_with_vat: req.body.amountWithVat,
      manual_adjustment: true,
      adjustment_reason: req.body.adjustmentReason,
      updated_at: db.fn.now(),
    });
    ok(res, await db('rent_charges').where({ id: req.params.id }).first());
  })
);

// Utility charges
router.get(
  '/utility-charges',
  asyncHandler(async (req, res) => {
    let q = db('utility_charges');
    if (req.user.role !== 'super_admin') q = q.where('organization_id', req.user.organizationId);
    if (req.query.propertyId) q = q.where('property_id', req.query.propertyId);
    ok(res, await q);
  })
);

router.post(
  '/utility-charges',
  requireRoles(...FINANCE_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const orgId = req.user.organizationId || req.body.organizationId;
    const [id] = await db('utility_charges').insert({
      organization_id: orgId,
      property_id: req.body.propertyId,
      tenant_id: req.body.tenantId,
      contract_id: req.body.contractId,
      room_id: req.body.roomId,
      period_year: req.body.year,
      period_month: req.body.month,
      utility_type: req.body.utilityType || 'other',
      calculation_method: req.body.calculationMethod || 'manual',
      amount: req.body.amount,
      comment: req.body.comment,
      created_by: req.user.id,
    });
    ok(res, { id }, 201);
  })
);

// Payments
router.get(
  '/payments',
  asyncHandler(async (req, res) => {
    let q = db('payments as p')
      .join('tenants as t', 't.id', 'p.tenant_id')
      .select('p.*', 't.name as tenant_name');
    if (req.user.role !== 'super_admin') q = q.where('p.organization_id', req.user.organizationId);
    if (req.query.propertyId) q = q.where('p.property_id', req.query.propertyId);
    if (req.query.year) q = q.where('p.period_year', req.query.year);
    if (req.query.month) q = q.where('p.period_month', req.query.month);
    ok(res, await q.orderBy('p.payment_date', 'desc'));
  })
);

router.get(
  '/payments/export/xlsx',
  asyncHandler(async (req, res) => {
    const orgId = req.user.role === 'super_admin' ? null : req.user.organizationId;
    const wb = await buildPaymentsWorkbook(
      req.query.propertyId,
      req.query.year ? Number(req.query.year) : null,
      req.query.month ? Number(req.query.month) : null,
      orgId
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename=payments.xlsx');
    await wb.xlsx.write(res);
    res.end();
  })
);

router.get(
  '/expenses/export/xlsx',
  asyncHandler(async (req, res) => {
    const orgId = req.user.role === 'super_admin' ? null : req.user.organizationId;
    const wb = await buildExpensesWorkbook(
      req.query.propertyId,
      Number(req.query.year) || new Date().getFullYear(),
      req.query.months,
      orgId
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename=expenses.xlsx');
    await wb.xlsx.write(res);
    res.end();
  })
);

router.post(
  '/payments',
  requireRoles(...FINANCE_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const orgId = req.user.organizationId || req.body.organizationId;
    const [id] = await db('payments').insert({
      organization_id: orgId,
      property_id: req.body.propertyId,
      tenant_id: req.body.tenantId,
      contract_id: req.body.contractId,
      payment_date: req.body.paymentDate,
      amount: req.body.amount,
      payment_type: req.body.paymentType || 'rent',
      period_year: req.body.periodYear,
      period_month: req.body.periodMonth,
      purpose: req.body.purpose,
      comment: req.body.comment,
      created_by: req.user.id,
    });
    ok(res, { id }, 201);
  })
);

router.put(
  '/payments/:id',
  requireRoles(...FINANCE_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    await db('payments').where({ id: req.params.id }).update({
      payment_date: req.body.paymentDate,
      amount: req.body.amount,
      purpose: req.body.purpose,
      comment: req.body.comment,
      updated_at: db.fn.now(),
    });
    ok(res, await db('payments').where({ id: req.params.id }).first());
  })
);

router.delete(
  '/payments/:id',
  requireRoles(...FINANCE_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    await db('payments').where({ id: req.params.id }).delete();
    ok(res, { deleted: true });
  })
);

// Expenses
router.get(
  '/expenses',
  asyncHandler(async (req, res) => {
    let q = db('expenses');
    if (req.user.role !== 'super_admin') q = q.where('organization_id', req.user.organizationId);
    if (req.query.propertyId) q = q.where('property_id', req.query.propertyId);
    if (req.query.year) q = q.where('period_year', req.query.year);
    ok(res, await q.orderBy('expense_date', 'desc'));
  })
);

router.post(
  '/expenses',
  requireRoles(...FINANCE_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const orgId = req.user.organizationId || req.body.organizationId;
    const [id] = await db('expenses').insert({
      organization_id: orgId,
      property_id: req.body.propertyId,
      building_id: req.body.buildingId,
      expense_date: req.body.expenseDate,
      period_year: req.body.periodYear,
      period_month: req.body.periodMonth,
      category: req.body.category || 'other',
      amount: req.body.amount,
      supplier: req.body.supplier,
      description: req.body.description,
      created_by: req.user.id,
    });
    ok(res, { id }, 201);
  })
);

router.put(
  '/expenses/:id',
  requireRoles(...FINANCE_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    await db('expenses').where({ id: req.params.id }).update({
      expense_date: req.body.expenseDate,
      period_year: req.body.periodYear,
      period_month: req.body.periodMonth,
      category: req.body.category,
      amount: req.body.amount,
      building_id: req.body.buildingId,
      supplier: req.body.supplier,
      description: req.body.description,
      file_path: req.body.filePath,
      updated_at: db.fn.now(),
    });
    ok(res, await db('expenses').where({ id: req.params.id }).first());
  })
);

router.delete(
  '/expenses/:id',
  requireRoles(...FINANCE_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    await db('expenses').where({ id: req.params.id }).delete();
    ok(res, { deleted: true });
  })
);

module.exports = router;
