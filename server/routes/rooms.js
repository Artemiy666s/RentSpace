const express = require('express');
const { db } = require('../db');
const { authenticate, requireRoles } = require('../middlewares/auth');
const { requireOrgAccess } = require('../middlewares/orgAccess');
const {
  getRoomDetails,
  rentOutRoom,
  vacateRoom,
  changeRoomStatus,
  getRoomHistory,
  updateRoomLease,
  changeRoomTenant,
} = require('../services/roomService');
const asyncHandler = require('../utils/asyncHandler');
const { ok, fail } = require('../utils/response');

const router = express.Router();
router.use(authenticate, requireOrgAccess());

const { OPERATIONAL_WRITE_ROLES } = require('../constants/roles');
const ROOM_WRITE_ROLES = OPERATIONAL_WRITE_ROLES;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    let q = db('rooms as r')
      .join('buildings as b', 'b.id', 'r.building_id')
      .join('floors as f', 'f.id', 'r.floor_id')
      .leftJoin(
        db('contract_rooms as cr')
          .join('contracts as c', 'c.id', 'cr.contract_id')
          .join('tenants as t', 't.id', 'c.tenant_id')
          .where('c.status', 'active')
          .whereNull('cr.end_date')
          .select(
            'cr.room_id',
            't.name as tenant_name',
            't.id as tenant_id',
            'c.id as contract_id',
            'c.vat_rate',
            'cr.rate_without_vat as contract_rate_without_vat'
          )
          .as('active_lease'),
        'active_lease.room_id',
        'r.id'
      )
      .whereNull('r.deleted_at')
      .select(
        'r.*',
        'b.name as building_name',
        'f.name as floor_name',
        'active_lease.tenant_name',
        'active_lease.tenant_id',
        'active_lease.contract_id',
        'active_lease.vat_rate',
        'active_lease.contract_rate_without_vat'
      );

    if (req.query.propertyId) q = q.where('r.property_id', req.query.propertyId);
    if (req.query.buildingId) q = q.where('r.building_id', req.query.buildingId);
    if (req.query.floorId) q = q.where('r.floor_id', req.query.floorId);
    if (req.query.status) q = q.where('r.status', req.query.status);
    if (req.query.hasDebt === 'true') q = q.where('r.status', 'debt');
    if (req.query.freeOnly === 'true') q = q.whereIn('r.status', ['free', 'ready_for_rent']);
    if (req.query.search) {
      const s = `%${req.query.search}%`;
      q = q.where(function () {
        this.where('r.room_number', 'like', s)
          .orWhere('active_lease.tenant_name', 'like', s);
      });
    }
    ok(res, await q.orderBy('r.room_number'));
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const details = await getRoomDetails(req.params.id);
    if (!details) return fail(res, 'Не найдено', 404);
    ok(res, details);
  })
);

router.post(
  '/',
  requireRoles(...ROOM_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const [id] = await db('rooms').insert({
      property_id: req.body.propertyId,
      building_id: req.body.buildingId,
      floor_id: req.body.floorId,
      room_number: req.body.roomNumber,
      name: req.body.name,
      area: req.body.area,
      rentable_area: req.body.rentableArea ?? req.body.area,
      room_type: req.body.roomType || 'retail',
      status: req.body.status || 'free',
      recommended_rate_without_vat: req.body.recommendedRate,
      description: req.body.description,
    });
    ok(res, { id }, 201);
  })
);

router.put(
  '/:id',
  requireRoles(...ROOM_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const allowed = [
      'room_number',
      'name',
      'area',
      'rentable_area',
      'room_type',
      'status',
      'recommended_rate_without_vat',
      'current_rate_without_vat',
      'description',
    ];
    const upd = {};
    const map = {
      roomNumber: 'room_number',
      rentableArea: 'rentable_area',
      roomType: 'room_type',
      recommendedRate: 'recommended_rate_without_vat',
      currentRate: 'current_rate_without_vat',
    };
    for (const [k, v] of Object.entries(req.body)) {
      const col = map[k] || k;
      if (allowed.includes(col)) upd[col] = v;
    }
    if (upd.room_number) {
      const room = await db('rooms').where({ id: req.params.id }).first();
      const dup = await db('rooms')
        .where({
          floor_id: room.floor_id,
          room_number: upd.room_number,
        })
        .whereNot('id', req.params.id)
        .whereNull('deleted_at')
        .first();
      if (dup) return fail(res, 'Помещение с таким номером уже есть на этаже', 409);
    }
    upd.updated_at = db.fn.now();
    await db('rooms').where({ id: req.params.id }).update(upd);
    ok(res, await getRoomDetails(req.params.id));
  })
);

router.patch(
  '/:id/lease',
  requireRoles(...ROOM_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const room = await db('rooms').where({ id: req.params.id }).first();
    if (!room) return fail(res, 'Помещение не найдено', 404);
    try {
      await updateRoomLease({
        roomId: Number(req.params.id),
        tenantId: req.body.tenantId,
        rateWithoutVat: req.body.rateWithoutVat,
        vatRate: req.body.vatRate,
        userId: req.user.id,
        organizationId: req.user.organizationId,
        propertyId: room.property_id,
        ip: req.ip,
      });
      ok(res, await getRoomDetails(req.params.id));
    } catch (e) {
      if (e.status) return fail(res, e.message, e.status);
      throw e;
    }
  })
);

router.post(
  '/:id/change-status',
  requireRoles(...ROOM_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const room = await db('rooms').where({ id: req.params.id }).first();
    const orgId = req.user.organizationId || (await db('properties').where({ id: room.property_id }).first())?.organization_id;
    const details = await changeRoomStatus({
      roomId: Number(req.params.id),
      status: req.body.status,
      reason: req.body.reason,
      comment: req.body.comment,
      userId: req.user.id,
      organizationId: orgId,
      propertyId: room.property_id,
      ip: req.ip,
    });
    ok(res, details);
  })
);

router.post(
  '/:id/change-tenant',
  requireRoles(...ROOM_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const room = await db('rooms').where({ id: req.params.id }).first();
    if (!room) return fail(res, 'Помещение не найдено', 404);
    const orgId = req.user.organizationId || (await db('properties').where({ id: room.property_id }).first())?.organization_id;
    try {
      const result = await changeRoomTenant({
        roomId: Number(req.params.id),
        previousEndDate: req.body.previousEndDate,
        tenantId: req.body.tenantId,
        tenantPayload: req.body.tenant,
        contractNumber: req.body.contractNumber,
        contractDate: req.body.contractDate,
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        rateWithoutVat: req.body.rateWithoutVat,
        vatRate: req.body.vatRate,
        paymentDay: req.body.paymentDay,
        organizationId: orgId,
        propertyId: room.property_id,
        userId: req.user.id,
        ip: req.ip,
      });
      ok(res, { ...result, room: await getRoomDetails(req.params.id) });
    } catch (e) {
      if (e.status) return fail(res, e.message, e.status);
      throw e;
    }
  })
);

router.post(
  '/:id/rent-out',
  requireRoles(...ROOM_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const room = await db('rooms').where({ id: req.params.id }).first();
    if (!room) return fail(res, 'Помещение не найдено', 404);
    const orgId = req.user.organizationId || (await db('properties').where({ id: room.property_id }).first())?.organization_id;
    const result = await rentOutRoom({
      roomId: Number(req.params.id),
      tenantId: req.body.tenantId,
      tenantPayload: req.body.tenant,
      contractNumber: req.body.contractNumber,
      contractDate: req.body.contractDate,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      rateWithoutVat: req.body.rateWithoutVat,
      vatRate: req.body.vatRate,
      paymentDay: req.body.paymentDay,
      organizationId: orgId,
      propertyId: room.property_id,
      userId: req.user.id,
      ip: req.ip,
    });
    ok(res, { ...result, room: await getRoomDetails(req.params.id) });
  })
);

router.post(
  '/:id/vacate',
  requireRoles(...ROOM_WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const room = await db('rooms').where({ id: req.params.id }).first();
    const orgId = req.user.organizationId || (await db('properties').where({ id: room.property_id }).first())?.organization_id;
    await vacateRoom({
      roomId: Number(req.params.id),
      endDate: req.body.endDate,
      reason: req.body.reason,
      newStatus: req.body.newStatus,
      comment: req.body.comment,
      userId: req.user.id,
      organizationId: orgId,
      propertyId: room.property_id,
      ip: req.ip,
    });
    ok(res, await getRoomDetails(req.params.id));
  })
);

router.get(
  '/:id/history',
  asyncHandler(async (req, res) => {
    ok(res, await getRoomHistory(req.params.id));
  })
);

module.exports = router;
