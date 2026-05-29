const express = require('express');
const { db } = require('../db');
const { authenticate, requireRoles } = require('../middlewares/auth');
const { requireOrgAccess } = require('../middlewares/orgAccess');
const { excelUpload } = require('../middlewares/upload');
const { processExcelImport } = require('../services/importService');
const asyncHandler = require('../utils/asyncHandler');
const { ok, fail } = require('../utils/response');
const { ORG_DATA_ADMIN_ROLES } = require('../constants/roles');

const router = express.Router();
router.use(authenticate, requireOrgAccess());

router.post(
  '/excel',
  requireRoles(...ORG_DATA_ADMIN_ROLES),
  excelUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return fail(res, 'Файл не загружен');
    const orgId = req.user.organizationId || Number(req.body.organizationId);
    const propertyId = Number(req.body.propertyId);
    if (!orgId || !propertyId) return fail(res, 'organizationId и propertyId обязательны');

    const result = await processExcelImport(
      req.file.path,
      req.file.originalname,
      orgId,
      propertyId,
      req.user.id
    );
    ok(res, result, 201);
  })
);

router.get(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const batch = await db('import_batches').where({ id: req.params.id }).first();
    if (!batch) return fail(res, 'Не найдено', 404);
    ok(res, batch);
  })
);

router.get(
  '/:id/errors',
  asyncHandler(async (req, res) => {
    const rows = await db('import_errors').where({ import_batch_id: req.params.id });
    ok(res, rows);
  })
);

router.get(
  '/:id/summary',
  asyncHandler(async (req, res) => {
    const batch = await db('import_batches').where({ id: req.params.id }).first();
    if (!batch) return fail(res, 'Не найдено', 404);
    ok(res, {
      summary: batch.summary_json ? JSON.parse(batch.summary_json) : null,
      status: batch.status,
    });
  })
);

module.exports = router;
