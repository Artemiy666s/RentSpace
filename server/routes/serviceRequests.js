const express = require('express');
const { db } = require('../db');
const { authenticate } = require('../middlewares/auth');
const { requireOrgAccess } = require('../middlewares/orgAccess');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');

const router = express.Router();
router.use(authenticate, requireOrgAccess());

router.get(
  '/',
  asyncHandler(async (req, res) => {
    let q = db('service_requests').orderBy('created_at', 'desc');
    if (req.query.propertyId) q = q.where('property_id', req.query.propertyId);
    if (req.user.role !== 'super_admin') q = q.where('organization_id', req.user.organizationId);
    ok(res, await q);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const orgId = req.user.organizationId || req.body.organizationId;
    const [id] = await db('service_requests').insert({
      organization_id: orgId,
      property_id: req.body.propertyId,
      room_id: req.body.roomId,
      tenant_id: req.body.tenantId,
      title: req.body.title,
      description: req.body.description,
      priority: req.body.priority || 'medium',
      created_by: req.user.id,
    });
    ok(res, { id }, 201);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    await db('service_requests').where({ id: req.params.id }).update({
      status: req.body.status,
      assigned_to: req.body.assignedTo,
      updated_at: db.fn.now(),
    });
    ok(res, await db('service_requests').where({ id: req.params.id }).first());
  })
);

module.exports = router;
