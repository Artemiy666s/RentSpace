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
    let q = db('activity_events').orderBy('created_at', 'desc').limit(50);
    if (req.query.propertyId) q = q.where('property_id', req.query.propertyId);
    if (req.user.role !== 'super_admin') q = q.where('organization_id', req.user.organizationId);
    ok(res, await q);
  })
);

module.exports = router;
