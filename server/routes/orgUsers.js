const express = require('express');
const { z } = require('zod');
const { authenticate, requireRoles } = require('../middlewares/auth');
const { ORG_USER_ADMIN_ROLES } = require('../constants/roles');
const orgUserService = require('../services/orgUserService');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

const createSchema = z.object({
  name: z.string().trim().min(2).max(255),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(255),
  password: z.string().min(8),
  role: z.string().trim().min(1),
  organizationId: z.coerce.number().int().positive().optional(),
});

function validationErrorCode(parsed) {
  const paths = parsed.error.issues.map((i) => i.path[0]);
  if (paths.includes('email')) return 'invalid_email';
  if (paths.includes('password')) return 'invalid_password';
  return 'invalid_data';
}

const updateSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  role: z.string().min(1).optional(),
  status: z.enum(['active', 'blocked', 'archived']).optional(),
});

const passwordSchema = z.object({
  newPassword: z.string().min(8),
});

function mapError(err, res) {
  const code = err.message;
  const status = err.status || 500;
  const known = {
    email_taken: 'email_taken',
    role_not_allowed: 'role_not_allowed',
    organization_required: 'organization_required',
    organization_missing: 'organization_missing',
    cannot_change_own_role: 'cannot_change_own_role',
    cannot_block_self: 'cannot_block_self',
    not_found: 'not_found',
    forbidden: 'forbidden',
  };
  if (known[code]) {
    return res.status(status).json({ success: false, error: known[code] });
  }
  return res.status(500).json({ success: false, error: 'server_error' });
}

router.get(
  '/users',
  authenticate,
  requireRoles(...ORG_USER_ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    try {
      const orgId = req.query.organizationId;
      const data = await orgUserService.listOrgUsers(req.user, orgId);
      res.json({ success: true, data });
    } catch (err) {
      mapError(err, res);
    }
  })
);

router.get(
  '/users/assignable-roles',
  authenticate,
  requireRoles(...ORG_USER_ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const roles = orgUserService.assignableRolesFor(req.user.role);
    res.json({ success: true, data: { roles } });
  })
);

router.post(
  '/users',
  authenticate,
  requireRoles(...ORG_USER_ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: validationErrorCode(parsed) });
    }
    try {
      const user = await orgUserService.createOrgUser(req.user, parsed.data);
      res.status(201).json({ success: true, data: { user } });
    } catch (err) {
      mapError(err, res);
    }
  })
);

router.patch(
  '/users/:id',
  authenticate,
  requireRoles(...ORG_USER_ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'invalid_data' });
    }
    try {
      const user = await orgUserService.updateOrgUser(req.user, Number(req.params.id), parsed.data);
      res.json({ success: true, data: { user } });
    } catch (err) {
      mapError(err, res);
    }
  })
);

router.patch(
  '/users/:id/password',
  authenticate,
  requireRoles(...ORG_USER_ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const parsed = passwordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'invalid_password' });
    }
    try {
      await orgUserService.resetOrgUserPassword(
        req.user,
        Number(req.params.id),
        parsed.data.newPassword
      );
      res.json({ success: true, message: 'password_reset' });
    } catch (err) {
      mapError(err, res);
    }
  })
);

module.exports = router;
