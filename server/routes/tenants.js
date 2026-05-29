const express = require('express');
const { db } = require('../db');
const { authenticate, requireRoles } = require('../middlewares/auth');
const { requireOrgAccess, scopeQuery } = require('../middlewares/orgAccess');
const { listTenantContractOverview } = require('../services/managerDataService');
const { buildTenantContractsWorkbook } = require('../services/reportService');
const asyncHandler = require('../utils/asyncHandler');
const { ok, fail } = require('../utils/response');

const router = express.Router();
router.use(authenticate, requireOrgAccess());

const { OPERATIONAL_WRITE_ROLES, FINANCE_WRITE_ROLES } = require('../constants/roles');
const WRITE_ROLES = OPERATIONAL_WRITE_ROLES;

async function findTenant(id, user) {
  let q = db('tenants').where({ id }).whereNull('deleted_at');
  if (user.role !== 'super_admin') {
    q = q.where('organization_id', user.organizationId);
  }
  return q.first();
}

router.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const orgId = req.user.role === 'super_admin' ? null : req.user.organizationId;
    ok(
      res,
      await listTenantContractOverview(
        {
          propertyId: req.query.propertyId,
          tab: req.query.tab,
          year: req.query.year,
          sort: req.query.sort,
          fromMonth: req.query.fromMonth,
          fromYear: req.query.fromYear,
          toMonth: req.query.toMonth,
          toYear: req.query.toYear,
        },
        orgId
      )
    );
  })
);

router.get(
  '/overview/export/xlsx',
  asyncHandler(async (req, res) => {
    const orgId = req.user.role === 'super_admin' ? null : req.user.organizationId;
    const wb = await buildTenantContractsWorkbook(
      {
        propertyId: req.query.propertyId,
        tab: req.query.tab,
        year: req.query.year,
        sort: req.query.sort,
        fromMonth: req.query.fromMonth,
        fromYear: req.query.fromYear,
        toMonth: req.query.toMonth,
        toYear: req.query.toYear,
      },
      orgId
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename=tenants-contracts.xlsx');
    await wb.xlsx.write(res);
    res.end();
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    let q = db('tenants').whereNull('deleted_at');
    q = scopeQuery(q, req.user);
    if (req.query.status) q = q.where('status', req.query.status);
    if (req.query.search) {
      q = q.where('name', 'like', `%${req.query.search}%`);
    }
    ok(res, await q.orderBy('name'));
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const tenant = await findTenant(req.params.id, req.user);
    if (!tenant) return fail(res, 'Не найдено', 404);
    const contracts = await db('contracts').where({ tenant_id: tenant.id }).orderBy('start_date', 'desc');
    const rooms = await db('contract_rooms as cr')
      .join('rooms as r', 'r.id', 'cr.room_id')
      .join('contracts as c', 'c.id', 'cr.contract_id')
      .where('c.tenant_id', tenant.id)
      .select('r.*', 'cr.area as contract_area', 'c.contract_number', 'c.status as contract_status');
    ok(res, { tenant, contracts, rooms });
  })
);

router.post(
  '/',
  requireRoles(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (!name) return fail(res, 'Укажите название арендатора', 400);
    const orgId = req.user.organizationId || req.body.organizationId;
    if (!orgId) return fail(res, 'Организация не назначена', 400);
    const [id] = await db('tenants').insert({
      organization_id: orgId,
      name,
      legal_type: req.body.legalType || 'other',
      unp: req.body.unp,
      contact_person: req.body.contactPerson,
      phone: req.body.phone,
      email: req.body.email,
      legal_address: req.body.legalAddress,
      activity_type: req.body.activityType,
      status: 'active',
      comment: req.body.comment,
    });
    ok(res, { id }, 201);
  })
);

router.put(
  '/:id',
  requireRoles(...FINANCE_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const existing = await findTenant(req.params.id, req.user);
    if (!existing) return fail(res, 'Не найдено', 404);
    const upd = { updated_at: db.fn.now() };
    const fields = ['name', 'legal_type', 'unp', 'contact_person', 'phone', 'email', 'legal_address', 'activity_type', 'status', 'comment'];
    const map = { legalType: 'legal_type', contactPerson: 'contact_person', legalAddress: 'legal_address', activityType: 'activity_type' };
    for (const [k, v] of Object.entries(req.body)) {
      const col = map[k] || k;
      if (fields.includes(col)) upd[col] = v;
    }
    if (req.body.name != null) {
      const name = String(req.body.name).trim();
      if (!name) return fail(res, 'Укажите название арендатора', 400);
      upd.name = name;
    }
    await db('tenants').where({ id: req.params.id }).update(upd);
    ok(res, await db('tenants').where({ id: req.params.id }).first());
  })
);

router.delete(
  '/:id',
  requireRoles(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const tenant = await findTenant(req.params.id, req.user);
    if (!tenant) return fail(res, 'Не найдено', 404);

    const hasContracts = await db('contracts')
      .where({ tenant_id: tenant.id })
      .whereNull('deleted_at')
      .whereIn('status', ['active', 'draft', 'expiring'])
      .first();

    if (hasContracts) {
      return fail(res, 'Нельзя удалить: у арендатора есть активные договоры', 400);
    }

    await db('tenants').where({ id: tenant.id }).update({
      deleted_at: db.fn.now(),
      status: 'archived',
      updated_at: db.fn.now(),
    });

    ok(res, { deleted: true });
  })
);

module.exports = router;
