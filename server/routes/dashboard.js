const express = require('express');
const { authenticate } = require('../middlewares/auth');
const { requireOrgAccess } = require('../middlewares/orgAccess');
const { getDirectorDashboard, getManagerDashboard } = require('../services/dashboardService');
const { db } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');

const router = express.Router();
router.use(authenticate, requireOrgAccess());

async function resolveOrg(req, propertyId) {
  const prop = await db('properties').where({ id: propertyId }).first();
  return prop?.organization_id || req.user.organizationId;
}

router.get(
  '/director',
  asyncHandler(async (req, res) => {
    const propertyId = req.query.propertyId;
    const orgId = await resolveOrg(req, propertyId);
    ok(res, await getDirectorDashboard(propertyId, orgId));
  })
);

router.get(
  '/manager',
  asyncHandler(async (req, res) => {
    const propertyId = req.query.propertyId;
    const orgId = await resolveOrg(req, propertyId);
    ok(res, await getManagerDashboard(propertyId, orgId));
  })
);

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const propertyId = req.query.propertyId;
    const orgId = await resolveOrg(req, propertyId);
    ok(res, await getDirectorDashboard(propertyId, orgId));
  })
);

router.get(
  '/events',
  asyncHandler(async (req, res) => {
    let q = db('activity_events').orderBy('created_at', 'desc').limit(30);
    if (req.query.propertyId) q = q.where('property_id', req.query.propertyId);
    if (req.user.role !== 'super_admin') q = q.where('organization_id', req.user.organizationId);
    ok(res, await q);
  })
);

module.exports = router;
