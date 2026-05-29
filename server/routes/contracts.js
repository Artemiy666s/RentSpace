const express = require('express');
const dayjs = require('dayjs');
const { db } = require('../db');
const { authenticate, requireRoles } = require('../middlewares/auth');
const { requireOrgAccess } = require('../middlewares/orgAccess');
const { logActivity } = require('../utils/audit');
const asyncHandler = require('../utils/asyncHandler');
const { ok, fail } = require('../utils/response');
const { OPERATIONAL_ROLES } = require('../constants/roles');

const router = express.Router();
router.use(authenticate, requireOrgAccess());

router.get(
  '/',
  asyncHandler(async (req, res) => {
    let q = db('contracts as c')
      .join('tenants as t', 't.id', 'c.tenant_id')
      .select('c.*', 't.name as tenant_name');
    if (req.user.role !== 'super_admin') {
      q = q.where('c.organization_id', req.user.organizationId);
    }
    if (req.query.propertyId) q = q.where('c.property_id', req.query.propertyId);
    if (req.query.status) q = q.where('c.status', req.query.status);
    if (req.query.tab === 'expiring') {
      q = q.where('c.status', 'active')
        .where('c.end_date', '<=', dayjs().add(60, 'day').format('YYYY-MM-DD'))
        .where('c.end_date', '>=', dayjs().format('YYYY-MM-DD'));
    }
    ok(res, await q.orderBy('c.start_date', 'desc'));
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const contract = await db('contracts').where({ id: req.params.id }).first();
    if (!contract) return fail(res, 'Не найдено', 404);
    const tenant = await db('tenants').where({ id: contract.tenant_id }).first();
    const rooms = await db('contract_rooms as cr')
      .join('rooms as r', 'r.id', 'cr.room_id')
      .where('cr.contract_id', contract.id)
      .select('cr.*', 'r.room_number', 'r.area as room_area', 'r.status');
    ok(res, { contract, tenant, rooms });
  })
);

router.post(
  '/',
  requireRoles(...OPERATIONAL_ROLES),
  asyncHandler(async (req, res) => {
    const orgId = req.user.organizationId || req.body.organizationId;
    const [id] = await db('contracts').insert({
      organization_id: orgId,
      property_id: req.body.propertyId,
      tenant_id: req.body.tenantId,
      contract_number: req.body.contractNumber,
      contract_date: req.body.contractDate,
      start_date: req.body.startDate,
      end_date: req.body.endDate,
      rate_without_vat: req.body.rateWithoutVat,
      vat_rate: req.body.vatRate ?? 20,
      payment_day: req.body.paymentDay,
      security_deposit: req.body.securityDeposit,
      status: req.body.status || 'active',
      comment: req.body.comment,
    });

    if (req.body.roomIds?.length) {
      for (const roomId of req.body.roomIds) {
        const room = await db('rooms').where({ id: roomId }).first();
        await db('contract_rooms').insert({
          contract_id: id,
          room_id: roomId,
          area: room?.rentable_area || room?.area,
          rate_without_vat: req.body.rateWithoutVat,
          start_date: req.body.startDate,
          end_date: req.body.endDate,
        });
        await db('rooms').where({ id: roomId }).update({
          status: 'occupied',
          current_rate_without_vat: req.body.rateWithoutVat,
        });
      }
    }

    ok(res, { id }, 201);
  })
);

router.post(
  '/:id/terminate',
  requireRoles(...OPERATIONAL_ROLES),
  asyncHandler(async (req, res) => {
    const endDate = req.body.endDate || dayjs().format('YYYY-MM-DD');
    await db('contracts').where({ id: req.params.id }).update({
      status: 'terminated',
      actual_end_date: endDate,
      updated_at: db.fn.now(),
    });
    const links = await db('contract_rooms').where({ contract_id: req.params.id });
    for (const link of links) {
      await db('contract_rooms').where({ id: link.id }).update({ end_date: endDate });
      await db('rooms').where({ id: link.room_id }).update({ status: 'free', current_rate_without_vat: null });
    }
    ok(res, { terminated: true });
  })
);

module.exports = router;
