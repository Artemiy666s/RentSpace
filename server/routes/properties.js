const express = require('express');
const { db } = require('../db');
const { authenticate, requireRoles } = require('../middlewares/auth');
const { requireOrgAccess, scopeQuery } = require('../middlewares/orgAccess');
const asyncHandler = require('../utils/asyncHandler');
const { ok, fail } = require('../utils/response');
const { PROPERTY_ADMIN_ROLES } = require('../constants/roles');

const router = express.Router();
router.use(authenticate, requireOrgAccess());

router.get(
  '/organizations',
  asyncHandler(async (req, res) => {
    let q = db('organizations').where('status', 'active');
    if (req.user.role !== 'super_admin') {
      q = q.where('id', req.user.organizationId);
    }
    ok(res, await q);
  })
);

router.get(
  '/properties',
  asyncHandler(async (req, res) => {
    let q = db('properties').where('status', 'active');
    q = scopeQuery(q, req.user);
    ok(res, await q);
  })
);

router.get(
  '/properties/:id',
  asyncHandler(async (req, res) => {
    const row = await db('properties').where({ id: req.params.id }).first();
    if (!row) return fail(res, 'Не найдено', 404);
    ok(res, row);
  })
);

router.get(
  '/properties/:propertyId/buildings',
  asyncHandler(async (req, res) => {
    const rows = await db('buildings').where({ property_id: req.params.propertyId });
    ok(res, rows);
  })
);

router.post(
  '/buildings',
  requireRoles(...PROPERTY_ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const [id] = await db('buildings').insert({
      property_id: req.body.propertyId,
      name: req.body.name,
      code: req.body.code,
      address: req.body.address,
      description: req.body.description,
    });
    ok(res, { id }, 201);
  })
);

router.put(
  '/buildings/:buildingId',
  requireRoles(...PROPERTY_ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const buildingId = Number(req.params.buildingId);
    const existing = await db('buildings').where({ id: buildingId }).first();
    if (!existing) return fail(res, 'Здание не найдено', 404);

    await db('buildings')
      .where({ id: buildingId })
      .update({
        name: req.body.name ?? existing.name,
        code: req.body.code ?? existing.code,
        address: req.body.address ?? existing.address,
        description: req.body.description ?? existing.description,
        updated_at: db.fn.now(),
      });

    ok(res, await db('buildings').where({ id: buildingId }).first());
  })
);

router.delete(
  '/buildings/:buildingId',
  requireRoles(...PROPERTY_ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const buildingId = Number(req.params.buildingId);
    const existing = await db('buildings').where({ id: buildingId }).first();
    if (!existing) return fail(res, 'Здание не найдено', 404);

    await db('buildings').where({ id: buildingId }).delete();
    ok(res, { deleted: true });
  })
);

router.get(
  '/buildings/:buildingId/floors',
  asyncHandler(async (req, res) => {
    const rows = await db('floors').where({ building_id: req.params.buildingId }).orderBy('level_number');
    ok(res, rows);
  })
);

router.post(
  '/floors',
  requireRoles(...PROPERTY_ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const [id] = await db('floors').insert({
      building_id: req.body.buildingId,
      name: req.body.name,
      level_number: req.body.levelNumber ?? 1,
      description: req.body.description,
    });
    ok(res, { id }, 201);
  })
);

router.put(
  '/floors/:floorId',
  requireRoles(...PROPERTY_ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const floorId = Number(req.params.floorId);
    const existing = await db('floors').where({ id: floorId }).first();
    if (!existing) return fail(res, 'Этаж не найден', 404);

    await db('floors')
      .where({ id: floorId })
      .update({
        name: req.body.name ?? existing.name,
        level_number: req.body.levelNumber ?? existing.level_number,
        description: req.body.description ?? existing.description,
        updated_at: db.fn.now(),
      });

    ok(res, await db('floors').where({ id: floorId }).first());
  })
);

router.delete(
  '/floors/:floorId',
  requireRoles(...PROPERTY_ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const floorId = Number(req.params.floorId);
    const existing = await db('floors').where({ id: floorId }).first();
    if (!existing) return fail(res, 'Этаж не найден', 404);

    await db('floors').where({ id: floorId }).delete();
    ok(res, { deleted: true });
  })
);

router.get(
  '/floors/:id',
  asyncHandler(async (req, res) => {
    const row = await db('floors').where({ id: req.params.id }).first();
    if (!row) return fail(res, 'Не найдено', 404);
    ok(res, row);
  })
);

module.exports = router;
